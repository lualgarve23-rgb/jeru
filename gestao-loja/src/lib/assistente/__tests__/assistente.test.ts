import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { FERRAMENTAS, ferramentasPara } from "@/lib/assistente/tools";
import { ordenarPorRota, sugestoesVisiveis, sugestoesDinamicas } from "@/lib/assistente/sugestoes";
import { partirEmRotas } from "@/lib/assistente/links";
import { buscarFaq } from "@/lib/assistente/faq";

describe("assistente — ferramentas", () => {
  it("toda ferramenta tem nome, descrição e guarda disponivel()", () => {
    for (const f of FERRAMENTAS) {
      expect(f.nome).toMatch(/^[a-z_]+$/);
      expect(f.descricao.length).toBeGreaterThan(10);
      expect(typeof f.disponivel).toBe("function");
    }
  });

  it("SUPER_ADMIN não recebe ferramenta nenhuma", () => {
    const fs = ferramentasPara({
      id: "u",
      lodgeId: "l",
      role: "SUPER_ADMIN",
      name: "Admin",
    });
    expect(fs).toHaveLength(0);
  });

  it("Obreiro comum recebe as ferramentas pessoais da Fase 1", () => {
    const fs = ferramentasPara({
      id: "u",
      lodgeId: "l",
      role: "MEMBER",
      name: "Irmão",
    });
    expect(fs.map((f) => f.nome)).toEqual(
      expect.arrayContaining([
        "minhas_capitacoes",
        "minha_frequencia",
        "minha_mutua",
        "proximas_sessoes",
        "meus_processos",
        "minhas_notificacoes",
        "info_benemerencia",
        "ajuda_app",
        "minha_fila",
      ])
    );
  });

  it("minha_fila vai a TODOS os perfis (inclui Orador/Vigilante por cargoRito)", () => {
    for (const role of ["MEMBER", "ESMOLER", "TESOUREIRO", "SECRETARIO", "CONSELHO_CONTAS", "VENERAVEL_MESTRE"]) {
      expect(nomes(role)).toContain("minha_fila");
    }
    expect(nomes("SUPER_ADMIN")).not.toContain("minha_fila");
    const orador = ferramentasPara({ id: "u", lodgeId: "l", role: "MEMBER", cargoRito: "Orador", name: "X" });
    expect(orador.map((f) => f.nome)).toContain("minha_fila");
  });

  it("situacao_financeira_irmao é exclusiva do Secretário", () => {
    expect(nomes("SECRETARIO")).toContain("situacao_financeira_irmao");
    for (const role of ["MEMBER", "ESMOLER", "TESOUREIRO", "CONSELHO_CONTAS", "VENERAVEL_MESTRE", "SUPER_ADMIN"]) {
      expect(nomes(role)).not.toContain("situacao_financeira_irmao");
    }
  });

  const nomes = (role: string) =>
    ferramentasPara({ id: "u", lodgeId: "l", role, name: "X" }).map(
      (f) => f.nome
    );
  const DA_LOJA = [
    "financas_loja",
    "inadimplencia_loja",
    "quadro_membros",
    "frequencia_loja",
    "confirmacoes_sessao",
    "processos_loja",
    "mutua_loja",
  ];

  it("Obreiro comum NÃO recebe nenhuma ferramenta da loja", () => {
    const fs = nomes("MEMBER");
    for (const n of DA_LOJA) expect(fs).not.toContain(n);
  });

  it("Venerável recebe TODAS as ferramentas (pessoais + loja)", () => {
    expect(nomes("VENERAVEL_MESTRE")).toEqual(
      expect.arrayContaining(DA_LOJA)
    );
  });

  it("Tesoureiro vê finanças, inadimplência e processos — não secretaria", () => {
    const fs = nomes("TESOUREIRO");
    expect(fs).toEqual(
      expect.arrayContaining([
        "financas_loja",
        "inadimplencia_loja",
        "processos_loja",
      ])
    );
    expect(fs).not.toContain("quadro_membros");
    expect(fs).not.toContain("frequencia_loja");
    expect(fs).not.toContain("confirmacoes_sessao");
    expect(fs).not.toContain("mutua_loja");
  });

  it("Secretário vê quadro, frequência, processos e mútua — não finanças", () => {
    const fs = nomes("SECRETARIO");
    expect(fs).toEqual(
      expect.arrayContaining([
        "quadro_membros",
        "frequencia_loja",
        "confirmacoes_sessao",
        "processos_loja",
        "mutua_loja",
      ])
    );
    expect(fs).not.toContain("financas_loja");
    expect(fs).not.toContain("inadimplencia_loja");
  });

  it("Conselho de Contas lê as duas áreas (só leitura)", () => {
    const fs = nomes("CONSELHO_CONTAS");
    expect(fs).toEqual(
      expect.arrayContaining([
        "financas_loja",
        "inadimplencia_loja",
        "quadro_membros",
        "frequencia_loja",
        "mutua_loja",
      ])
    );
  });

  it("atas: busca para todos; documentos do Drive: só quem lê a Secretaria", () => {
    expect(nomes("MEMBER")).toContain("buscar_atas");
    for (const role of ["MEMBER", "TESOUREIRO", "ESMOLER"]) {
      expect(nomes(role)).not.toContain("listar_documentos_drive");
      expect(nomes(role)).not.toContain("ler_documento_drive");
    }
    for (const role of ["VENERAVEL_MESTRE", "SECRETARIO", "CONSELHO_CONTAS"]) {
      expect(nomes(role)).toEqual(
        expect.arrayContaining(["listar_documentos_drive", "ler_documento_drive"])
      );
    }
  });

  it("busca full-text: biblioteca para todos; pranchas só quem lê a Secretaria", () => {
    expect(nomes("MEMBER")).toContain("buscar_biblioteca");
    for (const role of ["MEMBER", "TESOUREIRO", "ESMOLER"]) {
      expect(nomes(role)).not.toContain("buscar_pranchas");
    }
    for (const role of ["VENERAVEL_MESTRE", "SECRETARIO", "CONSELHO_CONTAS"]) {
      expect(nomes(role)).toContain("buscar_pranchas");
      expect(nomes(role)).toContain("buscar_biblioteca");
    }
    expect(nomes("MEMBER")).toContain("ler_biblioteca");
    expect(nomes("SUPER_ADMIN")).not.toContain("buscar_biblioteca");
  });

  it("Esmoler vê só inadimplência e frequência entre as da loja", () => {
    const fs = nomes("ESMOLER");
    expect(fs).toEqual(
      expect.arrayContaining(["inadimplencia_loja", "frequencia_loja"])
    );
    expect(fs).not.toContain("financas_loja");
    expect(fs).not.toContain("quadro_membros");
    expect(fs).not.toContain("confirmacoes_sessao");
    expect(fs).not.toContain("mutua_loja");
  });
});

