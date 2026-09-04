import { describe, expect, it } from "vitest";
import { acessorPrisma, lerLib, lerModelos } from "./schema-modelos";

/**
 * Ida e volta do backup (estático, sem banco): todo modelo com lodgeId do
 * schema tem de ser exportado em backup.ts e lido em restore.ts; todo campo
 * Bytes tem de sair como arquivo em arquivos/ (nunca serializado no JSON,
 * que estoura o ZIP e faz o restore abortar); segredos e estado transitório
 * do usuário ficam fora.
 */
const backup = lerLib("backup.ts");
const restore = lerLib("restore.ts");
const modelos = lerModelos();

// Fila de jobs é transitória (reexecutar e-mails velhos após um restore
// seria errado) — única exceção deliberada.
const FORA_DO_BACKUP = new Set(["Job"]);

describe("backup.ts e restore.ts cobrem todos os modelos da loja", () => {
  const cobertos = modelos.filter(
    (m) => m.temLodgeId && m.nome !== "Lodge" && !FORA_DO_BACKUP.has(m.nome)
  );

  it("o schema foi lido (sanidade)", () => {
    expect(cobertos.map((m) => m.nome)).toContain("PedidoAfastamento");
    expect(cobertos.map((m) => m.nome)).toContain("AssistenteConversa");
  });

  it.each(cobertos.map((m) => m.nome))("%s é exportado e restaurado", (nome) => {
    const acessor = acessorPrisma(nome);
    expect(backup, `backup.ts não lê prisma.${acessor}`).toMatch(
      new RegExp(`prisma\\.${acessor}\\.findMany`)
    );
    expect(restore, `restore.ts não grava tx.${acessor}`).toMatch(
      new RegExp(`tx\\.${acessor}\\.(create|createMany)\\(`)
    );
  });

  it("filhos sem lodgeId (cascade) também vão e voltam", () => {
    for (const nome of [
      "FamilyMember",
      "MetaRegistro",
      "CandidatoAnexo",
      "ProcessoAssinante",
      "AssistenteMensagem",
    ]) {
      const acessor = acessorPrisma(nome);
      expect(backup).toContain(`prisma.${acessor}.findMany`);
      expect(restore).toContain(`tx.${acessor}.createMany`);
    }
  });
});

describe("campos Bytes viram arquivos, nunca JSON", () => {
  const comBytes = modelos.flatMap((m) =>
    m.campos
      .filter((c) => c.tipo === "Bytes")
      .map((c) => ({ modelo: m.nome, campo: c.nome }))
  );

  it("o schema tem campos Bytes (sanidade)", () => {
    expect(comBytes).toContainEqual({ modelo: "QuittePlacet", campo: "cartaArquivo" });
    expect(comBytes.length).toBeGreaterThanOrEqual(12);
  });

  it.each(comBytes.map((b) => [b.modelo, b.campo]))(
    "%s.%s é omitido do JSON no backup e recomposto no restore",
    (_modelo, campo) => {
      // O campo aparece entre aspas em backup.ts — só assim entra numa lista
      // de omissão de toJson/separarBinarios (os dumps são spread do registro,
      // então um Bytes só fica fora do JSON se for nomeado).
      expect(backup).toMatch(new RegExp(`"${campo}"`));
      expect(restore).toContain(campo);
    }
  );

  it("modelos com Bytes gravam os arquivos no ZIP", () => {
    for (const { modelo, campo } of comBytes) {
      if (modelo === "Lodge") continue; // certFundoPdf: arquivo próprio
      // Cada modelo com Bytes deve usar separarBinarios OU um laço legado
      // (atas/pranchas/biblioteca/candidatos) que grava em arquivos/.
      const legado = ["Ata", "Prancha", "BibliotecaItem", "CandidatoAnexo"];
      if (legado.includes(modelo)) continue;
      const re = new RegExp(`separarBinarios\\([\\s\\S]*?"${campo}"[\\s\\S]*?\\]`);
      expect(backup, `${modelo}.${campo} sem separarBinarios`).toMatch(re);
    }
  });
});

describe("segredos e estado transitório do usuário ficam fora", () => {
  it.each([
    "passwordHash",
    "resetCodeHash",
    "resetCodeExpiresAt",
    "resetCodeAttempts",
    "failedLoginAttempts",
    "lockedUntil",
    "cardToken",
  ])("%s está em USER_CAMPOS_OMITIDOS", (campo) => {
    const bloco = backup.slice(
      backup.indexOf("USER_CAMPOS_OMITIDOS"),
      backup.indexOf("] as const")
    );
    expect(bloco).toContain(`"${campo}"`);
  });

  it("restore remove esses campos de ZIPs antigos (cardToken regenerado)", () => {
    expect(restore).toContain("USER_CAMPOS_OMITIDOS");
    expect(restore).toMatch(/for \(const k of USER_CAMPOS_OMITIDOS\) delete/);
  });

  it("segredos da loja continuam omitidos", () => {
    for (const s of ["asaasApiKey", "asaasWebhookToken", "googleRefreshToken", "gmailAppPassword"]) {
      expect(backup).toContain(`"${s}"`);
    }
  });
});
