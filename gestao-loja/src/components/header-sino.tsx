"use client";

import Link from "next/link";
import { Bell, ListChecks } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type NotificacaoResumo = {
  id: string;
  title: string;
  isRead: boolean;
  createdAt: string; // ISO — serializável do servidor ao cliente
};

export type SinoDados = {
  // itens na vez do usuário (lib/pendencias.ts)
  pendencias: number;
  // 5 últimas notificações visíveis a ele
  notificacoes: NotificacaoResumo[];
};

function quando(iso: string) {
  const d = new Date(iso);
  const dias = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}

/* Sino do cabeçalho desktop: contagem de pendências ("minha vez") no badge e
   as 5 últimas notificações; cada uma abre por /n/<id> (marca lida e
   redireciona ao item). */
export function HeaderSino({ dados }: { dados: SinoDados }) {
  const total = dados.pendencias;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={
          total > 0 ? `Pendências: ${total} item(ns) na sua vez` : "Notificações"
        }
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-card transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Bell className="h-5 w-5" />
        {total > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[11px] font-semibold text-white">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuItem asChild>
          <Link href="/dashboard" className="flex items-center gap-2">
            <ListChecks className="h-4 w-4" />
            <span className="flex-1">Minha vez</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-semibold",
                total > 0 ? "bg-amber-100 text-amber-900" : "bg-muted text-muted-foreground"
              )}
            >
              {total === 0 ? "nada pendente" : `${total} item(ns)`}
            </span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Últimas notificações</DropdownMenuLabel>
        {dados.notificacoes.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma notificação.</p>
        ) : (
          dados.notificacoes.map((n) => (
            <DropdownMenuItem key={n.id} asChild>
              <a href={`/n/${n.id}`} className="flex flex-col items-start gap-0.5">
                <span className={cn("line-clamp-2 text-sm", !n.isRead && "font-semibold")}>
                  {n.title}
                </span>
                <span className="text-xs text-muted-foreground">{quando(n.createdAt)}</span>
              </a>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/notificacoes" className="justify-center text-sm font-medium text-primary">
            Ver todas as notificações
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
