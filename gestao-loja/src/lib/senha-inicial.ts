import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
import { sendLodgeEmail, isGmailConfigured } from "@/lib/gmail";
import { logError } from "@/lib/log";

// Senha inicial aleatória para novos membros (análise de segurança 2026-08,
// item 2) — substitui a antiga senha inicial = CPF, previsível para quem
// conhece CIM+CPF do irmão. O sistema segue forçando a troca no 1º acesso.

// Sem caracteres ambíguos (0/O, 1/l/I) — a senha pode ser repassada verbalmente
const ALFABETO = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function gerarSenhaInicial(tamanho = 10): string {
  let s = "";
  for (let i = 0; i < tamanho; i++) s += ALFABETO[randomInt(ALFABETO.length)];
  return s;
}

// E-mails de placeholder criados na importação não recebem mensagem
export function emailEntregavel(email: string): boolean {
  return !!email && email.includes("@") && !email.endsWith("@importado.local");
}

// Gera a senha inicial e tenta entregá-la por e-mail da loja. Quando o envio
// não é possível (Gmail não configurado, e-mail de placeholder ou falha no
// envio), devolve a senha em claro para o Secretário anotar e repassar —
// ela não fica registrada em lugar nenhum além do hash.
export async function criarSenhaInicial(opts: {
  lodgeId: string;
  nome: string;
  email: string;
  cim: string;
}): Promise<{ passwordHash: string; senhaParaRepassar: string | null }> {
  const senha = gerarSenhaInicial();
  const passwordHash = await bcrypt.hash(senha, 10);
  let enviada = false;
  if (emailEntregavel(opts.email) && (await isGmailConfigured(opts.lodgeId))) {
    try {
      await sendLodgeEmail({
        lodgeId: opts.lodgeId,
        to: opts.email,
        subject: "Seu acesso ao Gestão NoPrumo",
        text:
          `Olá, ${opts.nome}.\n\n` +
          `Seu acesso ao sistema Gestão NoPrumo foi criado pela Secretaria ` +
          `da sua Loja.\n\n` +
          `CIM: ${opts.cim}\n` +
          `Senha inicial: ${senha}\n\n` +
          `No primeiro acesso o sistema pedirá que você defina uma senha ` +
          `nova. Se você não esperava este e-mail, avise a Secretaria.`,
      });
      enviada = true;
    } catch (e) {
      logError("senhaInicial.email", e);
    }
  }
  return { passwordHash, senhaParaRepassar: enviada ? null : senha };
}
