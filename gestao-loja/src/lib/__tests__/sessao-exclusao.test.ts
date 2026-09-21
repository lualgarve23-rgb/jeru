import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  avisosExclusaoSessao,
  bloqueioExclusaoSessao,
  type AtaParaExclusao,
} from "@/lib/sessao-exclusao";

const raiz = path.resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");

const rascunho = (extra: Partial<NonNullable<AtaParaExclusao>> = {}): AtaParaExclusao => ({
  number: 12,
  status: "RASCUNHO",
  signedByMasterId: null,
  signedBySecId: null,
  govbrMasterAt: null,
  govbrSecAt: null,
  govbrUploadedAt: null,
  driveFileId: null,
  sentForReviewAt: null,
  ...extra,
});

describe("exclusão de sessão — bloqueio pela ata", () => {
  it("sessão sem ata pode ser excluída", () => {
    expect(bloqueioExclusaoSessao(null)).toBeNull();
  });

  it("ata em rascunho sem assinaturas não bloqueia", () => {
    expect(bloqueioExclusaoSessao(rascunho())).toBeNull();
  });

  it.each([
    ["EM_VALIDACAO", "em validação pelos irmãos"],
    ["AGUARDANDO_ASSINATURAS", "aguardando assinaturas"],
    ["ASSINADA", "assinada"],
  ] as const)("ata %s bloqueia com o motivo certo", (status, texto) => {
    const motivo = bloqueioExclusaoSessao(rascunho({ status }));
    expect(motivo).toContain("Ata nº 12");
    expect(motivo).toContain(texto);
  });

  it.each([
    ["signedByMasterId", "u1"],
    ["signedBySecId", "u2"],
    ["govbrMasterAt", new Date()],
    ["govbrSecAt", new Date()],
    ["govbrUploadedAt", new Date()],
    ["driveFileId", "drive-1"],
    ["sentForReviewAt", new Date()],
  ] as const)("rascunho com %s preenchido bloqueia", (campo, valor) => {
    expect(bloqueioExclusaoSessao(rascunho({ [campo]: valor }))).not.toBeNull();
  });
});

describe("exclusão de sessão — avisos da confirmação", () => {
  const base = {
    titulo: "Sessão Ordinária",
    dataHora: "10/09/2026 às 20:00",
    grau: "Aprendiz",
    pauta: null,
    presentes: 0,
    visitantes: 0,
    confirmados: 0,
    justificadas: 0,
    ataRascunho: null,
  };

  it("sessão vazia só avisa sobre os links", () => {
    const avisos = avisosExclusaoSessao(base);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatch(/convite.*QR Code/);
  });

  it("lista presenças, visitantes, RSVPs, justificativas e rascunho da ata", () => {
    const avisos = avisosExclusaoSessao({
      ...base,
      presentes: 14,
      visitantes: 2,
      confirmados: 9,
      justificadas: 1,
      ataRascunho: 33,
    });
    expect(avisos.join("\n")).toMatch(/14 presença/);
    expect(avisos.join("\n")).toMatch(/2 registro\(s\) de visitante/);
    expect(avisos.join("\n")).toMatch(/9 confirmação/);
    expect(avisos.join("\n")).toMatch(/1 ausência/);
    expect(avisos.join("\n")).toMatch(/Ata nº 33/);
  });
});

describe("exclusão de sessão — action e página", () => {
  const action = ler("app/(app)/secretaria/_actions/sessoes.ts");
  const pagina = ler("app/(app)/secretaria/sessoes/[id]/page.tsx");

  it("action exige escritor da Secretaria, aplica o bloqueio e audita", () => {
    const corpo = action.slice(action.indexOf("export async function excluirSessao"));
    const fim = corpo.indexOf("\n}\n");
    const trecho = corpo.slice(0, fim);
    expect(trecho).toContain("requireSecretariaWriter()");
    expect(trecho).toContain("lodgeId: user.lodgeId");
    expect(trecho).toContain("bloqueioExclusaoSessao(session.ata)");
    expect(trecho).toContain('acao: "sessao.excluir"');
    expect(trecho).toContain("tx.attendance.deleteMany");
    expect(trecho).toContain("tx.lodgeSession.delete");
  });

  it("página só mostra o card de exclusão para quem escreve na Secretaria", () => {
    const idx = pagina.indexOf("<ExcluirSessaoDialog");
    expect(idx).toBeGreaterThan(0);
    const antes = pagina.slice(0, idx);
    expect(antes.lastIndexOf("{isWriter && (")).toBeGreaterThan(
      antes.lastIndexOf("</Card>")
    );
  });
});
