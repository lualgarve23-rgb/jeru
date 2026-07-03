import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { ActionForm } from "@/components/action-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { updatePrivacy } from "./actions";

const fields = [
  { name: "showEmail", label: "E-mail", key: "email" },
  { name: "showPhone", label: "Telefone", key: "phone" },
  { name: "showAddress", label: "Endereço", key: "address" },
  { name: "showBirthDate", label: "Data de nascimento", key: "birthDate" },
] as const;

export default async function PrivacidadePage() {
  const sessionUser = await requireUser();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: sessionUser.id },
    select: {
      email: true,
      phone: true,
      address: true,
      birthDate: true,
      showEmail: true,
      showPhone: true,
      showAddress: true,
      showBirthDate: true,
    },
  });

  const currentValue: Record<string, string> = {
    email: user.email,
    phone: user.phone ?? "—",
    address: user.address ?? "—",
    birthDate: user.birthDate
      ? user.birthDate.toLocaleDateString("pt-BR")
      : "—",
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Painel de Privacidade (LGPD)</h1>
        <p className="text-sm text-neutral-500">
          Escolha quais dados de contato ficam visíveis para os demais membros
          da loja. A Secretaria, o Venerável Mestre e o Conselho de Contas
          continuam com acesso administrativo aos cadastros, conforme a base
          legal de execução das atividades da loja.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Visibilidade dos meus dados</CardTitle>
          <CardDescription>
            Dados desmarcados aparecem mascarados na lista de membros.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={updatePrivacy} submitLabel="Salvar preferências">
            <div className="space-y-3">
              {fields.map((f) => (
                <label
                  key={f.name}
                  className="flex items-center justify-between gap-4 rounded-md border p-3"
                >
                  <span>
                    <span className="block text-sm font-medium">{f.label}</span>
                    <span className="block text-sm text-neutral-500">
                      {currentValue[f.key]}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    name={f.name}
                    defaultChecked={user[f.name]}
                    className="h-4 w-4"
                  />
                </label>
              ))}
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
