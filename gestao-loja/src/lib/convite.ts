import type { Lodge, LodgeSession } from "@prisma/client";
import { sessionTypeLabels, degreeLabels } from "@/lib/labels";

// Convite de sessão por e-mail: o template padrão vive aqui no repositório e a
// loja pode substituí-lo por um HTML próprio (upload em Configurações da Loja,
// campo Lodge.conviteTemplateHtml). Placeholders aceitos:
//   {{LOJA}} {{DATA}} {{HORA}} {{TIPO}} {{GRAU}} {{LINK}}
export const CONVITE_PLACEHOLDERS = [
  "{{LOJA}}",
  "{{DATA}}",
  "{{HORA}}",
  "{{TIPO}}",
  "{{GRAU}}",
  "{{LINK}}",
  "{{FRASE}}",
] as const;

// Saudação usada quando a loja não cadastrou a frase fixa do convite
export const CONVITE_FRASE_PADRAO =
  "Prezado Irmão, é com satisfação que o convidamos para a nossa próxima sessão:";

export const CONVITE_TEMPLATE_PADRAO = `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Georgia,'Times New Roman',serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr>
            <td style="background:#1e3a5f;padding:28px 32px;text-align:center;">
              <p style="margin:0;color:#c9a84c;font-size:13px;letter-spacing:3px;text-transform:uppercase;">Convite</p>
              <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:normal;">{{LOJA}}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:15px;color:#3f3f46;line-height:1.6;">
                {{FRASE}}
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #e4e4e7;border-radius:6px;">
                <tr><td style="padding:16px 20px;font-size:14px;color:#18181b;line-height:1.9;">
                  <strong>Sessão:</strong> {{TIPO}}<br/>
                  <strong>Grau:</strong> {{GRAU}}<br/>
                  <strong>Data:</strong> {{DATA}}, às {{HORA}}
                </td></tr>
              </table>
              <p style="margin:24px 0 8px;font-size:15px;color:#3f3f46;line-height:1.6;">
                Por gentileza, confirme sua presença — e se ficará para o <strong>Ágape</strong> — pelo botão abaixo:
              </p>
              <p style="text-align:center;margin:24px 0;">
                <a href="{{LINK}}" style="background:#1e3a5f;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:6px;font-size:15px;display:inline-block;">Confirmar presença</a>
              </p>
              <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa;line-height:1.5;">
                Se o botão não funcionar, copie e cole este endereço no navegador:<br/>{{LINK}}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #e4e4e7;text-align:center;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">TFA — Secretaria da Loja</p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

// Template a partir de uma arte pronta (JPG/PNG): a imagem vira o corpo do
// e-mail, com o botão de confirmação logo abaixo. O HTML gerado é salvo em
// Lodge.conviteTemplateHtml, como no upload de HTML.
export function templateDeImagem(dataUri: string) {
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Georgia,'Times New Roman',serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr><td>
            <a href="{{LINK}}"><img src="${dataUri}" alt="Convite — {{LOJA}}, sessão {{TIPO}} de {{DATA}}" width="560" style="display:block;width:100%;height:auto;"/></a>
          </td></tr>
          <tr><td style="padding:24px 32px;text-align:center;">
            <p style="margin:0 0 12px;font-size:15px;color:#3f3f46;line-height:1.6;">{{FRASE}}</p>
            <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;line-height:1.6;">
              <strong>{{TIPO}}</strong> — {{DATA}}, às {{HORA}}.<br/>
              Confirme sua presença — e se ficará para o <strong>Ágape</strong> — pelo botão abaixo:
            </p>
            <a href="{{LINK}}" style="background:#1e3a5f;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:6px;font-size:15px;display:inline-block;">Confirmar presença</a>
            <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa;line-height:1.5;">
              Se o botão não funcionar, copie e cole este endereço no navegador:<br/>{{LINK}}
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

// Arte do convite embutida no template da loja (upload JPG/PNG), para exibir
// também na página pública /convite/[token]; null quando o template é HTML
// sem imagem ou a loja usa o padrão
export function arteDoConvite(conviteTemplateHtml: string | null) {
  return (
    conviteTemplateHtml?.match(/src="(data:image\/[^"]+)"/)?.[1] ?? null
  );
}

export function renderConvite(
  lodge: Pick<Lodge, "name" | "conviteTemplateHtml" | "conviteFrase">,
  session: Pick<LodgeSession, "date" | "type" | "degree">,
  inviteUrl: string
) {
  // Template de imagem: regenera o wrapper a partir da arte salva, para que
  // melhorias no layout do e-mail valham sem reenviar o arquivo
  const arte = arteDoConvite(lodge.conviteTemplateHtml);
  const template = arte
    ? templateDeImagem(arte)
    : lodge.conviteTemplateHtml || CONVITE_TEMPLATE_PADRAO;
  const valores: Record<(typeof CONVITE_PLACEHOLDERS)[number], string> = {
    "{{LOJA}}": lodge.name,
    "{{DATA}}": session.date.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
    "{{HORA}}": session.date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    "{{TIPO}}": sessionTypeLabels[session.type] ?? session.type,
    "{{GRAU}}": degreeLabels[session.degree] ?? session.degree,
    "{{LINK}}": inviteUrl,
    "{{FRASE}}": lodge.conviteFrase?.trim() || CONVITE_FRASE_PADRAO,
  };
  return Object.entries(valores).reduce(
    (html, [ph, valor]) => html.replaceAll(ph, valor),
    template
  );
}
