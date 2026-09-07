"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { marcarPagamento, registrarSorteio, reservarNumerosPara, sortearPeloSistema } from "./actions";


// Venda presencial: o gestor registra números em nome de um irmão
export function VendaPresencialForm({ irmaos }: { irmaos: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(reservarNumerosPara, undefined);
  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="venda-irmao">Irmão</Label>
          <select id="venda-irmao" name="userId" required className="h-9 w-full rounded-md border border-border bg-transparent px-3 text-sm">
            <option value="">Selecione…</option>
            {irmaos.map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="venda-numeros">Números (separados por vírgula)</Label>
          <Input id="venda-numeros" name="numeros" required placeholder="Ex.: 7, 15, 42" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="pago" className="h-4 w-4" /> Já recebido (dar baixa no pagamento)
      </label>
      {state?.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
      {state?.ok && <p className="text-sm text-success">{state.ok}</p>}
      <Button type="submit" size="sm" disabled={pending}>{pending ? "Registrando..." : "Registrar venda"}</Button>
    </form>
  );
}

// Baixa/estorno de pagamento de um número
export function PagoToggle({ numeroId, pago }: { numeroId: string; pago: boolean }) {
  const [state, formAction, pending] = useActionState(async () => marcarPagamento(numeroId, !pago), undefined);
  return (
    <form action={formAction} className="inline-flex flex-col">
      <button
        type="submit"
        disabled={pending}
        className={pago ? "text-xs text-success underline" : "text-xs text-[#b5651d] underline"}
        title={pago ? "Clique para desfazer a baixa" : "Clique para dar baixa no pagamento"}
      >
        {pending ? "..." : pago ? "pago" : "a receber"}
      </button>
      {state?.error && <span className="text-xs text-destructive">{state.error}</span>}
    </form>
  );
}

// Sorteio: informa o número e o sistema aponta o irmão
export function SorteioForm({ quantidade }: { quantidade: number }) {
  const [state, formAction, pending] = useActionState(registrarSorteio, undefined);
  return (
    <form
      action={formAction}
      className="space-y-3"
      onSubmit={(e) => {
        const n = (e.currentTarget.elements.namedItem("numero") as HTMLInputElement | null)?.value;
        if (!window.confirm(`Registrar o número ${n} como sorteado? Isto encerra a campanha e avisa os irmãos.`)) e.preventDefault();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="sorteio-numero">Número sorteado (1 a {quantidade})</Label>
          <Input id="sorteio-numero" name="numero" type="number" min={1} max={quantidade} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sorteio-obs">Observação (opcional)</Label>
          <Input id="sorteio-obs" name="observacao" maxLength={500} placeholder="Ex.: sorteado em sessão, pela Loteria Federal…" />
        </div>
      </div>
      {state?.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
      {state?.ok && <p className="text-sm text-success">{state.ok}</p>}
      <Button type="submit" size="sm" disabled={pending}>{pending ? "Registrando..." : "Registrar sorteio"}</Button>
    </form>
  );
}

// Sorteio pelo sistema: entre os pagos por padrão; opção de incluir os não pagos
export function SorteioAutomaticoForm({ pagos, reservados }: { pagos: number; reservados: number }) {
  const [state, formAction, pending] = useActionState(sortearPeloSistema, undefined);
  return (
    <form
      action={formAction}
      className="space-y-3"
      onSubmit={(e) => {
        const todos = (e.currentTarget.elements.namedItem("incluirNaoPagos") as HTMLInputElement | null)?.checked;
        if (!window.confirm(`Sortear agora pelo sistema entre ${todos ? `os ${reservados} números reservados` : `os ${pagos} números pagos`}? O resultado é definitivo e avisa os irmãos.`)) e.preventDefault();
      }}
    >
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="incluirNaoPagos" className="h-4 w-4" /> Incluir também os números ainda não pagos ({reservados - pagos})
      </label>
      <div className="space-y-1">
        <Label htmlFor="auto-obs">Observação (opcional)</Label>
        <Input id="auto-obs" name="observacao" maxLength={500} placeholder="Ex.: sorteio realizado em sessão, na presença dos irmãos" />
      </div>
      {state?.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
      {state?.ok && <p className="text-sm text-success">{state.ok}</p>}
      <Button type="submit" size="sm" disabled={pending}>{pending ? "Sorteando..." : "Sortear agora pelo sistema"}</Button>
    </form>
  );
}
