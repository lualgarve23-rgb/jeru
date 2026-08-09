import nodemailer from "nodemailer";

// Logs estruturados (JSON por linha no stdout → journalctl) e alerta por
// e-mail para falhas críticas de cron/webhook. Campos padrão: ts, nivel,
// evento; junte requestId/lodgeId/etc. via `campos`.

type Campos = Record<string, unknown>;

function linha(nivel: "info" | "warn" | "error", evento: string, campos?: Campos) {
  const registro = { ts: new Date().toISOString(), nivel, evento, ...campos };
  // stderr para erro — journalctl marca a prioridade
  (nivel === "error" ? console.error : console.log)(JSON.stringify(registro));
}

export function logInfo(evento: string, campos?: Campos) {
  linha("info", evento, campos);
}

export function logWarn(evento: string, campos?: Campos) {
  linha("warn", evento, campos);
}

export function logError(evento: string, erro?: unknown, campos?: Campos) {
  linha("error", evento, {
    ...campos,
    erro: erro instanceof Error ? erro.message : erro ? String(erro) : undefined,
    stack: erro instanceof Error ? erro.stack : undefined,
  });
}

// Alerta crítico: loga E manda e-mail ao operador (ALERT_EMAIL, senão
// GMAIL_USER). Best-effort — falha no envio nunca propaga.
export async function alertaCritico(
  evento: string,
  erro?: unknown,
  campos?: Campos
) {
  logError(evento, erro, { ...campos, alerta: true });
  const destino = process.env.ALERT_EMAIL || process.env.GMAIL_USER;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!destino || !user || !pass) return;
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
    await transporter.sendMail({
      from: `"NoPrumo Alertas" <${user}>`,
      to: destino,
      subject: `[ALERTA] ${evento}`,
      text:
        `Evento: ${evento}\n` +
        `Quando: ${new Date().toISOString()}\n` +
        `Erro: ${erro instanceof Error ? erro.message : String(erro ?? "-")}\n` +
        `Detalhes: ${JSON.stringify(campos ?? {}, null, 2)}\n` +
        `Host: ${process.env.APP_URL ?? "?"}`,
    });
  } catch (e) {
    logError("alerta.envio-falhou", e, { eventoOriginal: evento });
  }
}
