import { requireRole } from "@/lib/session";
import { createMember } from "../../actions";
import { ActionForm } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function NovoMembroPage() {
  await requireRole("SECRETARIO", "VENERAVEL_MESTRE");
  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-2xl font-bold">Novo Membro</h1>
      <ActionForm action={createMember} submitLabel="Cadastrar">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="cim">CIM</Label>
            <Input id="cim" name="cim" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cpf">CPF</Label>
            <Input id="cpf" name="cpf" required />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="name">Nome completo</Label>
          <Input id="name" name="name" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="phone">Telefone</Label>
            <Input id="phone" name="phone" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="profession">Profissão</Label>
            <Input id="profession" name="profession" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="degree">Grau</Label>
            <select
              id="degree"
              name="degree"
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              defaultValue="APRENDIZ"
            >
              <option value="APRENDIZ">Aprendiz</option>
              <option value="COMPANHEIRO">Companheiro</option>
              <option value="MESTRE">Mestre</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="initiationDate">Data de iniciação</Label>
            <Input id="initiationDate" name="initiationDate" type="date" />
          </div>
        </div>
        <p className="text-xs text-neutral-500">
          A senha inicial do membro é o próprio CPF (somente números).
        </p>
      </ActionForm>
    </div>
  );
}
