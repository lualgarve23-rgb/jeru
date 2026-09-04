import { describe, it, expect } from "vitest";
import {
  ordemAssinaturaQuitte,
  cargoQuitteDoUsuario,
  cargoQuitteDosCargos,
  proximoCargoQuitte,
  assinaturasQuitte,
  bloqueioAssinaturaQuitte,
  camposAssinaturaQuitte,
} from "@/lib/quitte";

const nenhuma = { signedBySecAt: null, signedByOradorAt: null, signedByMasterAt: null };
const soSec = { ...nenhuma, signedBySecAt: new Date() };
const secOrador = { ...soSec, signedByOradorAt: new Date() };

describe("Quitte Placet — cadeia Secretário → Orador → Venerável Mestre", () => {
  it("resolve o cargo do assinante pelo nível de acesso ou pelo cargo do rito", () => {
    expect(cargoQuitteDoUsuario("SECRETARIO")).toBe("SECRETARIO");
    expect(cargoQuitteDoUsuario("VENERAVEL_MESTRE")).toBe("VENERAVEL_MESTRE");
    expect(cargoQuitteDoUsuario("MEMBER", "Orador")).toBe("ORADOR");
    expect(cargoQuitteDoUsuario("ESMOLER", "orador")).toBe("ORADOR");
    expect(cargoQuitteDoUsuario("TESOUREIRO")).toBeNull();
    expect(cargoQuitteDoUsuario("MEMBER", "1º Vigilante")).toBeNull();
  });

  it("Secretário assina primeiro; Orador e VM aguardam", () => {
    expect(ordemAssinaturaQuitte("SECRETARIO", nenhuma)).toEqual({
      jaAssinou: false,
      aguardando: null,
      ultimaAssinatura: false,
    });
    expect(ordemAssinaturaQuitte("ORADOR", nenhuma).aguardando).toBe("Secretário");
    expect(ordemAssinaturaQuitte("VENERAVEL_MESTRE", nenhuma).aguardando).toBe("Secretário");
  });

  it("depois do Secretário é a vez do Orador; o VM ainda espera pelo Orador", () => {
    expect(ordemAssinaturaQuitte("ORADOR", soSec)).toEqual({
      jaAssinou: false,
      aguardando: null,
      ultimaAssinatura: false,
    });
    expect(ordemAssinaturaQuitte("VENERAVEL_MESTRE", soSec).aguardando).toBe("Orador");
    expect(ordemAssinaturaQuitte("SECRETARIO", soSec).jaAssinou).toBe(true);
  });

  it("o VM sela por último (terceira assinatura aprova)", () => {
    expect(ordemAssinaturaQuitte("VENERAVEL_MESTRE", secOrador)).toEqual({
      jaAssinou: false,
      aguardando: null,
      ultimaAssinatura: true,
    });
    expect(proximoCargoQuitte(nenhuma)).toBe("SECRETARIO");
    expect(proximoCargoQuitte(soSec)).toBe("ORADOR");
    expect(proximoCargoQuitte(secOrador)).toBe("VENERAVEL_MESTRE");
    expect(assinaturasQuitte(secOrador)).toBe(2);
  });

  it("grava a assinatura na coluna do cargo", () => {
    expect(Object.keys(camposAssinaturaQuitte("ORADOR", "u1"))).toEqual([
      "signedByOradorId",
      "signedByOradorAt",
    ]);
  });

  it("bloqueia as assinaturas sem a sessão de comunicação e a ata", () => {
    const base = {
      status: "PENDENTE",
      quitacaoFinanceira: true,
      cartaNome: "carta.jpg",
      dataSessaoComunicacao: null as Date | null,
      ataNome: null as string | null,
      formularioNome: "form.pdf",
      formularioMime: "application/pdf",
      govbrPdf: null,
    };
    expect(bloqueioAssinaturaQuitte(base)).toMatch(/sessão/);
    expect(bloqueioAssinaturaQuitte({ ...base, dataSessaoComunicacao: new Date() })).toMatch(/ata/);
    expect(
      bloqueioAssinaturaQuitte({ ...base, dataSessaoComunicacao: new Date(), ataNome: "ata.pdf" })
    ).toBeNull();
  });

  it("quem acumula dois cargos responde pelo cargo da vez ainda não assinado", () => {
    // Secretário que também é Orador: assina como Secretário, depois como Orador
    expect(cargoQuitteDoUsuario("SECRETARIO", "Orador", nenhuma)).toBe("SECRETARIO");
    expect(cargoQuitteDoUsuario("SECRETARIO", "Orador", soSec)).toBe("ORADOR");
    // já assinou por ambos: volta ao primeiro (jaAssinou trata o resto)
    expect(cargoQuitteDoUsuario("SECRETARIO", "Orador", secOrador)).toBe("SECRETARIO");
    // sem estado do placet, comportamento antigo (primeiro cargo da cadeia)
    expect(cargoQuitteDosCargos(["SECRETARIO", "ORADOR"])).toBe("SECRETARIO");
    expect(cargoQuitteDosCargos(["MEMBER"])).toBeNull();
  });
});
