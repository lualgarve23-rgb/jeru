import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { signOut } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { type NavItem } from "@/components/sidebar-nav";
import { roleLabels } from "@/lib/labels";
import { unreadCount } from "@/lib/notifications";
import { grausInstrucaoPermitidos } from "@/lib/permissions";

function navFor(role: string, cargoRito: string | null, unread: number): NavItem[] {
  if (role === "SUPER_ADMIN") {
    return [
      { href: "/admin", label: "Administração", icon: "admin" },
      { href: "/dashboard/senha", label: "Alterar senha", icon: "senha", section: "Minha conta" },
    ];
  }
  const fiscal = ["SECRETARIO", "VENERAVEL_MESTRE", "CONSELHO_CONTAS"];
  const tesouraria = ["TESOUREIRO", "VENERAVEL_MESTRE", "CONSELHO_CONTAS"];
  const gestaoLoja = ["VENERAVEL_MESTRE", "SECRETARIO"];
  // Instruções: VM/Secretário por acesso; Vigilantes pelo cargo do rito
  const ehInstrutor =
    grausInstrucaoPermitidos(role, cargoRito).length > 0;

  const items: (NavItem & { roles?: string[] })[] = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/dashboard/notificacoes", label: "Notificações", icon: "notificacoes", badge: unread },
    { href: "/dashboard/carteirinha", label: "Carteirinha Digital", icon: "carteirinha" },
    { href: "/dashboard/biblioteca", label: "Biblioteca Digital", icon: "biblioteca" },
    { href: "/secretaria/membros", label: "Membros", icon: "membros", section: "Secretaria" },
    { href: "/secretaria/cargos", label: "Cargos do Rito", icon: "cargos", section: "Secretaria", roles: fiscal },
    { href: "/secretaria/sessoes", label: "Sessões e Presenças", icon: "sessoes", section: "Secretaria" },
    { href: "/secretaria/atas", label: "Atas", icon: "atas", section: "Secretaria" },
    { href: "/secretaria/pranchas", label: "Pranchas", icon: "pranchas", section: "Secretaria", roles: fiscal },
    { href: "/secretaria/emails", label: "E-mails da Loja", icon: "emails", section: "Secretaria", roles: gestaoLoja },
    { href: "/secretaria/documentos", label: "Documentos (Drive)", icon: "documentos", section: "Secretaria", roles: fiscal },
    { href: "/secretaria/admissoes", label: "Candidatos", icon: "admissoes", section: "Secretaria" },
    { href: "/secretaria/progressoes", label: "Progressões", icon: "progressoes", section: "Secretaria", roles: fiscal },
    ...(ehInstrutor
      ? [{ href: "/dashboard/instrucoes", label: "Instruções", icon: "instrucoes" as const, section: "Secretaria" }]
      : []),
    { href: "/secretaria/visitas", label: "Visitas a Oficinas", icon: "visitas", section: "Secretaria", roles: fiscal },
    { href: "/secretaria/quitte-placets", label: "Quitte Placets", icon: "quitteplacets", section: "Secretaria", roles: fiscal },
    { href: "/tesouraria/mensalidades", label: "Mensalidades", icon: "mensalidades", section: "Tesouraria", roles: tesouraria },
    { href: "/tesouraria/despesas", label: "Despesas", icon: "despesas", section: "Tesouraria", roles: tesouraria },
    { href: "/tesouraria/balancete", label: "Balancete", icon: "balancete", section: "Tesouraria", roles: tesouraria },
    { href: "/dashboard/loja", label: "Configurações da Loja", icon: "loja", section: "Configurações", roles: gestaoLoja },
    { href: "/dashboard/loja/auditoria", label: "Auditoria", icon: "documentos", section: "Configurações", roles: gestaoLoja },
    { href: "/dashboard/perfil", label: "Meu perfil", icon: "perfil", section: "Minha conta" },
    { href: "/dashboard/privacidade", label: "Privacidade (LGPD)", icon: "privacidade", section: "Minha conta" },
    { href: "/dashboard/senha", label: "Alterar senha", icon: "senha", section: "Minha conta" },
    { href: "/tour", label: "Tour da plataforma", icon: "tour", section: "Ajuda" },
  ];
  return items.filter((i) => !i.roles || i.roles.includes(role));
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  // Primeiro acesso: bloqueia todo o painel até trocar a senha provisória
  const { mustChangePassword, cargoRito } = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { mustChangePassword: true, cargoRito: true },
  });
  if (mustChangePassword) redirect("/trocar-senha");

  const [lodge, unread] = await Promise.all([
    prisma.lodge.findUnique({
      where: { id: user.lodgeId },
      select: {
        logoUrl: true,
        name: true,
        number: true,
        oriente: true,
        licencaStatus: true,
      },
    }),
    user.role === "SUPER_ADMIN" ? Promise.resolve(0) : unreadCount(user),
  ]);

  // Licença do sistema vencida bloqueia toda a loja (menos o super admin)
  if (lodge?.licencaStatus === "VENCIDA" && user.role !== "SUPER_ADMIN") {
    redirect("/licenca-vencida");
  }

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <AppShell
      lodge={lodge}
      lodgeNameFallback={user.lodgeName}
      userName={user.name}
      roleLabel={cargoRito ?? roleLabels[user.role] ?? user.role}
      cim={user.cim}
      navItems={navFor(user.role, cargoRito, unread)}
      unreadNotifications={unread}
      signOutAction={handleSignOut}
    >
      {children}
    </AppShell>
  );
}