describe("assistente — isolamento lodgeId (estático)", () => {
  const root = path.resolve(__dirname, "../../..");

  it("toda query em tools.ts filtra por user.lodgeId (nunca do input da IA)", () => {
    const src = readFileSync(
      path.join(root, "lib/assistente/tools.ts"),
      "utf8"
    );
    const usos = src.match(/lodgeId\??:/g) ?? [];
    const corretos = src.match(/lodgeId:\s*user\.lodgeId/g) ?? [];
    // além do campo do tipo AssistenteUser e do id do lodge, nenhum uso solto
    expect(corretos.length).toBeGreaterThanOrEqual(5);
    // nenhum lodgeId vindo de `input`
    expect(src).not.toMatch(/lodgeId:\s*input/);
    expect(src).not.toMatch(/userId:\s*input/);
    expect(usos.length).toBeGreaterThan(0);
  });

  it("situacao_financeira_irmao só aceita irmão da loja COM processo em andamento", () => {
    const src = readFileSync(
      path.join(root, "lib/assistente/tools.ts"),
      "utf8"
    );
    const ini = src.indexOf('nome: "situacao_financeira_irmao"');
    const fim = src.indexOf('nome: "minhas_capitacoes"');
    const bloco = src.slice(ini, fim);
    // valida contra a lista de irmãos com atestado/quitte/afastamento aberto…
    expect(bloco).toMatch(/irmaosComProcessoEmAndamento\(user\.lodgeId\)/);
    expect(bloco).toMatch(/comProcesso\.has\(alvo\)/);
    // …e toda query da ferramenta continua presa à loja do usuário
    const queries = bloco.match(/where:\s*\{[^}]*\}/g) ?? [];
    expect(queries.length).toBeGreaterThanOrEqual(3);
    for (const q of queries) expect(q).toMatch(/lodgeId:\s*user\.lodgeId/);
    // o helper também filtra por loja em todas as fontes
    const h0 = src.indexOf("export async function irmaosComProcessoEmAndamento");
    const helper = src.slice(h0, src.indexOf("// Trechos do texto", h0));
    expect((helper.match(/where:\s*\{\s*lodgeId/g) ?? []).length).toBe(3);
  });

  it("a rota do chat retoma conversa só do próprio usuário e loja", () => {
    const src = readFileSync(
      path.join(root, "app/api/assistente/chat/route.ts"),
      "utf8"
    );
    expect(src).toMatch(
      /assistenteConversa\.findFirst\(\{\s*where:\s*\{\s*id:\s*conversaId,\s*lodgeId:\s*user\.lodgeId,\s*userId:\s*user\.id/
    );
    expect(src).toMatch(/assistenteAtivo/);
    expect(src).toMatch(/limiteDiarioPara\(user\.role, lodge\)/);
  });
});

describe("assistente — sugestões e FAQ", () => {
  it("chips contextuais vêm primeiro e o limite é respeitado", () => {
    const sugestoes = [
      { texto: "geral A" },
      { texto: "contextual", rotas: ["/dashboard/mutua"] },
      { texto: "geral B" },
    ];
    const r = ordenarPorRota(sugestoes, "/dashboard/mutua", 2);
    expect(r[0]).toBe("contextual");
    expect(r).toHaveLength(2);
  });

  it("chips dinâmicos de 'Minha vez' vêm sempre na frente", () => {
    const din = sugestoesDinamicas([
      { tipo: "atestado", acao: "assinar" },
      { tipo: "atestado", acao: "assinar" },
      { tipo: "despesa", acao: "aprovar" },
    ]);
    expect(din[0].texto).toMatch(/2 atestado/);
    expect(din.map((d) => d.texto).join(" ")).toMatch(/despesas/);
    expect(din.every((d) => d.fixa)).toBe(true);
    expect(sugestoesDinamicas([])).toEqual([]);
    const r = ordenarPorRota(
      [{ texto: "contextual", rotas: ["/dashboard/mutua"] }, ...din],
      "/dashboard/mutua",
      2
    );
    expect(r[0]).toBe(din[0].texto);
  });

  it("rotas internas no texto viram links; texto comum e URLs externas não", () => {
    const partes = partirEmRotas(
      "Veja em /secretaria/processos?destaque=atestado-abc#atestado-abc. Depois /tesouraria/mensalidades/inv1, ok? Site https://gob.org.br/x."
    );
    expect(partes[1]).toBe("/secretaria/processos?destaque=atestado-abc#atestado-abc");
    expect(partes[3]).toBe("/tesouraria/mensalidades/inv1");
    expect(partes).toHaveLength(5);
    expect(partirEmRotas("nada aqui")).toEqual(["nada aqui"]);
    expect(partirEmRotas("aviso /n/abc123 lido")[1]).toBe("/n/abc123");
  });

  it("sugestoesVisiveis devolve o catálogo para Obreiro comum", () => {
    const r = sugestoesVisiveis({ role: "MEMBER" });
    expect(r.length).toBeGreaterThanOrEqual(6);
  });

  it("buscarFaq encontra por chave e por trecho", () => {
    expect(buscarFaq("govbr")?.titulo).toMatch(/gov\.br/);
    expect(buscarFaq("carteir")?.titulo).toMatch(/Carteirinha/);
    expect(buscarFaq("nada-disso")).toBeNull();
  });

  it("buscarFaq devolve guias passo a passo dos fluxos de assinatura", () => {
    const g = buscarFaq("assinar-atestado");
    expect(g && "passos" in g && g.passos.length).toBeGreaterThanOrEqual(4);
    expect(buscarFaq("assinar-quitte")?.titulo).toMatch(/Quitte/);
    expect(buscarFaq("assinar-documento")?.titulo).toMatch(/Processos/);
    expect(buscarFaq("prancha")?.titulo).toMatch(/prancha/i);
  });

  it("buscarFaq cai nos textos de ajuda das telas quando não há FAQ/guia", () => {
    const r = buscarFaq("balancete");
    expect(r && "resposta" in r && r.resposta).toMatch(/Livro-caixa/);
    expect(buscarFaq("progressoes")?.titulo).toBeTruthy();
  });
});
