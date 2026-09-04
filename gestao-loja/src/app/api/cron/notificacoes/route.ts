import { segredoConfere } from "@/lib/secrets";
import { prisma } from "@/lib/prisma";
import {
  syncLodgeNotifications,
  limparNotificacoesEventoAntigas,
} from "@/lib/notifications";
import { syncInadimplencia } from "@/lib/inadimplencia";
import { enviarLembretesEmail } from "@/lib/lembretes-email";
import { logInfo, logError, alertaCritico } from "@/lib/log";
import { enfileirar } from "@/lib/fila";
import { mesAnterior } from "@/lib/resumo-mensal";

// Varredura diária da central de notificações (cron do servidor).
// Garante que alertas por data — aniversários, prazos de 15 dias,
// interstícios — apareçam sem depender de alguém abrir a Secretaria.
// Autenticação por segredo compartilhado no header `x-cron-secret`.

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || !segredoConfere(request.headers.get("x-cron-secret"), secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const lodges = await prisma.lodge.findMany({ select: { id: true } });
  let emails = 0;
  const falhas: string[] = [];

  // Dia 1º: enfileira o resumo mensal do mês fechado (VM + Secretário).
  // A checagem do job existente evita duplicar se o cron rodar de novo.
  // Dia calculado no fuso da Loja (America/Sao_Paulo) — em UTC o servidor
  // vira o dia 1º três horas antes e o resumo sairia no dia errado.
  const hojeSp = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date()); // "AAAA-MM-DD"
  if (hojeSp.endsWith("-01")) {
    const { ano, mes } = mesAnterior(new Date(`${hojeSp}T12:00:00`));
    for (const lodge of lodges) {
      try {
        const payload = { lodgeId: lodge.id, ano: String(ano), mes: String(mes) };
        const jaEnfileirado = await prisma.job.findFirst({
          where: { tipo: "resumo.mensal", lodgeId: lodge.id, payload: { equals: payload } },
          select: { id: true },
        });
        if (!jaEnfileirado) await enfileirar("resumo.mensal", payload);
      } catch (e) {
        logError("cron.resumo-mensal.enfileirar-falhou", e, { lodgeId: lodge.id });
      }
    }
  }

  for (const lodge of lodges) {
    // falha numa loja não pode derrubar a varredura das demais
    try {
      // inadimplência automática antes da varredura (as notificações de
      // Esmoler/Tesoureiro dependem das capitações já marcadas VENCIDA)
      try {
        await syncInadimplencia(lodge.id);
      } catch (e) {
        logError("cron.notificacoes.inadimplencia-falhou", e, { lodgeId: lodge.id });
      }
      await syncLodgeNotifications(lodge.id);
      await prisma.lodge.update({
        where: { id: lodge.id },
        data: { notificacoesSyncAt: new Date() },
      });
      await limparNotificacoesEventoAntigas(lodge.id);
      const r = await enviarLembretesEmail(lodge.id);
      emails += r.sent;
    } catch (e) {
      falhas.push(lodge.id);
      logError("cron.notificacoes.loja-falhou", e, { lodgeId: lodge.id });
    }
  }
  if (falhas.length) {
    await alertaCritico("cron.notificacoes.falhas-parciais", undefined, {
      falhas,
      lodges: lodges.length,
    });
  } else {
    logInfo("cron.notificacoes.fim", { lodges: lodges.length, emails });
  }
  return Response.json({ ok: true, lodges: lodges.length, emails, falhas });
}
