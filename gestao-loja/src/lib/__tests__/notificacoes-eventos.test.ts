import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cargosDaNotificacao } from "@/lib/notificacao-destinatarios";

/**
 * Notificações por evento (auditoria de produto #1, #2, #3, #8):
 *  - toda server action de escrita dispara a varredura da loja
 *    (aposEventoDaLoja) — o sino reflete a etapa nova na hora;
 *  - PREFIXOS_EVENTO cobre todas as sourceKeys gravadas fora da varredura
 *    (senão o sync apagaria os avisos de evento);
 *  - mapa sourceKey → cargo da vez para o e-mail;
 *  - rota /n/<id> marca como lida com isolamento por loja/destinatário.
 */
const root = path.resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(path.join(root, rel), "utf8");

const ACTIONS_ESCRITA = [
  "app/(app)/secretaria/_actions/atestados.ts",
  "app/(app)/secretaria/_actions/quitte.ts",
  "app/(app)/secretaria/_actions/afastamentos.ts",
  "app/(app)/secretaria/_actions/processos.ts",
  "app/(app)/secretaria/_actions/atas.ts",
  "app/(app)/secretaria/_actions/admissao.ts",
  "app/(app)/secretaria/_actions/progressao.ts",
  "app/(app)/solicitacoes/afastamento/actions.ts",
  "app/(app)/tesouraria/actions.ts",
];

