import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { canWriteTesouraria } from "@/lib/permissions";
import {
  createExpense,
  approveExpense,
  rejectExpense,
  payExpense,
} from "../actions";
import { ActionForm, ActionButton } from "@/components/action-form";
import { CategoriaSelect } from "@/components/categoria-select";
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
  PENDENTE_APROVACAO: "outline",
  APROVADA: "secondary",
  PAGA: "default",
  REJEITADA: "destructive",
} as const;

export default async function DespesasPage() {
  const user = await requireRole(
    "TESOUREIRO",
    "VENERAVEL_MESTRE",
    "CONSELHO_CONTAS"
  );
  const isWriter = canWriteTesouraria(user.role);
  const [expenses, categorias] = await Promise.all([
    prisma.expense.findMany({
      where: { lodgeId: user.lodgeId },
      orderBy: { createdAt: "desc" },
      include: { approvedByMaster: true, approvedByTreasurer: true },
    }),
    prisma.categoriaFinanceira.findMany({
      where: { lodgeId: user.lodgeId, tipo: "DESPESA" },
      orderBy: { nome: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Despesas</h1>
      <p className="text-sm text-neutral-500">
        Trava de governança: toda despesa exige a aprovação do Venerável Mestre
        <strong> e </strong>do Tesoureiro antes do pagamento.
      </p>

      {isWriter && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Lançar despesa</CardTitle>
            <CardDescription>
              Entra como “pendente de aprovação”.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={createExpense} submitLabel="Lançar">
              <div className="space-y-1">
                <Label htmlFor="description">Descrição</Label>
                <Input id="description" name="description" required />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="supplier">Fornecedor</Label>
                  <Input id="supplier" name="supplier" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="amount">Valor (R$)</Label>
                  <Input id="amount" name="amount" type="number" step="0.01" required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="dueDate">Vencimento</Label>
                  <Input id="dueDate" name="dueDate" type="date" />
                </div>
              </div>
              <CategoriaSelect categorias={categorias.map((c) => c.nome)} />
            </ActionForm>
          </CardContent>
        </Card>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Descrição</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Aprovações</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {expenses.map((e) => (
            <TableRow key={e.id}>
              <TableCell>
                {e.description}
                {e.supplier && (
                  <span className="text-neutral-500"> · {e.supplier}</span>
                )}
                {e.category && (
                  <>
                    {" "}
                    <Badge variant="outline">{e.category}</Badge>
                  </>
                )}
              </TableCell>
              <TableCell>
                {(e.amountCents / 100).toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </TableCell>
              <TableCell>
                <Badge variant={statusVariant[e.status]}>{e.status}</Badge>
              </TableCell>
              <TableCell className="text-xs">
                VM: {e.approvedByMaster ? `✅ ${e.approvedByMaster.name}` : "⏳"}
                <br />
                Tes.: {e.approvedByTreasurer ? `✅ ${e.approvedByTreasurer.name}` : "⏳"}
              </TableCell>
              <TableCell className="space-x-2">
                {e.status === "PENDENTE_APROVACAO" &&
                  ["VENERAVEL_MESTRE", "TESOUREIRO"].includes(user.role) && (
                    <>
                      <ActionButton
                        action={approveExpense.bind(null, e.id)}
                        label="Aprovar"
                      />
                      <ActionButton
                        action={rejectExpense.bind(null, e.id)}
                        variant="destructive"
                        label="Rejeitar"
                      />
                    </>
                  )}
                {e.status === "APROVADA" && isWriter && (
                  <ActionButton
                    action={payExpense.bind(null, e.id)}
                    variant="secondary"
                    label="Pagar"
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
