import { describe, it, expect } from "vitest";
import {
  canWriteSecretaria,
  canWriteTesouraria,
  canReadSecretariaAdmin,
  canReadTesouraria,
  grausInstrucaoPermitidos,
} from "@/lib/permissions";

describe("segregação de funções (loja.md §3)", () => {
  it("Secretário e VM escrevem na Secretaria; demais não", () => {
    expect(canWriteSecretaria("SECRETARIO")).toBe(true);
    expect(canWriteSecretaria("VENERAVEL_MESTRE")).toBe(true);
    expect(canWriteSecretaria("TESOUREIRO")).toBe(false);
    expect(canWriteSecretaria("MEMBER")).toBe(false);
  });

  it("Tesoureiro e VM escrevem na Tesouraria; demais não", () => {
    expect(canWriteTesouraria("TESOUREIRO")).toBe(true);
    expect(canWriteTesouraria("VENERAVEL_MESTRE")).toBe(true);
    expect(canWriteTesouraria("SECRETARIO")).toBe(false);
  });

  it("CONSELHO_CONTAS nunca tem escrita em Secretaria nem Tesouraria", () => {
    expect(canWriteSecretaria("CONSELHO_CONTAS")).toBe(false);
    expect(canWriteTesouraria("CONSELHO_CONTAS")).toBe(false);
  });

  it("leitura administrativa inclui Conselho; escrita não", () => {
    expect(canReadSecretariaAdmin("CONSELHO_CONTAS")).toBe(true);
    expect(canReadSecretariaAdmin("SECRETARIO")).toBe(true);
    expect(canReadSecretariaAdmin("MEMBER")).toBe(false);
    expect(canReadTesouraria("CONSELHO_CONTAS")).toBe(true);
    expect(canReadTesouraria("MEMBER")).toBe(false);
  });
});

describe("instruções de grau por cargo do rito", () => {
  it("VM e Secretário registram instrução de ambos os graus", () => {
    expect(grausInstrucaoPermitidos("VENERAVEL_MESTRE")).toEqual([
      "APRENDIZ",
      "COMPANHEIRO",
    ]);
    expect(grausInstrucaoPermitidos("SECRETARIO", null)).toEqual([
      "APRENDIZ",
      "COMPANHEIRO",
    ]);
  });

  it("2º Vigilante instrui Aprendizes; 1º Vigilante instrui Companheiros", () => {
    expect(grausInstrucaoPermitidos("MEMBER", "2º Vigilante")).toEqual([
      "APRENDIZ",
    ]);
    expect(grausInstrucaoPermitidos("MEMBER", "1º Vigilante")).toEqual([
      "COMPANHEIRO",
    ]);
  });

  it("tolera variações de grafia do cargo cadastrado pela Loja", () => {
    expect(grausInstrucaoPermitidos("MEMBER", "Primeiro Vigilante")).toEqual([
      "COMPANHEIRO",
    ]);
    expect(grausInstrucaoPermitidos("MEMBER", "2o. vigilante")).toEqual([
      "APRENDIZ",
    ]);
  });

  it("membro sem cargo de instrução não registra nada", () => {
    expect(grausInstrucaoPermitidos("MEMBER", "Orador")).toEqual([]);
    expect(grausInstrucaoPermitidos("MEMBER", null)).toEqual([]);
    expect(grausInstrucaoPermitidos("TESOUREIRO")).toEqual([]);
  });
});
