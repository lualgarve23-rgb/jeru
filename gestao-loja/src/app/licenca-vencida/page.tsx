import { redirect } from "next/navigation";
import Link from "next/link";
import { ShieldAlert, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { signOut } from "@/auth";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Licença vencida" };

// Página de bloqueio quando a licença do sistema da loja está vencida.
// O layout do painel redireciona para cá; quem gere a loja vê o link de
// pagamento (fatura Asaas da plataforma), os demais são orientados a
// procurar o Venerável ou o Tesoureiro.
export default async function LicencaVencidaPage() {
  const user = await requireUser();
  if (user.role === "SUPER_ADMIN") redirect("/admin");

  const lodge = await prisma.lodge.findUniqueOrThrow({
    where: { id: user.lodgeId },
    select: {
      name: true,
      number: true,
      licencaStatus: true,
      licencaInvoiceUrl: true,
      licencaVencimento: true,
    },
  });
  if (lodge.licencaStatus !== "VENCIDA") redirect("/dashboard");

  const podeResolver = ["VENERAVEL_MESTRE", "TESOUREIRO", "SECRETARIO"].includes(
    user.role
  );
  const vencimento = lodge.licencaVencimento
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(
        lodge.licencaVencimento
      )
    : null;

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#1c3a5e] p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#c9973b]">
            <ShieldAlert className="h-8 w-8 text-[#c9973b]" />
          </span>
          <h1 className="text-2xl font-bold text-white">
            Licença do sistema vencida
          </h1>
          <p className="mt-1 text-sm text-slate-300">
            Loja {lodge.name} nº {lodge.number}
          </p>
        </div>

        <div className="space-y-4 rounded-2xl border bg-white p-6 shadow-2xl">
          <p className="text-sm text-slate-700">
            O acesso ao painel foi suspenso porque a licença de uso do sistema
            está vencida{vencimento ? ` desde ${vencimento}` : ""}. Os dados da
            loja permanecem guardados e voltam a ficar disponíveis assim que o
            pagamento for confirmado.
          </p>

          {podeResolver ? (
            lodge.licencaInvoiceUrl ? (
              <Button asChild className="w-full">
                <a
                  href={lodge.licencaInvoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Pagar a licença agora
                  <ExternalLink className="ml-1.5 h-4 w-4" />
                </a>
              </Button>
            ) : (
              <p className="text-sm text-slate-700">
                A fatura ainda não está disponível — entre em contato com o
                suporte do NoPrumo para regularizar.
              </p>
            )
          ) : (
            <p className="text-sm text-slate-700">
              Procure o Venerável Mestre ou o Tesoureiro da loja para
              regularizar a situação.
            </p>
          )}

          <div className="flex items-center justify-between border-t pt-4 text-sm">
            <Link
              href="/dashboard"
              className="font-medium underline underline-offset-2"
            >
              Tentar novamente
            </Link>
            <form action={handleSignOut}>
              <Button variant="ghost" size="sm" type="submit">
                Sair
              </Button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
