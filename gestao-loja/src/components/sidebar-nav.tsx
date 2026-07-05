"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShieldCheck,
  KeyRound,
  Users,
  CalendarCheck,
  ScrollText,
  Send,
  FolderOpen,
  CircleDollarSign,
  Wallet,
  Scale,
  Settings,
  Building2,
  KanbanSquare,
  FileCheck2,
  Bell,
  TrendingUp,
  GraduationCap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const icons: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  privacidade: ShieldCheck,
  senha: KeyRound,
  membros: Users,
  sessoes: CalendarCheck,
  atas: ScrollText,
  pranchas: Send,
  documentos: FolderOpen,
  mensalidades: CircleDollarSign,
  despesas: Wallet,
  balancete: Scale,
  loja: Settings,
  admin: Building2,
  admissoes: KanbanSquare,
  quitteplacets: FileCheck2,
  notificacoes: Bell,
  progressoes: TrendingUp,
  instrucoes: GraduationCap,
};

export type NavItem = {
  href: string;
  label: string;
  icon: keyof typeof icons;
  section?: string;
  badge?: number;
};

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  let lastSection: string | undefined;

  return (
    <nav className="space-y-0.5">
      {items.map((item) => {
        const Icon = icons[item.icon] ?? LayoutDashboard;
        const active =
          item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);
        const showSection = item.section && item.section !== lastSection;
        lastSection = item.section ?? lastSection;
        return (
          <div key={item.href}>
            {showSection && (
              <p className="mt-5 mb-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                {item.section}
              </p>
            )}
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-amber-500/15 font-medium text-amber-400"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.badge != null && item.badge > 0 && (
                <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-slate-950">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
