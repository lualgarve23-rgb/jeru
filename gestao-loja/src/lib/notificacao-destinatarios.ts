// Quem é o "cargo da vez" de uma notificação operacional (sem userId), a
// partir da sourceKey. Usado pelo e-mail (lembretes-email.ts) para avisar
// só o cargo responsável, e reutilizável pelo dashboard "Minha vez" e pelo
// assistente. Módulo puro (sem Prisma) — testável.
//
// Convenção das sourceKeys (lib/notifications.ts):
//   atestado:<id>:tes|sec|vm        — Atestado de Regularidade, cargo da vez
//   afastamento:<id>:sessao|sec|vm|envio — Form. 116 (obreiro tem userId)
//   qp-fin:<id>                     — Quitte sem Nada Consta (Tesoureiro)
//   qp-sessao:<id>                  — Quitte: registrar sessão (Secretaria)
//   qp-sig:<id>:SECRETARIO|ORADOR|VENERAVEL_MESTRE[:userId]
//   processo:<id>:<ordem>[:userId]  — cadeia genérica (cargo no título)
//   ata:<id>                        — VM e Secretário
//   despesa:<id>:vm|tes             — despesa aguardando aprovação
//   demais                          — VM + Secretário (+ Conselho na leitura)

export type Cargo =
  | "VENERAVEL_MESTRE"
  | "SECRETARIO"
  | "TESOUREIRO"
  | "CONSELHO_CONTAS"
  | "ESMOLER";

const VM_SEC: Cargo[] = ["VENERAVEL_MESTRE", "SECRETARIO"];

const SUFIXO_CARGO: Record<string, Cargo[]> = {
  tes: ["TESOUREIRO"],
  sec: ["SECRETARIO"],
  vm: ["VENERAVEL_MESTRE"],
  SECRETARIO: ["SECRETARIO"],
  VENERAVEL_MESTRE: ["VENERAVEL_MESTRE"],
};

export const PREFIXOS_LEITURA_CONSELHO = [
  "intersticio:",
  "cadastro:",
  "magna-15d:",
  "prog-15d:",
  "freq-risco:",
  "mutua-pendentes:",
];

// Cargos que devem ser avisados de uma notificação SEM userId.
// `titulo` ajuda nos processos genéricos, cujo cargo da vez só consta no texto.
export function cargosDaNotificacao(sourceKey: string | null, titulo = ""): Cargo[] {
  if (!sourceKey) return VM_SEC;
  const partes = sourceKey.split(":");
  const prefixo = `${partes[0]}:`;

  if (prefixo === "atestado:" || prefixo === "afastamento:" || prefixo === "despesa:") {
    const c = SUFIXO_CARGO[partes[2] ?? ""];
    if (c) return c;
    if (prefixo === "despesa:") return ["VENERAVEL_MESTRE"];
    return VM_SEC; // afastamento:sessao / :envio → Secretaria
  }
  if (prefixo === "qp-fin:") return ["TESOUREIRO"];
  if (prefixo === "qp-sessao:") return VM_SEC;
  if (prefixo === "qp-sig:") {
    // ORADOR (cargo do rito) recebe pela notificação dirigida (userId)
    return SUFIXO_CARGO[partes[2] ?? ""] ?? [];
  }
  if (prefixo === "processo:") {
    if (/Tesoureiro/i.test(titulo)) return ["TESOUREIRO"];
    if (/Secretário/i.test(titulo)) return ["SECRETARIO"];
    if (/Venerável/i.test(titulo)) return ["VENERAVEL_MESTRE"];
    // Orador/Vigilantes: dirigida por userId; a geral fica com a Secretaria
    return VM_SEC;
  }
  if (prefixo === "ata:") return VM_SEC;
  if (PREFIXOS_LEITURA_CONSELHO.includes(prefixo)) {
    return [...VM_SEC, "CONSELHO_CONTAS"];
  }
  return VM_SEC;
}
