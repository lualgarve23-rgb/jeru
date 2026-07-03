import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { canWriteTesouraria } from "@/lib/permissions";
import { generateInvoices, updatePixKey, markInvoicePaid } from "../actions";
import { ActionForm, ActionButton } from "@/components/action-form";
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

const statusVariant = {
  PENDENTE: "outline",
  PAGA: "default",
  VENCIDA: "destructive",
  CANCELADA: "secondary",
} as const;

export default async function MensalidadesPage() {
  const user = await requireRole(
    "TESOUREIRO",
    "VENERAVEL_MESTRE",
    "CONSELHO_CONTAS"
  );
  const isWriter = canWriteTesouraria(user.role);
  const [lodge, invoices] = await Promise.all([
    prisma.lodge.findUniqueOrThrow({ where: { id: user.lodgeId } }),
    prisma.invoice.findMany({
      where: { lodgeId: user.lodgeId },
      orderBy: [{ referenceYear: "desc" }, { referenceMonth: "desc" }],
      include: { user: true },
      take: 200,
    }),
  ]);

  const now = new Date();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Mensalidades (Capitações)</h1>

      {isWriter && (
        <div className="grid max-w-4xl grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Chave Pix da Loja</CardTitle>
              <CardDescription>
                Usada para gerar os QR Codes de cobrança.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={updatePixKey} submitLabel="Salvar chave">
                <Input
                  name="pixKey"
                  defaultValue={lodge.pixKey ?? ""}
                  placeholder="CNPJ, e-mail ou chave aleatória"
                />
              </ActionForm>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Gerar cobranças do mês</CardTitle>
              <CardDescription>
                Cria a capitação para todos os membros ativos (Pix dinâmico).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={generateInvoices} submitLabel="Gerar mensalidades">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="month">Mês</Label>
                    <Input
                      id="month"
                      name="month"
                      type="number"
                      min={1}
                      max={12}
                      defaultValue={now.getMonth() + 1}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="year">Ano</Label>
                    <Input
                      id="year"
                      name="year"
                      type="number"
                      defaultValue={now.getFullYear()}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="amount">Valor (R$)</Label>
                    <Input id="amount" name="amount" type="number" step="0.01" required />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="dueDate">Vencimento</Label>
                    <Input id="dueDate" name="dueDate" type="date" required />
                  </div>
                </div>
              </ActionForm>
            </CardContent>
          </Card>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Referência</TableHead>
            <TableHead>Membro</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Vencimento</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((i) => (
            <TableRow key={i.id}>
              <TableCell>
                {String(i.referenceMonth).padStart(2, "0")}/{i.referenceYear}
              </TableCell>
              <TableCell>{i.user.name}</TableCell>
              <TableCell>
                {(i.amountCents / 100).toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </TableCell>
              <TableCell>{i.dueDate.toLocaleDateString("pt-BR")}</TableCell>
              <TableCell>
                <Badge variant={statusVariant[i.status]}>
                  {i.status}
                  {i.status === "PAGA" && i.paidMethod ? ` · ${i.paidMethod}` : ""}
                </Badge>
              </TableCell>
              <TableCell className="space-x-3">
                <Link
                  className="text-sm underline"
                  href={`/tesouraria/mensalidades/${i.id}`}
                >
                  Cobrança Pix
                </Link>
                {isWriter && i.status !== "PAGA" && (
                  <ActionButton
                    action={markInvoicePaid.bind(null, i.id)}
                    variant="outline"
                    label="Baixa manual"
                  />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
