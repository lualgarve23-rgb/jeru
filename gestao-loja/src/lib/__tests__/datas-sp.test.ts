import { describe, expect, it } from "vitest";
import {
  capitacaoVencida,
  diaSaoPauloIso,
  fimDoDiaSaoPaulo,
  inicioDoDiaSaoPaulo,
  intervaloMesSaoPaulo,
  partesSaoPaulo,
} from "@/lib/datas-sp";

// São Paulo é UTC-3 o ano todo desde 2019 (sem horário de verão)
describe("datas em São Paulo", () => {
  it("vencimento vira 23:59:59 de São Paulo = 02:59:59Z do dia seguinte", () => {
    expect(fimDoDiaSaoPaulo("2026-09-10")?.toISOString()).toBe("2026-09-11T02:59:59.000Z");
    // Date serializado pelo input (meia-noite UTC) dá o mesmo resultado
    expect(fimDoDiaSaoPaulo(new Date("2026-09-10T00:00:00.000Z"))?.toISOString()).toBe(
      "2026-09-11T02:59:59.000Z"
    );
  });

  it("aceita data com hora e rejeita lixo", () => {
    expect(fimDoDiaSaoPaulo("2026-12-31T15:00:00")?.toISOString()).toBe("2027-01-01T02:59:59.000Z");
    expect(fimDoDiaSaoPaulo("31/12/2026")).toBeNull();
    expect(fimDoDiaSaoPaulo(new Date("x"))).toBeNull();
  });

  it("início do dia: 21h de Brasília de dia 9 ainda é dia 9, mesmo sendo dia 10 em UTC", () => {
    const agora = new Date("2026-09-10T00:30:00.000Z"); // 21:30 de 09/09 em SP
    expect(partesSaoPaulo(agora).dia).toBe(9);
    expect(inicioDoDiaSaoPaulo(agora).toISOString()).toBe("2026-09-09T03:00:00.000Z");
    expect(diaSaoPauloIso(agora)).toBe("2026-09-09");
  });

  it("capitação que vence hoje não está vencida às 21h; vence só a partir do dia seguinte", () => {
    const venc = fimDoDiaSaoPaulo("2026-09-09")!;
    expect(capitacaoVencida(venc, new Date("2026-09-10T00:30:00.000Z"))).toBe(false); // 21:30 do dia 9
    expect(capitacaoVencida(venc, new Date("2026-09-10T02:59:00.000Z"))).toBe(false); // 23:59 do dia 9
    expect(capitacaoVencida(venc, new Date("2026-09-10T03:00:00.000Z"))).toBe(true); // 00:00 do dia 10
    expect(capitacaoVencida(venc, new Date("2026-09-10T12:00:00.000Z"))).toBe(true);
  });

  it("intervalo do mês civil em São Paulo", () => {
    const { inicio, fim } = intervaloMesSaoPaulo(2026, 12);
    expect(inicio.toISOString()).toBe("2026-12-01T03:00:00.000Z");
    expect(fim.toISOString()).toBe("2027-01-01T03:00:00.000Z");
  });
});
