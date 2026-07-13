import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { canWriteTesouraria } from "@/lib/permissions";
import { syncInadimplencia } from "@/lib/inadimplencia";
import {
  generateInvoices,
  updatePixKey,
  markInvoicePaid,
  updateAsaasConfig,
  createAsaasCharge,
  enableAsaasSubscriptions,
  cancelAsaasSubscription,
} from "../actions";
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
  // Inadimplência automática: vence capitações e ajusta ATIVO↔IRREGULAR
  await syncInadimplencia(user.lodgeId);
  const [lodge, invoices, subscribers] = await Promise.all([
    prisma.lodge.findUniqueOrThrow({ where: { id: user.lodgeId } }),
    prisma.invoice.findMany({
      where: { lodgeId: user.lodgeId },
      orderBy: [{ referenceYear: "desc" }, { referenceMonth: "desc" }],
      include: { user: true },
      take: 200,
    }),
    prisma.user.findMany({
      where: { lodgeId: user.lodgeId, asaasSubscriptionId: { not: null } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, asaasSubscriptionId: true },
    }),
  ]);
  const asaasReady = Boolean(lodge.asaasApiKey);

  const now = new Date();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Mensalidades (Capitações)</h1>
        <a
          className="flex h-9 items-center rounded-md border px-3 text-sm underline-offset-2 hover:underline"
          href="/tesouraria/mensalidades/export"
          download
        >
          Exportar CSV (inadimplência)
        </a>
      </div>

      {isWriter && (
        <div className="grid max-w-4xl gap-6 sm:grid-cols-2">
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
          <Card>
            <CardHeader>
              <CardTitle>Gateway Asaas</CardTitle>
              <CardDescription>
                Cobrança por cartão e boleto (avulsa e recorrente). Configure o
                webhook no Asaas para <code>/api/webhooks/asaas</code> com o
                token abaixo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={updateAsaasConfig} submitLabel="Salvar gateway">
                <div className="space-y-1">
                  <Label htmlFor="asaasApiKey">API key</Label>
                  <Input
                    id="asaasApiKey"
                    name="asaasApiKey"
                    type="password"
                    defaultValue={lodge.asaasApiKey ?? ""}
                    placeholder="$aact_..."
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="asaasWebhookToken">Token do webhook</Label>
                  <Input
                    id="asaasWebhookToken"
                    name="asaasWebhookToken"
                    defaultValue={lodge.asaasWebhookToken ?? ""}
                    placeholder="token secreto conferido no webhook"
                  />
                </div>
              </ActionForm>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assinaturas recorrentes</CardTitle>
              <CardDescription>
                Ativa a cobrança mensal automática (cartão/boleto/Pix à escolha
                do irmão) para os membros ativos sem assinatura.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {asaasReady ? (
                <ActionForm
                  action={enableAsaasSubscriptions}
                  submitLabel="Ativar assinaturas"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="subAmount">Valor mensal (R$)</Label>
                      <Input
                        id="subAmount"
                        name="amount"
                        type="number"
                        step="0.01"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="nextDueDate">1º vencimento</Label>
                      <Input
                        id="nextDueDate"
                        name="nextDueDate"
                        type="date"
                        required
                      />
                    </div>
                  </div>
                </ActionForm>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Salve a API key do Asaas para ativar assinaturas.
                </p>
              )}
              {subscribers.length > 0 && (
                <ul className="space-y-2 text-sm">
                  {subscribers.map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span className="min-w-0">
                        {s.name}{" "}
                        <span className="text-muted-foreground">
                          · {s.asaasSubscriptionId}
                        </span>
                      </span>
                      <ActionButton
                        action={cancelAsaasSubscription.bind(null, s.id)}
                        variant="outline"
                        label="Cancelar"
                      />
                    </li>
                  ))}
                </ul>
              )}
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
                {i.gatewayInvoiceUrl ? (
                  <a
                    className="text-sm underline"
                    href={i.gatewayInvoiceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Cartão/Boleto
                  </a>
                ) : (
                  isWriter &&
                  asaasReady &&
                  i.status !== "PAGA" && (
                    <ActionButton
                      action={createAsaasCharge.bind(null, i.id)}
                      variant="secondary"
                      label="Cobrar via Asaas"
                    />
                  )
                )}
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
