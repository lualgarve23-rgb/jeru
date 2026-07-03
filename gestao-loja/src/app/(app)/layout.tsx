import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { SidebarNav, type NavItem } from "@/components/sidebar-nav";
import { LogOut, Landmark } from "lucide-react";

const roleLabels: Record<string, string> = {
  MEMBER: "Obreiro",
  VENERAVEL_MESTRE: "Venerável Mestre",
  SECRETARIO: "Secretário",
  TESOUREIRO: "Tesoureiro",
  CONSELHO_CONTAS: "Conselho de Contas",
  SUPER_ADMIN: "Admin Master",
};

function navFor(role: string): NavItem[] {
  if (role === "SUPER_ADMIN") {
    return [
      { href: "/admin", label: "Administração", icon: "admin" },
      { href: "/dashboard/senha", label: "Alterar senha", icon: "senha", section: "Minha conta" },
    ];
  }
  const fiscal = ["SECRETARIO", "VENERAVEL_MESTRE", "CONSELHO_CONTAS"];
  const tesouraria = ["TESOUREIRO", "VENERAVEL_MESTRE", "CONSELHO_CONTAS"];
  const gestaoLoja = ["VENERAVEL_MESTRE", "SECRETARIO"];

  const items: (NavItem & { roles?: string[] })[] = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/secretaria/membros", label: "Membros", icon: "membros", section: "Secretaria" },
    { href: "/secretaria/sessoes", label: "Sessões e Presenças", icon: "sessoes", section: "Secretaria" },
    { href: "/secretaria/atas", label: "Atas", icon: "atas", section: "Secretaria" },
    { href: "/secretaria/pranchas", label: "Pranchas", icon: "pranchas", section: "Secretaria", roles: fiscal },
    { href: "/secretaria/documentos", label: "Documentos (Drive)", icon: "documentos", section: "Secretaria", roles: fiscal },
    { href: "/tesouraria/mensalidades", label: "Mensalidades", icon: "mensalidades", section: "Tesouraria", roles: tesouraria },
    { href: "/tesouraria/despesas", label: "Despesas", icon: "despesas", section: "Tesouraria", roles: tesouraria },
    { href: "/tesouraria/balancete", label: "Balancete", icon: "balancete", section: "Tesouraria", roles: tesouraria },
    { href: "/dashboard/loja", label: "Configurações da Loja", icon: "loja", section: "Configurações", roles: gestaoLoja },
    { href: "/dashboard/privacidade", label: "Privacidade (LGPD)", icon: "privacidade", section: "Minha conta" },
    { href: "/dashboard/senha", label: "Alterar senha", icon: "senha", section: "Minha conta" },
  ];
  return items.filter((i) => !i.roles || i.roles.includes(role));
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const lodge = await prisma.lodge.findUnique({
    where: { id: user.lodgeId },
    select: { logoUrl: true, name: true, number: true, oriente: true },
  });

  return (
    <div className="flex min-h-screen bg-slate-100 dark:bg-slate-950">
      <aside className="fixed inset-y-0 flex w-64 flex-col bg-slate-900 text-slate-100">
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-5">
          {lodge?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={lodge.logoUrl}
              alt=""
              className="h-11 w-11 shrink-0 rounded-full border border-amber-400/40 bg-white object-cover"
            />
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-amber-400/40 bg-gradient-to-br from-amber-400/20 to-amber-600/10">
              <Landmark className="h-5 w-5 text-amber-400" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">
              {lodge?.name ?? user.lodgeName}
            </p>
            <p className="truncate text-xs text-slate-400">
              {lodge?.number && lodge.number !== "0000"
                ? `Loja nº ${lodge.number}`
                : "Painel do sistema"}
              {lodge?.oriente ? ` · Or∴ ${lodge.oriente}` : ""}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <SidebarNav items={navFor(user.role)} />
        </div>

        <div className="border-t border-white/10 p-4">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="mb-3 text-xs text-amber-400/90">
            {roleLabels[user.role] ?? user.role} · CIM {user.cim}
          </p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button
              variant="outline"
              size="sm"
              type="submit"
              className="w-full border-white/20 bg-transparent text-slate-200 hover:bg-white/10 hover:text-white"
            >
              <LogOut className="mr-2 h-4 w-4" /> Sair
            </Button>
          </form>
        </div>
      </aside>

      <main className="ml-64 flex-1 p-8">{children}</main>
    </div>
  );
}
