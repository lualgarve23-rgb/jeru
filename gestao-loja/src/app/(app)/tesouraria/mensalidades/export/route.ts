import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { syncInadimplencia } from "@/lib/inadimplencia";
import { toCsv, csvResponse, brlCsv } from "@/lib/csv";
import { memberStatusLabels, invoiceStatusLabels, paymentMethodLabels } from "@/lib/labels";

// Exporta as capitações em CSV — inclui situação do membro
// (relatório de inadimplência). ?ano= filtra o exercício.
export async function GET(request: Request) {
  const user = await requireRole(
    "TESOUREIRO",
    "VENERAVEL_MESTRE",
    "CONSELHO_CONTAS"
  );
  await syncInadimplencia(user.lodgeId);

  const url = new URL(request.url);
  const year = Number(url.searchParams.get("ano")) || undefined;

  const invoices = await prisma.invoice.findMany({
    where: { lodgeId: user.lodgeId, ...(year ? { referenceYear: year } : {}) },
    orderBy: [
      { referenceYear: "desc" },
      { referenceMonth: "desc" },
      { user: { name: "asc" } },
    ],
    include: { user: { select: { name: true, cim: true, status: true } } },
  });

  const csv = toCsv(
    [
      "Referência",
      "Membro",
      "CIM",
      "Situação do membro",
      "Valor (R$)",
      "Vencimento",
      "Status",
      "Pago em",
      "Método",
    ],
    invoices.map((i) => [
      `${String(i.referenceMonth).padStart(2, "0")}/${i.referenceYear}`,
      i.user.name,
      i.user.cim,
      memberStatusLabels[i.user.status] ?? i.user.status,
      brlCsv(i.amountCents),
      i.dueDate.toLocaleDateString("pt-BR"),
      invoiceStatusLabels[i.status] ?? i.status,
      i.paidAt?.toLocaleDateString("pt-BR") ?? "",
      i.paidMethod ? paymentMethodLabels[i.paidMethod] ?? i.paidMethod : "",
    ])
  );
  return csvResponse(`capitacoes${year ? `-${year}` : ""}.csv`, csv);
}
