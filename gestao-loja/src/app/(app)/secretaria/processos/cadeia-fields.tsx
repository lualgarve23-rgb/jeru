import { Label } from "@/components/ui/label";
import { CARGOS_PROCESSO, cargoLabel } from "@/lib/processos";

// Selects da cadeia de assinantes (ordem de assinatura); o Venerável Mestre
// entra automaticamente como último — não aparece como opção
export function SelecaoCadeia({ prefixo = "" }: { prefixo?: string }) {
  return (
    <>
      {[1, 2].map((n) => (
        <div key={n} className="space-y-1">
          <Label htmlFor={`${prefixo}assinante${n}`}>{n}º assinante</Label>
          <select
            id={`${prefixo}assinante${n}`}
            name={`assinante${n}`}
            defaultValue={n === 1 ? "SECRETARIO" : ""}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="">— nenhum —</option>
            {CARGOS_PROCESSO.map((c) => (
              <option key={c} value={c}>
                {cargoLabel(c)}
              </option>
            ))}
          </select>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        O Venerável Mestre assina sempre por último — ele é acrescentado
        automaticamente ao fim da cadeia.
      </p>
    </>
  );
}
