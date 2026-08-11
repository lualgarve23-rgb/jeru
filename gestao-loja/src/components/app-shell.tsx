"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Menu,
  X,
  LogOut,
  Landmark,
  Bell,
  House,
  CreditCard,
  CircleUserRound,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SidebarNav, type NavItem } from "@/components/sidebar-nav";

type LodgeInfo = {
  logoUrl: string | null;
  name: string | null;
  number: string | null;
  oriente: string | null;
};

export function AppShell({
  lodge,
  lodgeNameFallback,
  userName,
  roleLabel,
  cim,
  navItems,
  unreadNotifications = 0,
  signOutAction,
  children,
}: {
  lodge: LodgeInfo | null;
  lodgeNameFallback: string;
  userName: string;
  roleLabel: string;
  cim: string;
  navItems: NavItem[];
  unreadNotifications?: number;
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [lastPathname, setLastPathname] = useState(pathname);

  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  const lodgeName = lodge?.name ?? lodgeNameFallback;
  const lodgeSubtitle =
    (lodge?.number && lodge.number !== "0000"
      ? `Loja nº ${lodge.number}`
      : "Painel do sistema") + (lodge?.oriente ? ` · Or∴ ${lodge.oriente}` : "");

  return (
    <div className="flex min-h-screen bg-background">
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-card px-4 text-foreground print:hidden lg:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <LodgeMark lodge={lodge} size="sm" />
          <p className="truncate text-sm font-semibold">{lodgeName}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Link
            href="/dashboard/notificacoes"
            aria-label={
              unreadNotifications > 0
                ? `Notificações: ${unreadNotifications} não lida(s)`
                : "Notificações"
            }
            className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Bell className="h-5 w-5" />
            {unreadNotifications > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
                {unreadNotifications > 99 ? "99+" : unreadNotifications}
              </span>
            )}
          </Link>
        </div>
      </header>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={
          "fixed inset-y-0 left-0 z-50 flex w-64 -translate-x-full flex-col border-r border-border bg-[#d3deee] text-foreground transition-transform duration-200 ease-out print:hidden lg:translate-x-0 " +
          (open ? "translate-x-0" : "")
        }
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-5">
          <LodgeMark lodge={lodge} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold leading-tight">{lodgeName}</p>
            <p className="truncate text-xs text-muted-foreground">{lodgeSubtitle}</p>
          </div>
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setOpen(false)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-white/70 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <SidebarNav items={navItems} />
        </div>

        <div className="border-t border-border p-4">
          <p className="truncate text-sm font-semibold">{userName}</p>
          <p className="mb-3 text-xs text-muted-foreground">
            {roleLabel} · CIM {cim}
          </p>
          <form action={signOutAction}>
            <Button variant="outline" size="sm" type="submit" className="w-full">
              <LogOut className="mr-2 h-4 w-4" /> Sair
            </Button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 pb-28 pt-20 print:ml-0 print:p-0 lg:ml-64 lg:p-8 lg:pt-8">{children}</main>

      <BottomNav
        navItems={navItems}
        unreadNotifications={unreadNotifications}
        menuOpen={open}
        onToggleMenu={() => setOpen((v) => !v)}
      />
    </div>
  );
}

/* Barra inferior mobile (estilo app): até 4 destinos do próprio menu do
   usuário + "Menu" que abre o drawer completo. Só aparece < lg. */
const bottomTabs: { icon: NavItem["icon"]; Component: LucideIcon; short: string }[] = [
  { icon: "dashboard", Component: House, short: "Início" },
  { icon: "carteirinha", Component: CreditCard, short: "Carteirinha" },
  { icon: "notificacoes", Component: Bell, short: "Avisos" },
  { icon: "perfil", Component: CircleUserRound, short: "Perfil" },
];

function BottomNav({
  navItems,
  unreadNotifications,
  menuOpen,
  onToggleMenu,
}: {
  navItems: NavItem[];
  unreadNotifications: number;
  menuOpen: boolean;
  onToggleMenu: () => void;
}) {
  const pathname = usePathname();
  const tabs = bottomTabs
    .map((tab) => {
      const item = navItems.find((n) => n.icon === tab.icon);
      return item ? { ...tab, item } : null;
    })
    .filter((t) => t != null);

  if (tabs.length === 0) return null;

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)] print:hidden lg:hidden"
    >
      {tabs.map(({ Component, short, item }) => {
        const active =
          item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);
        const showBadge = item.icon === "notificacoes" && unreadNotifications > 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center gap-0.5 pb-2 pt-2.5 text-[11px] leading-tight",
              active ? "font-bold text-primary" : "text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "relative flex h-8 w-14 items-center justify-center rounded-full transition-colors",
                active && "bg-gold-soft"
              )}
            >
              <Component className="h-5 w-5" />
              {showBadge && (
                <span className="absolute right-2 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
                  {unreadNotifications > 99 ? "99+" : unreadNotifications}
                </span>
              )}
            </span>
            <span className="max-w-full truncate">{short}</span>
          </Link>
        );
      })}
      <button
        type="button"
        aria-label={menuOpen ? "Fechar menu completo" : "Abrir menu completo"}
        aria-expanded={menuOpen}
        onClick={onToggleMenu}
        className={cn(
          "flex min-w-0 flex-1 flex-col items-center gap-0.5 pb-2 pt-2.5 text-[11px] leading-tight",
          menuOpen ? "font-bold text-primary" : "text-muted-foreground"
        )}
      >
        <span
          className={cn(
            "flex h-8 w-14 items-center justify-center rounded-full transition-colors",
            menuOpen && "bg-gold-soft"
          )}
        >
          <Menu className="h-5 w-5" />
        </span>
        <span>Menu</span>
      </button>
    </nav>
  );
}

function LodgeMark({ lodge, size }: { lodge: LodgeInfo | null; size: "sm" | "lg" }) {
  const dimension = size === "lg" ? "h-11 w-11" : "h-8 w-8";
  const iconSize = size === "lg" ? "h-5 w-5" : "h-4 w-4";
  if (lodge?.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={lodge.logoUrl}
        alt={lodge.name ?? "Logo da loja"}
        className={`${dimension} shrink-0 rounded-full border border-border bg-white object-cover`}
      />
    );
  }
  return (
    <span
      className={`flex ${dimension} shrink-0 items-center justify-center rounded-full bg-primary`}
    >
      <Landmark className={`${iconSize} text-white`} />
    </span>
  );
}
