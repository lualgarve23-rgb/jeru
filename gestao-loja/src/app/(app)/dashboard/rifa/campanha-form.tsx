"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mediaSrc } from "@/lib/media-url";
import { criarRifa, atualizarRifa, encerrarRifa, removerFotoRifa } from "./actions";


export type CampanhaFormDados = {
  titulo: string;
  descricao: string | null;
  inicio: string; // AAAA-MM-DD
  fim: string;
  sorteio: string;
  quantidadeNumeros: number;
  valorReais: string; // "10.00"
  sorteada: boolean;
  fotos: string[]; // chaves media: das fotos do prêmio
};

/*
 * Formulário da campanha da Rifa (usado nas Configurações da Loja e na
 * página da Rifa): habilita uma campanha nova ou edita a ativa.
 */
export function CampanhaForm({ atual }: { atual: CampanhaFormDados | null }) {
  const [state, formAction, pending] = useActionState(atual ? atualizarRifa : criarRifa, undefined);
  const [encerrar, encerrarAction, encerrando] = useActionState(async () => encerrarRifa(), undefined);
  const travado = !!atual?.sorteada;
  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-3">
        <fieldset disabled={travado} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="rifa-titulo">Título da campanha</Label>
            <Input id="rifa-titulo" name="titulo" required maxLength={120} placeholder="Ex.: Rifa de Natal 2026" defaultValue={atual?.titulo ?? ""} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rifa-descricao">Prêmio / finalidade (opcional)</Label>
            <textarea
              id="rifa-descricao"
              name="descricao"
              rows={2}
              maxLength={1000}
              placeholder="Ex.: Cesta de Natal; renda destinada às famílias assistidas pela Loja."
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
              defaultValue={atual?.descricao ?? ""}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="rifa-inicio">Início das vendas</Label>
              <Input id="rifa-inicio" name="inicio" type="date" required defaultValue={atual?.inicio ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rifa-fim">Fim das vendas</Label>
              <Input id="rifa-fim" name="fim" type="date" required defaultValue={atual?.fim ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rifa-sorteio">Data do sorteio</Label>
              <Input id="rifa-sorteio" name="sorteio" type="date" required defaultValue={atual?.sorteio ?? ""} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="rifa-qtd">Quantidade de números</Label>
              <Input id="rifa-qtd" name="quantidadeNumeros" type="number" min={2} max={10000} required defaultValue={atual?.quantidadeNumeros ?? 100} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rifa-valor">Valor de cada número (R$)</Label>
              <Input id="rifa-valor" name="valor" type="number" min={1} step="0.01" inputMode="decimal" required defaultValue={atual?.valorReais ?? "10.00"} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rifa-fotos">Fotos do prêmio {atual?.fotos.length ? `(${atual.fotos.length} de 6)` : "(até 6, PNG/JPG/WebP de até 3 MB)"}</Label>
            <Input id="rifa-fotos" name="fotos" type="file" accept="image/png,image/jpeg,image/webp" multiple />
            <p className="text-xs text-muted-foreground">As fotos aparecem para os irmãos na página da Rifa.</p>
          </div>
        </fieldset>
        {state?.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
        {state?.ok && <p className="text-sm text-success">{state.ok}</p>}
        {!travado && (
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando..." : atual ? "Salvar alterações" : "Habilitar campanha"}
          </Button>
        )}
      </form>
      {atual && atual.fotos.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium">Fotos atuais</p>
          <ul className="flex flex-wrap gap-2">
            {atual.fotos.map((f) => (
              <FotoAtual key={f} chave={f} podeRemover={!travado} />
            ))}
          </ul>
        </div>
      )}
      {atual && (
        <form
          action={encerrarAction}
          className="flex flex-col gap-1 border-t pt-3"
          onSubmit={(e) => {
            if (!window.confirm(travado
              ? "Encerrar a campanha? Ela sai do menu dos irmãos; o resultado fica no histórico."
              : "Encerrar a campanha antes do sorteio? Os números reservados ficam no histórico, mas a rifa some do menu dos irmãos."))
              e.preventDefault();
          }}
        >
          <div>
            <Button type="submit" variant="outline" size="sm" disabled={encerrando}>
              {encerrando ? "..." : travado ? "Encerrar e arquivar campanha" : "Encerrar campanha"}
            </Button>
          </div>
          {encerrar?.error && <p className="text-sm text-destructive">{encerrar.error}</p>}
          {encerrar?.ok && <p className="text-sm text-success">{encerrar.ok}</p>}
        </form>
      )}
    </div>
  );
}

function FotoAtual({ chave, podeRemover }: { chave: string; podeRemover: boolean }) {
  const [state, formAction, pending] = useActionState(async () => removerFotoRifa(chave), undefined);
  return (
    <li className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={mediaSrc(chave) ?? ""} alt="Foto do prêmio" className="h-24 w-24 rounded-md border object-cover" />
      {podeRemover && (
        <form
          action={formAction}
          onSubmit={(e) => {
            if (!window.confirm("Remover esta foto?")) e.preventDefault();
          }}
        >
          <button
            type="submit"
            disabled={pending}
            aria-label="Remover foto"
            className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border bg-white text-xs text-destructive shadow"
          >
            {pending ? "…" : "×"}
          </button>
        </form>
      )}
      {state?.error && <p className="text-xs text-destructive">{state.error}</p>}
    </li>
  );
}
