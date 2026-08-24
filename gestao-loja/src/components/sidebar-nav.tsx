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
  FileBadge,
  Bell,
  TrendingUp,
  GraduationCap,
  CircleUserRound,
  BadgeCheck,
  Mail,
  BookOpen,
  CreditCard,
  DoorOpen,
  PlayCircle,
  HeartHandshake,
  HandCoins,
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
  atestado: FileBadge,
  quitteplacets: FileCheck2,
  notificacoes: Bell,
  progressoes: TrendingUp,
  instrucoes: GraduationCap,
  perfil: CircleUserRound,
  cargos: BadgeCheck,
  emails: Mail,
  biblioteca: BookOpen,
  carteirinha: CreditCard,
  visitas: DoorOpen,
  tour: PlayCircle,
  mutua: HeartHandshake,
  benemerencia: HandCoins,
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
  // seção anterior de cada item, para mostrar o cabeçalho só na primeira ocorrência
  const secaoAnterior = items.map((_, i) => {
    for (let j = i - 1; j >= 0; j--) {
      if (items[j].section) return items[j].section;
    }
    return undefined;
  });

  return (
    <nav className="space-y-0.5">
      {items.map((item, i) => {
        const Icon = icons[item.icon] ?? LayoutDashboard;
        const active =
          item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);
        const showSection = item.section && item.section !== secaoAnterior[i];
        return (
          <div key={item.href}>
            {showSection && (
              <p className="mt-5 mb-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {item.section}
              </p>
            )}
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary font-bold text-primary-foreground"
                  : "text-foreground hover:bg-white/70"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.badge != null && item.badge > 0 && (
                <span
                  className={cn(
                    "ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-semibold",
                    active
                      ? "bg-white text-primary"
                      : "bg-primary text-primary-foreground"
                  )}
                >
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
