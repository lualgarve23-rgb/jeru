import Link from "next/link";
import { requireUser } from "@/lib/session";
import { signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const nav = [
  { href: "/dashboard", label: "Dashboard", roles: null },
  { href: "/secretaria/membros", label: "Membros", roles: null },
  { href: "/secretaria/sessoes", label: "Sessões e Presenças", roles: null },
  { href: "/secretaria/atas", label: "Atas", roles: null },
  { href: "/secretaria/pranchas", label: "Pranchas", roles: ["SECRETARIO", "VENERAVEL_MESTRE", "CONSELHO_CONTAS"] },
  { href: "/secretaria/documentos", label: "Documentos (Drive)", roles: ["SECRETARIO", "VENERAVEL_MESTRE", "CONSELHO_CONTAS"] },
  { href: "/tesouraria/mensalidades", label: "Mensalidades", roles: ["TESOUREIRO", "VENERAVEL_MESTRE", "CONSELHO_CONTAS"] },
  { href: "/tesouraria/despesas", label: "Despesas", roles: ["TESOUREIRO", "VENERAVEL_MESTRE", "CONSELHO_CONTAS"] },
  { href: "/tesouraria/balancete", label: "Balancete", roles: ["TESOUREIRO", "VENERAVEL_MESTRE", "CONSELHO_CONTAS"] },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r bg-neutral-50 p-4 dark:bg-neutral-900">
        <p className="font-bold">{user.lodgeName}</p>
        <p className="text-sm text-neutral-500">
          {user.name} · CIM {user.cim}
        </p>
        <Separator className="my-4" />
        <nav className="space-y-1">
          {nav
            .filter((i) => !i.roles || i.roles.includes(user.role))
            .map((i) => (
              <Link
                key={i.href}
                href={i.href}
                className="block rounded px-2 py-1.5 text-sm hover:bg-neutral-200 dark:hover:bg-neutral-800"
              >
                {i.label}
              </Link>
            ))}
        </nav>
        <Separator className="my-4" />
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <Button variant="outline" size="sm" type="submit">
            Sair
          </Button>
        </form>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
