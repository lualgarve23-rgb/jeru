"use client";

// Assistente IA — ícone flutuante que abre o chat: tela cheia no mobile
// (com "Voltar ao aplicativo" e botão voltar do Android via histórico),
// painel lateral no desktop. Os chips PREENCHEM o input sem enviar;
// trechos ___ ficam selecionados para o usuário completar antes de enviar.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  SendHorizonal,
  X,
  Loader2,
  ArrowLeft,
  History,
  SquarePen,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ordenarPorRota } from "@/lib/assistente/sugestoes";
import { partirEmRotas } from "@/lib/assistente/links";
import {
  separarSugestoes,
  ocultarMarcadorParcial,
} from "@/lib/assistente/limites";

type Msg = { role: "user" | "assistant"; content: string };
type Sugestao = { texto: string; rotas?: string[]; fixa?: boolean };
type ConversaResumo = { id: string; titulo: string | null; updatedAt: string };

// Rotas internas citadas em texto puro viram links clicáveis (sem HTML do
// modelo — só o padrão /secretaria/..., /tesouraria/..., /solicitacoes...,
// /dashboard/..., /esmoler, /convite/..., /n/...)
function comLinks(texto: string, chave: string) {
  return partirEmRotas(texto).map((parte, i) =>
    i % 2 ? (
      <Link key={`${chave}-l${i}`} href={parte} className="font-medium underline underline-offset-2">
        {parte}
      </Link>
    ) : (
      parte
    )
  );
}

// O modelo responde com **negrito** de Markdown; renderiza só isso, sem lib.
function comNegrito(texto: string) {
  return texto
    .split(/\*\*([^*]+)\*\*/g)
    .map((parte, i) =>
      i % 2 ? <strong key={i}>{comLinks(parte, `b${i}`)}</strong> : comLinks(parte, `t${i}`)
    );
}

