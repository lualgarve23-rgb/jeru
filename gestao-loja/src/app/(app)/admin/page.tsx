import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { createLodge } from "./actions";
import { LodgeActions } from "./lodge-actions";
import { ActionForm } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const licencaStatusLabels: Record<string, string> = {
  PENDENTE: "Pendente",
  PAGA: "Paga",
  VENCIDA: "Vencida",
};

export default async function AdminPage() {
  await requireRole("SUPER_ADMIN");

  const lodges = await prisma.lodge.findMany({
    where: { number: { not: "0000" } },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { users: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Administração do SaaS</h1>
        <p className="text-sm text-muted-foreground">
          Crie e acompanhe as lojas (tenants) do sistema.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader>
            <CardTitle>Lojas cadastradas</CardTitle>
          </CardHeader>
          <CardContent>
            {lodges.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma loja ainda.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loja</TableHead>
                    <TableHead>Potência</TableHead>
                    <TableHead>Oriente</TableHead>
                    <TableHead>Membros</TableHead>
                    <TableHead>Licença</TableHead>
                    <TableHead>Criada em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lodges.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          {l.logoUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={l.logoUrl}
                              alt=""
                              className="h-7 w-7 rounded-full object-cover"
                            />
                          )}
                          {l.name} nº {l.number}
                        </span>
                      </TableCell>
                      <TableCell>{l.potencia ?? "—"}</TableCell>
                      <TableCell>{l.oriente ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{l._count.users}</Badge>
                      </TableCell>
                      <TableCell>
                        {l.licencaStatus ? (
                          <div className="space-y-0.5">
                            <Badge
                              variant={
                                l.licencaStatus === "PAGA"
                                  ? "success"
                                  : l.licencaStatus === "VENCIDA"
                                    ? "warning"
                                    : "secondary"
                              }
                            >
                              {licencaStatusLabels[l.licencaStatus]}
                            </Badge>
                            <p className="text-xs text-muted-foreground">
                              R${" "}
                              {Number(l.licencaValor ?? 0)
                                .toFixed(2)
                                .replace(".", ",")}
                              {l.licencaStatus === "PAGA" && l.licencaPagaEm
                                ? ` · paga em ${l.licencaPagaEm.toLocaleDateString("pt-BR")}`
                                : l.licencaVencimento
                                  ? ` · vence ${l.licencaVencimento.toLocaleDateString("pt-BR")}`
                                  : ""}
                            </p>
                            {l.licencaInvoiceUrl && (
                              <a
                                href={l.licencaInvoiceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="block text-xs text-primary underline"
                              >
                                Link de pagamento
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            Sem cobrança
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {l.createdAt.toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell>
                        <LodgeActions
                          lodge={{
                            id: l.id,
                            name: l.name,
                            number: l.number,
                            potencia: l.potencia,
                            oriente: l.oriente,
                            address: l.address,
                            licencaValor: l.licencaValor
                              ? Number(l.licencaValor)
                              : null,
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Nova loja</CardTitle>
            <CardDescription>
              Cria o tenant e o Venerável Mestre inicial. A senha inicial do VM
              é o próprio CPF (somente dígitos).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={createLodge} submitLabel="Criar loja">
              <div className="space-y-1">
                <Label htmlFor="name">Nome da loja</Label>
                <Input id="name" name="name" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="number">Número</Label>
                  <Input id="number" name="number" required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="potencia">Potência</Label>
                  <Input id="potencia" name="potencia" placeholder="GOB, GLESP..." />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="oriente">Oriente (cidade/UF)</Label>
                <Input id="oriente" name="oriente" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="address">Endereço da sede</Label>
                <Input
                  id="address"
                  name="address"
                  placeholder="Av. ..., nº — bairro — cidade — UF"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="logo">Logo da loja (até 500 KB)</Label>
                <Input id="logo" name="logo" type="file" accept="image/*" />
              </div>
              <p className="pt-2 text-sm font-medium">Venerável Mestre inicial</p>
              <div className="space-y-1">
                <Label htmlFor="vmName">Nome</Label>
                <Input id="vmName" name="vmName" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="vmCim">CIM</Label>
                  <Input id="vmCim" name="vmCim" required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="vmCpf">CPF</Label>
                  <Input id="vmCpf" name="vmCpf" placeholder="000.000.000-00" required />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="vmEmail">E-mail</Label>
                <Input id="vmEmail" name="vmEmail" type="email" required />
              </div>
              <div className="space-y-2 rounded-md border p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" name="cobrarLicenca" />
                  Cobrar licença do sistema
                </label>
                <div className="space-y-1">
                  <Label htmlFor="licencaValor">Valor da licença (R$)</Label>
                  <Input
                    id="licencaValor"
                    name="licencaValor"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="ex.: 199,90"
                  />
                  <p className="text-xs text-muted-foreground">
                    Gera cobrança boleto/Pix (Asaas da plataforma) em nome do
                    VM, com vencimento em 7 dias.
                  </p>
                </div>
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
