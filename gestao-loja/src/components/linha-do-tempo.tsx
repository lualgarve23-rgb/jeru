export type EtapaLinha = { cargo: string; at: Date | null; feito?: boolean };

/* Linha do tempo de etapas de um processo — mostra o que já foi concluído,
   a etapa pendente (com quem está) e o que ainda falta. */
export function LinhaDoTempo({
  etapas,
  concluido,
}: {
  etapas: EtapaLinha[];
  concluido: boolean;
}) {
  const feitoDe = (e: EtapaLinha) => e.feito ?? !!e.at;
  const atual = etapas.findIndex((e) => !feitoDe(e));
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs">
      {etapas.map((e, i) => {
        const feito = feitoDe(e);
        const vez = !concluido && i === atual;
        return (
          <li key={e.cargo} className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${
                feito
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : vez
                    ? "border-amber-300 bg-amber-50 font-medium text-amber-900"
                    : "border-muted text-muted-foreground"
              }`}
            >
              {feito ? "✓" : vez ? "⏳" : "○"} {e.cargo}
              {feito && e.at && (
                <span className="font-normal text-emerald-700/80">
                  {e.at.toLocaleDateString("pt-BR")}
                </span>
              )}
            </span>
            {i < etapas.length - 1 && (
              <span aria-hidden="true" className="text-muted-foreground">
                →
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
