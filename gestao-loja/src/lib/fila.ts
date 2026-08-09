import { prisma } from "@/lib/prisma";
import { logInfo, logError, alertaCritico } from "@/lib/log";
import {
  enviarConvitesSessao,
  enviarMinutaAtaValidacao,
  enviarAtaAssinadaAosMembros,
} from "@/lib/envios";

// Fila persistente (#13): tabela jobs no Postgres, worker disparado por
// /api/cron/fila (systemd timer, a cada minuto). Payloads carregam só ids —
// o handler recarrega o estado atual do banco na hora de executar.
// Retry com backoff exponencial (2^tentativas minutos); esgotado → FALHOU
// + alerta ao operador.

type Payload = Record<string, string>;

const handlers: Record<string, (p: Payload) => Promise<void>> = {
  "sessao.convites": (p) => enviarConvitesSessao(p.lodgeId, p.sessionId),
  "ata.minuta-validacao": (p) => enviarMinutaAtaValidacao(p.lodgeId, p.ataId),
  "ata.enviar-membros": (p) =>
    enviarAtaAssinadaAosMembros(p.lodgeId, p.ataId, p.solicitanteId),
};

export async function enfileirar(
  tipo: keyof typeof handlers,
  payload: Payload,
  opts?: { executarEm?: Date }
) {
  const job = await prisma.job.create({
    data: {
      tipo,
      payload,
      lodgeId: payload.lodgeId ?? null,
      executarEm: opts?.executarEm ?? new Date(),
    },
  });
  logInfo("fila.enfileirado", { jobId: job.id, tipo, lodgeId: payload.lodgeId });
  return job.id;
}

// Processa até `limite` jobs vencidos. Claim atômico por updateMany
// (single-instance; se um dia houver mais workers, trocar por
// SELECT ... FOR UPDATE SKIP LOCKED).
export async function processarFila(limite = 10) {
  const devidos = await prisma.job.findMany({
    where: { status: "PENDENTE", executarEm: { lte: new Date() } },
    orderBy: { executarEm: "asc" },
    take: limite,
    select: { id: true },
  });

  let ok = 0;
  let reagendados = 0;
  let esgotados = 0;
  for (const { id } of devidos) {
    const claimed = await prisma.job.updateMany({
      where: { id, status: "PENDENTE" },
      data: { status: "PROCESSANDO", tentativas: { increment: 1 } },
    });
    if (claimed.count === 0) continue; // outro worker levou

    const job = await prisma.job.findUniqueOrThrow({ where: { id } });
    const handler = handlers[job.tipo];
    try {
      if (!handler) throw new Error(`Handler desconhecido: ${job.tipo}`);
      await handler(job.payload as Payload);
      await prisma.job.update({
        where: { id },
        data: { status: "OK", ultimoErro: null },
      });
      ok++;
      logInfo("fila.ok", { jobId: id, tipo: job.tipo, tentativa: job.tentativas });
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e);
      if (job.tentativas >= job.maxTentativas || !handler) {
        await prisma.job.update({
          where: { id },
          data: { status: "FALHOU", ultimoErro: erro },
        });
        esgotados++;
        await alertaCritico("fila.job-esgotou-tentativas", e, {
          jobId: id,
          tipo: job.tipo,
          lodgeId: job.lodgeId,
          tentativas: job.tentativas,
        });
      } else {
        const atrasoMin = 2 ** job.tentativas; // 2, 4, 8, 16, 32 min
        await prisma.job.update({
          where: { id },
          data: {
            status: "PENDENTE",
            ultimoErro: erro,
            executarEm: new Date(Date.now() + atrasoMin * 60_000),
          },
        });
        reagendados++;
        logError("fila.job-falhou-reagendado", e, {
          jobId: id,
          tipo: job.tipo,
          tentativa: job.tentativas,
          proximaEmMin: atrasoMin,
        });
      }
    }
  }
  return { processados: devidos.length, ok, reagendados, esgotados };
}
