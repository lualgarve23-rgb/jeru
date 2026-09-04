import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncInadimplencia } from "@/lib/inadimplencia";
import { syncLodgeNotifications } from "@/lib/notifications";
import { logError } from "@/lib/log";

// Pós-evento da loja: toda server action/rota que cria, avança, assina, nega,
// envia ou exclui algo chama isto no fim. Roda a inadimplência automática e
// a varredura da central de notificações, para o sino de cada cargo refletir
// a nova etapa na hora — sem depender de VM/Secretário abrirem o dashboard
// ou do cron diário.
//
// Agendado com `after()` do Next (executa depois de a resposta ser enviada,
// sem atrasar o clique); fora de um contexto de request cai para execução
// direta. Chamadas repetidas para a mesma loja no mesmo tick são coalescidas.

const agendadas = new Set<string>();

export async function sincronizarLoja(lodgeId: string) {
  try {
    await syncInadimplencia(lodgeId);
  } catch (e) {
    logError("apos-evento.inadimplencia", e, { lodgeId });
  }
  try {
    await syncLodgeNotifications(lodgeId);
    await prisma.lodge.update({
      where: { id: lodgeId },
      data: { notificacoesSyncAt: new Date() },
    });
  } catch (e) {
    logError("apos-evento.notificacoes", e, { lodgeId });
  }
}

export function aposEventoDaLoja(lodgeId: string): void {
  if (!lodgeId || agendadas.has(lodgeId)) return;
  agendadas.add(lodgeId);
  const rodar = async () => {
    agendadas.delete(lodgeId);
    await sincronizarLoja(lodgeId);
  };
  try {
    after(rodar);
  } catch {
    // sem request em andamento (ex.: evento de login, script): roda direto
    void rodar();
  }
}

// Sync com throttle (login de qualquer perfil): só roda se a última
// varredura da loja tiver mais de `minutos` minutos.
export async function sincronizarLojaSeAntiga(lodgeId: string, minutos = 10) {
  try {
    const lodge = await prisma.lodge.findUnique({
      where: { id: lodgeId },
      select: { notificacoesSyncAt: true },
    });
    if (!lodge) return;
    const idade = Date.now() - (lodge.notificacoesSyncAt?.getTime() ?? 0);
    if (idade < minutos * 60_000) return;
    // marca antes de rodar: dois logins simultâneos não disparam duas varreduras
    await prisma.lodge.update({
      where: { id: lodgeId },
      data: { notificacoesSyncAt: new Date() },
    });
    await sincronizarLoja(lodgeId);
  } catch (e) {
    logError("apos-evento.login", e, { lodgeId });
  }
}
