"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { reservarNumeros, liberarNumero } from "./actions";

type ActionResult = { error?: string; ok?: string } | undefined;

export type NumeroOcupado = {
  id: string;
  numero: number;
  meu: boolean;
  pago: boolean;
  nome: string | null; // só o gestor recebe os nomes dos outros
};

const BLOCO = 100;

/*
 * Grade de números da Rifa: livres (clicáveis), meus (destacados) e dos
 * outros irmãos (bloqueados). Blocos de 100 para rifas grandes. A reserva
 * vai como campos "numeros" para a server action.
 */
export function GradeNumeros({
  quantidade,
  valorCents,
  ocupados,
  podeReservar,
  gestor,
}: {
  quantidade: number;
  valorCents: number;
  ocupados: NumeroOcupado[];
  podeReservar: boolean;
  gestor: boolean;
}) {
  const [bloco, setBloco] = useState(0);
  const [escolhidos, setEscolhidos] = useState<number[]>([]);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionResult, fd: FormData) => {
      const r = await reservarNumeros(prev, fd);
      if (r?.ok) setEscolhidos([]);
      return r;
    },
    undefined
  );
  const mapa = useMemo(() => new Map(ocupados.map((o) => [o.numero, o])), [ocupados]);
  const blocos = Math.ceil(quantidade / BLOCO);
  const inicio = bloco * BLOCO + 1;
  const fim = Math.min(quantidade, inicio + BLOCO - 1);
  const numeros = Array.from({ length: fim - inicio + 1 }, (_, i) => inicio + i);
  const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  function alternar(n: number) {
    setEscolhidos((atual) => (atual.includes(n) ? atual.filter((x) => x !== n) : [...atual, n].sort((a, b) => a - b)));
  }

  return (
    <div className="space-y-3">
      {blocos > 1 && (
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: blocos }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setBloco(i)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs",
                i === bloco ? "bg-primary text-primary-foreground" : "bg-secondary"
              )}
            >
              {i * BLOCO + 1}–{Math.min(quantidade, (i + 1) * BLOCO)}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10" role="group" aria-label="Números da rifa">
        {numeros.map((n) => {
          const o = mapa.get(n);
          const escolhido = escolhidos.includes(n);
          const livre = !o;
          const titulo = o
            ? o.meu
              ? `Seu número${o.pago ? " (pago)" : ""}`
              : o.nome
                ? `${o.nome}${o.pago ? " (pago)" : ""}`
                : "Reservado por outro irmão"
            : "Livre";
          return (
            <button
              key={n}
              type="button"
              title={titulo}
              aria-pressed={escolhido}
              disabled={!livre || !podeReservar}
              onClick={() => alternar(n)}
              className={cn(
                "flex h-9 items-center justify-center rounded-md border text-sm font-medium tabular-nums transition-colors",
                livre && podeReservar && "bg-white hover:bg-gold-soft",
                livre && !podeReservar && "bg-white text-muted-foreground",
                escolhido && "border-primary bg-primary text-primary-foreground hover:bg-primary",
                o?.meu && "border-gold bg-gold-soft text-gold-text",
                o && !o.meu && "bg-secondary text-muted-foreground line-through"
              )}
            >
              {n}
            </button>
          );
        })}
      </div>

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span><span className="mr-1 inline-block h-3 w-3 rounded-sm border bg-white align-middle" /> livre</span>
        <span><span className="mr-1 inline-block h-3 w-3 rounded-sm border border-gold bg-gold-soft align-middle" /> meus</span>
        <span><span className="mr-1 inline-block h-3 w-3 rounded-sm border bg-secondary align-middle" /> de outro irmão</span>
        {podeReservar && <span><span className="mr-1 inline-block h-3 w-3 rounded-sm bg-primary align-middle" /> escolhido agora</span>}
      </p>

      {podeReservar && (
        <form action={formAction} className="space-y-2 rounded-xl border bg-secondary/40 p-3">
          {escolhidos.map((n) => (
            <input key={n} type="hidden" name="numeros" value={n} />
          ))}
          <p className="text-sm">
            {escolhidos.length === 0
              ? "Toque nos números livres para escolher."
              : `${escolhidos.length} número${escolhidos.length > 1 ? "s" : ""} (${escolhidos.join(", ")}) — total ${brl(escolhidos.length * valorCents)}`}
          </p>
          {state?.error && (
            <p className="text-sm text-destructive" role="alert">{state.error}</p>
          )}
          {state?.ok && <p className="text-sm text-success">{state.ok}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={pending || escolhidos.length === 0}>
              {pending ? "Reservando..." : "Reservar meus números"}
            </Button>
            {escolhidos.length > 0 && (
              <Button type="button" size="sm" variant="outline" onClick={() => setEscolhidos([])}>
                Limpar
              </Button>
            )}
          </div>
        </form>
      )}
      {!podeReservar && !gestor && (
        <p className="text-sm text-muted-foreground">A campanha não está em período de vendas.</p>
      )}
    </div>
  );
}

// Botão "liberar" de um número (o próprio irmão, não pago; ou o gestor)
export function LiberarNumeroButton({ numeroId, numero }: { numeroId: string; numero: number }) {
  const [state, formAction, pending] = useActionState(async () => liberarNumero(numeroId), undefined);
  return (
    <form
      action={formAction}
      className="inline-flex flex-col"
      onSubmit={(e) => {
        if (!window.confirm(`Liberar o número ${numero}?`)) e.preventDefault();
      }}
    >
      <button type="submit" disabled={pending} className="text-xs text-muted-foreground underline hover:text-destructive">
        {pending ? "..." : "liberar"}
      </button>
      {state?.error && <span className="text-xs text-destructive">{state.error}</span>}
    </form>
  );
}