describe("aposEventoDaLoja em toda action de escrita", () => {
  for (const rel of ACTIONS_ESCRITA) {
    it(`${rel}: cada action que revalida também sincroniza a loja`, () => {
      const src = ler(rel);
      expect(src.includes('from "@/lib/apos-evento"')).toBe(true);
      const blocos = src.split(/^export async function /m).slice(1);
      const semSync = blocos
        .filter((b) => /revalidatePath\(|revalidar\(\)/.test(b))
        .filter((b) => !b.includes("aposEventoDaLoja("))
        .map((b) => b.split("(")[0]);
      expect(semSync).toEqual([]);
    });
  }

  it("callback gov.br sincroniza após cada assinatura (ata, processo, quitte, atestado, afastamento)", () => {
    const src = ler("app/api/govbr/callback/route.ts");
    expect(src.match(/aposEventoDaLoja\(/g)?.length).toBe(5);
    for (const ev of ["eventoAtestado(", "eventoQuitte(", "eventoAfastamento(", "eventoProcessoConcluido(", "eventoAtaAssinada("]) {
      expect(src.includes(ev)).toBe(true);
    }
  });

  it("cron diário roda a inadimplência e limpa eventos antigos antes do e-mail", () => {
    const src = ler("app/api/cron/notificacoes/route.ts");
    expect(src.indexOf("syncInadimplencia(")).toBeGreaterThan(0);
    expect(src.indexOf("syncInadimplencia(")).toBeLessThan(src.indexOf("syncLodgeNotifications("));
    expect(src.includes("limparNotificacoesEventoAntigas(")).toBe(true);
  });

  it("login dispara o sync da loja com throttle", () => {
    const src = ler("auth.ts");
    expect(src.includes("sincronizarLojaSeAntiga(")).toBe(true);
    expect(ler("lib/apos-evento.ts").includes("notificacoesSyncAt")).toBe(true);
  });
});

describe("PREFIXOS_EVENTO protege as notificações gravadas fora da varredura", () => {
  const notif = ler("lib/notifications.ts");
  const prefixos = [...notif.matchAll(/^\s+"([a-z-]+:)",$/gm)].map((m) => m[1]);

  it("lista exportada e usada no deleteMany do sync", () => {
    expect(prefixos.length).toBeGreaterThanOrEqual(7);
    expect(notif.includes("export const PREFIXOS_EVENTO")).toBe(true);
    expect(notif.includes("NOT: { OR: PREFIXOS_EVENTO.map(")).toBe(true);
  });

  const FONTES = [
    "lib/status-membro.ts",
    "lib/settle-invoice.ts",
    "lib/inadimplencia.ts",
    "lib/eventos-solicitacoes.ts",
    "app/(app)/dashboard/privacidade/actions.ts",
    "app/(app)/tesouraria/actions.ts",
  ];
  for (const rel of FONTES) {
    it(`${rel}: toda sourceKey de evento começa por um prefixo protegido`, () => {
      const src = ler(rel);
      const chaves = [...src.matchAll(/sourceKey: `([a-z-]+:)/g)].map((m) => m[1]);
      // status-membro monta a chave a partir de `base` = status:...
      if (src.includes("const base = `status:")) chaves.push("status:");
      expect(chaves.length).toBeGreaterThan(0);
      for (const c of chaves) expect(prefixos).toContain(c);
    });
  }
});

describe("cargosDaNotificacao — e-mail só ao cargo da vez", () => {
  it("atestado: Tesoureiro → Secretário → VM", () => {
    expect(cargosDaNotificacao("atestado:x:tes")).toEqual(["TESOUREIRO"]);
    expect(cargosDaNotificacao("atestado:x:sec")).toEqual(["SECRETARIO"]);
    expect(cargosDaNotificacao("atestado:x:vm")).toEqual(["VENERAVEL_MESTRE"]);
  });
  it("afastamento e despesa", () => {
    expect(cargosDaNotificacao("afastamento:x:sec")).toEqual(["SECRETARIO"]);
    expect(cargosDaNotificacao("afastamento:x:vm")).toEqual(["VENERAVEL_MESTRE"]);
    expect(cargosDaNotificacao("afastamento:x:sessao")).toEqual(["VENERAVEL_MESTRE", "SECRETARIO"]);
    expect(cargosDaNotificacao("despesa:x:vm")).toEqual(["VENERAVEL_MESTRE"]);
    expect(cargosDaNotificacao("despesa:x:tes")).toEqual(["TESOUREIRO"]);
  });
  it("quitte: trava financeira ao Tesoureiro; Orador só pela dirigida", () => {
    expect(cargosDaNotificacao("qp-fin:x")).toEqual(["TESOUREIRO"]);
    expect(cargosDaNotificacao("qp-sig:x:SECRETARIO")).toEqual(["SECRETARIO"]);
    expect(cargosDaNotificacao("qp-sig:x:ORADOR")).toEqual([]);
    expect(cargosDaNotificacao("qp-sig:x:VENERAVEL_MESTRE")).toEqual(["VENERAVEL_MESTRE"]);
  });
  it("processo genérico: cargo pelo título; leitura inclui o Conselho; padrão VM+Sec", () => {
    expect(cargosDaNotificacao("processo:x:2", "Ofício aguarda assinatura do Tesoureiro")).toEqual(["TESOUREIRO"]);
    expect(cargosDaNotificacao("processo:x:1", "Ofício aguarda assinatura do Orador")).toEqual(["VENERAVEL_MESTRE", "SECRETARIO"]);
    expect(cargosDaNotificacao("intersticio:x:MESTRE")).toContain("CONSELHO_CONTAS");
    expect(cargosDaNotificacao("ata:x")).toEqual(["VENERAVEL_MESTRE", "SECRETARIO"]);
    expect(cargosDaNotificacao(null)).toEqual(["VENERAVEL_MESTRE", "SECRETARIO"]);
  });
});

describe("deep links e rota /n/<id>", () => {
  it("collectPending não usa mais links genéricos de Processos", () => {
    const src = ler("lib/notifications.ts");
    expect(src.includes('link: "/secretaria/processos"')).toBe(false);
    expect(src.includes('link: "/secretaria/membros"')).toBe(false);
    expect(src.includes("linkProcessos(`atestado-${")).toBe(true);
    expect(src.includes("linkProcessos(`quitte-${")).toBe(true);
    expect(src.includes("linkProcessos(`afastamento-${")).toBe(true);
    expect(src.includes("linkProcessos(`processo-${")).toBe(true);
    expect(src.includes("`/tesouraria/despesas#despesa-${")).toBe(true);
  });
  it("cards recebem os ids dos deep links", () => {
    const ap = ler("app/(app)/secretaria/processos/assinaturas-pendentes.tsx");
    for (const id of ["`atestado-${a.id}`", "`quitte-${p.id}`", "`afastamento-${p.id}`"]) {
      expect(ap.includes(`id={${id}}`)).toBe(true);
    }
    expect(ler("app/(app)/secretaria/processos/page.tsx").includes("id={`processo-${doc.id}`}")).toBe(true);
    expect(ler("app/(app)/tesouraria/despesas/page.tsx").includes("id={`despesa-${e.id}`}")).toBe(true);
  });
  it("/n/<id> filtra por loja, respeita o destinatário e só redireciona a rotas internas", () => {
    const src = ler("app/n/[id]/route.ts");
    expect(src.includes("lodgeId: session.user.lodgeId")).toBe(true);
    expect(src.includes("n.userId === null || n.userId === session.user.id")).toBe(true);
    expect(src.includes('n.link.startsWith("/")')).toBe(true);
    expect(ler("app/(app)/dashboard/notificacoes/page.tsx").includes("href={`/n/${n.id}`}")).toBe(true);
    expect(ler("lib/lembretes-email.ts").includes("/n/${id}")).toBe(true);
  });
});
