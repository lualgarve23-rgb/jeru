"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Menu, X, LogOut, Landmark, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-card px-4 text-foreground lg:hidden">
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
        <button
          type="button"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-foreground hover:bg-secondary"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
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
          "fixed inset-y-0 left-0 z-50 flex w-64 -translate-x-full flex-col border-r border-border bg-card text-foreground transition-transform duration-200 ease-out lg:translate-x-0 " +
          (open ? "translate-x-0" : "")
        }
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-5">
          <LodgeMark lodge={lodge} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight">{lodgeName}</p>
            <p className="truncate text-xs text-muted-foreground">{lodgeSubtitle}</p>
          </div>
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

      <main className="min-w-0 flex-1 p-4 pt-20 lg:ml-64 lg:p-8 lg:pt-8">{children}</main>
    </div>
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
