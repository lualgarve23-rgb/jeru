import { describe, it, expect } from "vitest";
import { ataFechadaParaPresencas } from "@/lib/ata-regras";
import { AtaStatus } from "@prisma/client";

const aberta = {
  status: AtaStatus.RASCUNHO,
  signedByMasterId: null,
  signedBySecId: null,
  govbrUploadedAt: null,
};

describe("trava do livro de presenças pela ata", () => {
  it("sessão sem ata não trava presenças", () => {
    expect(ataFechadaParaPresencas(null)).toBe(false);
  });

  it("ata em rascunho ou em validação não trava", () => {
    expect(ataFechadaParaPresencas(aberta)).toBe(false);
    expect(
      ataFechadaParaPresencas({ ...aberta, status: AtaStatus.EM_VALIDACAO })
    ).toBe(false);
  });

  it("trava a partir da liberação para assinaturas", () => {
    expect(
      ataFechadaParaPresencas({
        ...aberta,
        status: AtaStatus.AGUARDANDO_ASSINATURAS,
      })
    ).toBe(true);
    expect(
      ataFechadaParaPresencas({ ...aberta, status: AtaStatus.ASSINADA })
    ).toBe(true);
  });

  it("qualquer assinatura isolada trava, mesmo com status inconsistente", () => {
    expect(
      ataFechadaParaPresencas({ ...aberta, signedByMasterId: "u1" })
    ).toBe(true);
    expect(ataFechadaParaPresencas({ ...aberta, signedBySecId: "u2" })).toBe(
      true
    );
  });

  it("upload ao gov.br trava", () => {
    expect(
      ataFechadaParaPresencas({ ...aberta, govbrUploadedAt: new Date() })
    ).toBe(true);
  });
});
