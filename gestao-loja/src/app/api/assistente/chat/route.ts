import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { auditar } from "@/lib/audit";
import { systemPrompt } from "@/lib/assistente/prompt";
import { pendenciasDoUsuario } from "@/lib/pendencias";
import { limiteDiarioPara, separarSugestoes } from "@/lib/assistente/limites";
import {
  ferramentasPara,
  paraAnthropicTools,
  type AssistenteUser,
} from "@/lib/assistente/tools";

// Assistente IA: streaming SSE com loop de tool use. Node runtime (Prisma).
export const runtime = "nodejs";

const MODEL = process.env.ASSISTENTE_MODEL || "claude-haiku-4-5";
const MAX_ITERACOES = 6;
const MAX_HISTORICO = 20;

const bodySchema = z.object({
  mensagem: z.string().trim().min(1).max(2000),
  conversaId: z.string().optional(),
  rota: z.string().max(200).default("/dashboard"),
});

function sse(controller: ReadableStreamDefaultController, evento: object) {
  controller.enqueue(
    new TextEncoder().encode(`data: ${JSON.stringify(evento)}\n\n`)
  );
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response("Não autenticado.", { status: 401 });
  const user = session.user as AssistenteUser & {
    name: string;
    degree?: string;
  };
  if (user.role === "SUPER_ADMIN")
    return new Response("Indisponível para o super admin.", { status: 403 });

  if (!process.env.ANTHROPIC_API_KEY)
    return Response.json(
      { error: "Assistente não configurado (chave da API ausente)." },
      { status: 503 }
    );

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "Pergunta inválida." }, { status: 400 });
  const { mensagem, conversaId, rota } = parsed.data;

  const [lodge, perfil] = await Promise.all([
    prisma.lodge.findUniqueOrThrow({
      where: { id: user.lodgeId },
      select: {
        name: true,
        number: true,
        oriente: true,
        assistenteAtivo: true,
        assistenteLimiteObreiros: true,
        assistenteLimiteOficiais: true,
      },
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { cargoRito: true, degree: true },
    }),
  ]);
  if (!lodge.assistenteAtivo)
    return Response.json(
      { error: "O assistente está desativado nesta loja." },
      { status: 403 }
    );

  // Limite diário por usuário (perguntas enviadas hoje), por nível na loja
  const limiteDiario = limiteDiarioPara(user.role, lodge);
  if (limiteDiario <= 0)
    return Response.json(
      { error: "O assistente está fechado para o seu nível nesta loja." },
      { status: 403 }
    );
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const usadas = await prisma.assistenteMensagem.count({
    where: {
      role: "user",
      createdAt: { gte: hoje },
      conversa: { lodgeId: user.lodgeId, userId: user.id },
    },
  });
  if (usadas >= limiteDiario)
    return Response.json(
      {
        error: `Limite diário de ${limiteDiario} pergunta(s) atingido. Volte amanhã.`,
      },
      { status: 429 }
    );

  // Conversa: retoma a existente (do próprio usuário) ou cria uma nova
  let conversa =
    conversaId != null
      ? await prisma.assistenteConversa.findFirst({
          where: { id: conversaId, lodgeId: user.lodgeId, userId: user.id },
          select: { id: true },
        })
      : null;
  if (!conversa) {
    conversa = await prisma.assistenteConversa.create({
      data: {
        lodgeId: user.lodgeId,
        userId: user.id,
        titulo: mensagem.slice(0, 80),
      },
      select: { id: true },
    });
  }

  const historico = await prisma.assistenteMensagem.findMany({
    where: { conversaId: conversa.id },
    orderBy: { createdAt: "desc" },
    take: MAX_HISTORICO,
    select: { role: true, content: true },
  });

  await prisma.assistenteMensagem.create({
    data: { conversaId: conversa.id, role: "user", content: mensagem },
  });

  // Cargo do rito e grau entram no contexto das ferramentas (Orador e
  // Vigilantes assinam por cargoRito; o grau segmenta os acervos)
  user.cargoRito = perfil.cargoRito;
  user.degree = perfil.degree;
  const pendencias = await pendenciasDoUsuario({
    id: user.id,
    lodgeId: user.lodgeId,
    role: user.role,
    cargoRito: perfil.cargoRito,
    degree: perfil.degree,
  }).catch(() => []);
  const ferramentas = ferramentasPara(user);
  const client = new Anthropic();
  const system = systemPrompt({
    lodgeName: lodge.name,
    lodgeNumber: lodge.number,
    oriente: lodge.oriente,
    userName: user.name,
    role: user.role,
    cargoRito: perfil.cargoRito,
    degree: perfil.degree,
    rota,
    pendencias,
  });

  const messages: Anthropic.MessageParam[] = [
    ...historico
      .reverse()
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    { role: "user", content: mensagem },
  ];

  const conversaIdFinal = conversa.id;
  const toolsUsadas: string[] = [];

  const stream = new ReadableStream({
    async start(controller) {
      let respostaCompleta = "";
      try {
        sse(controller, { type: "conversa", conversaId: conversaIdFinal });

        for (let i = 0; i < MAX_ITERACOES; i++) {
          const msgStream = client.messages.stream({
            model: MODEL,
            max_tokens: 1500,
            system,
            messages,
            tools: paraAnthropicTools(ferramentas),
          });
          msgStream.on("text", (delta) => {
            respostaCompleta += delta;
            sse(controller, { type: "text", delta });
          });
          const resposta = await msgStream.finalMessage();

          if (resposta.stop_reason !== "tool_use") break;

          messages.push({ role: "assistant", content: resposta.content });
          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const block of resposta.content) {
            if (block.type !== "tool_use") continue;
            const f = ferramentas.find((t) => t.nome === block.name);
            toolsUsadas.push(block.name);
            sse(controller, { type: "tool", nome: block.name });
            let conteudo: string;
            let erro = false;
            try {
              const r = f
                ? await f.executar(user, block.input as Record<string, unknown>)
                : { erro: "Ferramenta desconhecida." };
              conteudo = JSON.stringify(r);
            } catch (e) {
              erro = true;
              conteudo = "Falha ao consultar os dados.";
              console.error("[assistente] tool", block.name, e);
            }
            results.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: conteudo,
              is_error: erro,
            });
          }
          messages.push({ role: "user", content: results });
        }

        if (respostaCompleta) {
          // Persiste sem a linha de sugestões de continuação (só UI desta sessão)
          const { resposta } = separarSugestoes(respostaCompleta);
          await prisma.assistenteMensagem.create({
            data: {
              conversaId: conversaIdFinal,
              role: "assistant",
              content: resposta || respostaCompleta,
            },
          });
          await prisma.assistenteConversa.update({
            where: { id: conversaIdFinal },
            data: { updatedAt: new Date() },
          });
        }
        // Auditoria: só a ação e os NOMES das ferramentas, nunca o conteúdo
        await auditar({
          lodgeId: user.lodgeId,
          ator: { id: user.id, name: user.name },
          acao: "assistente.pergunta",
          detalhes: { tools: toolsUsadas },
        });
        sse(controller, { type: "done" });
      } catch (e) {
        console.error("[assistente] chat", e);
        sse(controller, {
          type: "error",
          error: "O assistente falhou agora — tente de novo em instantes.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
