import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Seleção de categoria financeira com cadastro dinâmico: escolher uma
// existente ou digitar uma nova (criada ao salvar o lançamento).
export function CategoriaSelect({
  categorias,
  defaultValue,
}: {
  categorias: string[];
  defaultValue?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1">
        <Label htmlFor="category">Categoria</Label>
        <select
          id="category"
          name="category"
          defaultValue={defaultValue ?? ""}
          className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
        >
          <option value="">— sem categoria —</option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="novaCategoria">…ou criar nova</Label>
        <Input
          id="novaCategoria"
          name="novaCategoria"
          placeholder="ex.: Biblioteca"
        />
        <p className="text-xs text-muted-foreground">
          Se preenchida, a nova categoria é cadastrada e usada no lançamento.
        </p>
      </div>
    </div>
  );
}
