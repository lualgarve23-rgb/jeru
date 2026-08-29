"use client";

// Assistente IA — barra fixa inferior + painel lateral com streaming SSE.
// Os chips PREENCHEM o input sem enviar; trechos ___ ficam selecionados
// para o usuário completar antes de enviar.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, SendHorizonal, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ordenarPorRota } from "@/lib/assistente/sugestoes";

type Msg = { role: "user" | "assistant"; content: string };
type Sugestao = { texto: string; rotas?: string[] };

// O modelo responde com **negrito** de Markdown; renderiza só isso, sem lib.
function comNegrito(texto: string) {
  return texto
    .split(/\*\*([^*]+)\*\*/g)
    .map((parte, i) => (i % 2 ? <strong key={i}>{parte}</strong> : parte));
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

  const chipsBar = ordenarPorRota(sugestoes, pathname, 2);
  const chipsPanel = ordenarPorRota(sugestoes, pathname, 8);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, statusTool]);

  // Chip preenche SEM enviar; se tiver ___, seleciona o trecho para completar
  const preencher = useCallback((texto: string) => {
    setOpen(true);
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
    setOpen(true);
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
      {/* Barra fixa inferior (acima do BottomNav no mobile) */}
      {!open && (
        <div className="fixed inset-x-3 bottom-[5.2rem] z-30 mx-auto max-w-xl print:hidden lg:inset-x-auto lg:bottom-4 lg:left-1/2 lg:ml-32 lg:w-full lg:-translate-x-1/2">
          <div className="flex flex-col gap-1.5">
            <div className="hidden justify-center gap-2 lg:flex">
              {chipsBar.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => preencher(c)}
                  className="rounded-full border border-border bg-card/95 px-3 py-1 text-xs text-muted-foreground shadow-card backdrop-blur-md hover:text-foreground"
                >
                  {c}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                enviar();
              }}
              className="flex items-center gap-2 rounded-full border border-border bg-card/95 py-1.5 pl-4 pr-1.5 shadow-card backdrop-blur-md"
            >
              <Sparkles className="h-4 w-4 shrink-0 text-primary" />
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onFocus={() => msgs.length > 0 && setOpen(true)}
                placeholder="Pergunte ao Assistente da Loja…"
                aria-label="Pergunte ao Assistente da Loja"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                aria-label="Enviar pergunta"
                disabled={!input.trim() || ocupado}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-white disabled:opacity-40"
              >
                <SendHorizonal className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Painel lateral */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 lg:bg-black/20"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        role="dialog"
        aria-label="Assistente da Loja"
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-md translate-x-full flex-col bg-card shadow-xl transition-transform duration-200 ease-out print:hidden",
          open && "translate-x-0"
        )}
      >
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Sparkles className="h-5 w-5 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-tight">Assistente da Loja</p>
            <p className="text-xs text-muted-foreground">
              Respostas com base nos seus dados no sistema
            </p>
          </div>
          <button
            type="button"
            aria-label="Fechar assistente"
            onClick={() => setOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {msgs.length === 0 ? (
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
              {msgs.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm",
                    m.role === "user"
                      ? "ml-auto bg-primary text-white"
                      : "bg-secondary text-foreground"
                  )}
                >
                  {m.content ? (
                    comNegrito(m.content)
                  ) : ocupado && i === msgs.length - 1 ? (
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {statusTool ?? "Pensando…"}
                    </span>
                  ) : (
                    ""
                  )}
                </div>
              ))}
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