export function Assistente({ sugestoes }: { sugestoes: Sugestao[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [statusTool, setStatusTool] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const conversaId = useRef<string | undefined>(undefined);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  // Histórico de conversas anteriores (lista dentro do próprio painel)
  const [mostrarHistorico, setMostrarHistorico] = useState(false);
  const [conversas, setConversas] = useState<ConversaResumo[] | null>(null);
  const [carregando, setCarregando] = useState(false);

  const abrirHistorico = useCallback(async () => {
    setMostrarHistorico(true);
    setErro(null);
    try {
      const res = await fetch("/api/assistente/conversas");
      if (!res.ok) throw new Error();
      setConversas((await res.json()).conversas);
    } catch {
      setConversas([]);
      setErro("Não foi possível carregar as conversas anteriores.");
    }
  }, []);

  const novaConversa = useCallback(() => {
    conversaId.current = undefined;
    setMsgs([]);
    setErro(null);
    setMostrarHistorico(false);
  }, []);

  const retomarConversa = useCallback(async (id: string) => {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/assistente/conversas/${id}`);
      if (!res.ok) throw new Error();
      const j: { id: string; mensagens: Msg[] } = await res.json();
      conversaId.current = j.id;
      setMsgs(j.mensagens);
      setMostrarHistorico(false);
    } catch {
      setErro("Não foi possível abrir essa conversa.");
    } finally {
      setCarregando(false);
    }
  }, []);

  const apagarConversa = useCallback(async (id: string) => {
    setConversas((c) => c?.filter((x) => x.id !== id) ?? c);
    if (conversaId.current === id) {
      conversaId.current = undefined;
      setMsgs([]);
    }
    await fetch(`/api/assistente/conversas/${id}`, { method: "DELETE" }).catch(
      () => null
    );
  }, []);

  const chipsPanel = ordenarPorRota(sugestoes, pathname, 8);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, statusTool]);

  // Abrir/fechar com entrada no histórico: o botão voltar do celular fecha
  // o chat em vez de sair da página.
  const abrir = useCallback(() => {
    setOpen((jaAberto) => {
      if (!jaAberto) window.history.pushState({ assistente: true }, "");
      return true;
    });
  }, []);
  const fechar = useCallback(() => {
    if (window.history.state?.assistente) window.history.back();
    else setOpen(false);
  }, []);
  useEffect(() => {
    const aoVoltar = () => setOpen(false);
    window.addEventListener("popstate", aoVoltar);
    return () => window.removeEventListener("popstate", aoVoltar);
  }, []);

  // Chip preenche SEM enviar; se tiver ___, seleciona o trecho para completar
  const preencher = useCallback((texto: string) => {
    setInput(texto);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const i = texto.indexOf("___");
      if (i >= 0) el.setSelectionRange(i, i + 3);
      else el.setSelectionRange(texto.length, texto.length);
    });
  }, []);

  async function enviar(texto?: string) {
    const pergunta = (texto ?? input).trim();
    if (!pergunta || ocupado) return;
    abrir();
    setMostrarHistorico(false);
    setInput("");
    setErro(null);
    setOcupado(true);
    setMsgs((m) => [...m, { role: "user", content: pergunta }, { role: "assistant", content: "" }]);
    try {
      const res = await fetch("/api/assistente/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mensagem: pergunta,
          conversaId: conversaId.current,
          rota: pathname,
        }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "O assistente está indisponível agora.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const partes = buffer.split("\n\n");
        buffer = partes.pop() ?? "";
        for (const parte of partes) {
          const linha = parte.split("\n").find((l) => l.startsWith("data: "));
          if (!linha) continue;
          const ev = JSON.parse(linha.slice(6));
          if (ev.type === "conversa") conversaId.current = ev.conversaId;
          else if (ev.type === "tool") {
            setStatusTool("Consultando os dados da loja…");
            // Separa o texto dito antes da ferramenta do que vem depois.
            setMsgs((m) => {
              const ultima = m[m.length - 1];
              if (!ultima?.content || /\s$/.test(ultima.content)) return m;
              const copia = [...m];
              copia[copia.length - 1] = { ...ultima, content: ultima.content + "\n\n" };
              return copia;
            });
          }
          else if (ev.type === "text") {
            setStatusTool(null);
            setMsgs((m) => {
              const copia = [...m];
              const ultima = copia[copia.length - 1];
              copia[copia.length - 1] = {
                ...ultima,
                content: ultima.content + ev.delta,
              };
              return copia;
            });
          } else if (ev.type === "error") setErro(ev.error);
        }
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao falar com o assistente.");
      setMsgs((m) => (m[m.length - 1]?.content === "" ? m.slice(0, -1) : m));
    } finally {
      setStatusTool(null);
      setOcupado(false);
    }
  }

  return (
    <>
      {/* Ícone flutuante do assistente (acima do BottomNav no mobile) */}
      {!open && (
        <button
          type="button"
          onClick={abrir}
          aria-label="Abrir o Assistente da Loja"
          className="fixed bottom-[5.2rem] right-4 z-30 flex h-13 w-13 items-center justify-center rounded-full bg-primary text-white shadow-xl transition-transform hover:scale-105 print:hidden lg:bottom-6 lg:right-6"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}

      {/* Painel lateral */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 lg:bg-black/20"
          aria-hidden="true"
          onClick={fechar}
        />
      )}
      <aside
        role="dialog"
        aria-label="Assistente da Loja"
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full translate-x-full flex-col bg-card shadow-xl transition-transform duration-200 ease-out print:hidden lg:max-w-md",
          open && "translate-x-0"
        )}
      >
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <button
            type="button"
            aria-label="Voltar ao aplicativo"
            onClick={fechar}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary lg:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Sparkles className="h-5 w-5 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-tight">Assistente da Loja</p>
            <p className="text-xs text-muted-foreground">
              Respostas com base nos seus dados no sistema
            </p>
          </div>
          {(msgs.length > 0 || mostrarHistorico) && (
            <button
              type="button"
              aria-label="Nova conversa"
              title="Nova conversa"
              onClick={novaConversa}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary"
            >
              <SquarePen className="h-5 w-5" />
            </button>
          )}
          <button
            type="button"
            aria-label="Conversas anteriores"
            title="Conversas anteriores"
            onClick={() =>
              mostrarHistorico ? setMostrarHistorico(false) : abrirHistorico()
            }
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary",
              mostrarHistorico && "bg-secondary text-foreground"
            )}
          >
            <History className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Fechar assistente"
            onClick={fechar}
            className="hidden h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary lg:flex"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {mostrarHistorico ? (
            <div className="space-y-2">
              <p className="mb-3 text-sm font-semibold">Conversas anteriores</p>
              {conversas === null ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                </p>
              ) : conversas.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Você ainda não tem conversas guardadas — pergunte algo para
                  começar.
                </p>
              ) : (
                conversas.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => retomarConversa(c.id)}
                      disabled={carregando}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-sm">
                        {c.titulo || "Conversa sem título"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(c.updatedAt).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                        })}{" "}
                        às{" "}
                        {new Date(c.updatedAt).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </button>
                    <button
                      type="button"
                      aria-label="Apagar conversa"
                      title="Apagar conversa"
                      onClick={() => apagarConversa(c.id)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
              {erro && (
                <p className="text-sm text-destructive" role="alert">
                  {erro}
                </p>
              )}
            </div>
          ) : msgs.length === 0 ? (
            <div className="flex h-full flex-col justify-center gap-2">
              <p className="mb-2 text-center text-sm text-muted-foreground">
                Toque numa pergunta para começar — dá para editar antes de
                enviar:
              </p>
              {chipsPanel.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => preencher(c)}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-left text-sm hover:border-primary/40"
                >
                  {c}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {msgs.map((m, i) => {
                // Sugestões de continuação da IA viram chips (só na última
                // resposta, terminada); o marcador nunca aparece no texto.
                const { resposta, sugestoes } =
                  m.role === "assistant"
                    ? separarSugestoes(m.content)
                    : { resposta: m.content, sugestoes: [] };
                const texto = ocultarMarcadorParcial(resposta);
                const mostrarSugestoes =
                  !ocupado && i === msgs.length - 1 && sugestoes.length > 0;
                return (
                  <div key={i}>
                    <div
                      className={cn(
                        "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm",
                        m.role === "user"
                          ? "ml-auto bg-primary text-white"
                          : "bg-secondary text-foreground"
                      )}
                    >
                      {texto ? (
                        comNegrito(texto)
                      ) : ocupado && i === msgs.length - 1 ? (
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {statusTool ?? "Pensando…"}
                        </span>
                      ) : (
                        ""
                      )}
                    </div>
                    {mostrarSugestoes && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {sugestoes.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => preencher(s)}
                            className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground hover:border-primary/40"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {erro && (
                <p className="text-sm text-destructive" role="alert">
                  {erro}
                </p>
              )}
              <div ref={fimRef} />
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            enviar();
          }}
          className="border-t border-border p-3"
        >
          <div className="flex items-end gap-2 rounded-2xl border border-border bg-background px-3 py-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviar();
                }
              }}
              rows={1}
              placeholder="Escreva a sua pergunta…"
              aria-label="Escreva a sua pergunta"
              className="max-h-32 min-w-0 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              aria-label="Enviar pergunta"
              disabled={!input.trim() || ocupado}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-white disabled:opacity-40"
            >
              {ocupado ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SendHorizonal className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
            O assistente pode errar — confirme informações importantes com a
            Secretaria.
          </p>
        </form>
      </aside>
    </>
  );
}
