import Link from "next/link";
import {
  ACAO_LABEL,
  haQuantoTempo,
  type Pendencia,
  type TipoPendencia,
} from "@/lib/pendencias";
import { cn } from "@/lib/utils";
import { InfoDica } from "@/components/info-dica";
import { AJUDA } from "@/lib/ajuda";
import {
  BadgeCheck,
  CalendarCheck,
  CheckCircle2,
  FileSignature,
  HeartHandshake,
  Receipt,
  ScrollText,
  ShieldCheck,
  UserPlus,
  Wallet,
  Lock,
  type LucideIcon,
} from "lucide-react";

/* Faixa-herói "Minha vez": tudo o que está parado esperando o usuário, com
   a ação a tomar. Mesma para todos os perfis; vazia vira uma linha curta. */

const ICONE: Record<TipoPendencia, LucideIcon> = {
  atestado: FileSignature,
  quitte: FileSignature,
  processo: FileSignature,
  afastamento: FileSignature,
  ata: ScrollText,
  despesa: Receipt,
  capitacao: Wallet,
  convite: CalendarCheck,
  lgpd: ShieldCheck,
  esmoler: HeartHandshake,
  candidato: UserPlus,
  fechamento: Lock,
};

export function MinhaVez({
  pendencias,
  userName,
  roleLabel,
  subtitle,
  limite = 8,
}: {
  pendencias: Pendencia[];
  userName: string;
  roleLabel: string;
  subtitle?: string;
  limite?: number;
}) {
  const firstName = userName.split(" ")[0];
  const hoje = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const n = pendencias.length;
  const visiveis = pendencias.slice(0, limite);

  return (
    <section className="bg-hero-gradient shadow-raised animate-rise rounded-3xl p-5 text-white sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-white/80">Olá, {firstName}</p>
          <h1 className="flex items-center gap-1.5 text-2xl font-bold leading-tight">
            {n === 0
              ? "Nada pendente com você"
              : n === 1
                ? "Você tem 1 item na sua vez"
                : `Você tem ${n} itens na sua vez`}
            <InfoDica titulo="Dashboard" texto={AJUDA.dashboard} />
          </h1>
          {subtitle && <p className="mt-0.5 text-xs text-white/70">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
            {roleLabel}
          </span>
          <span className="text-xs capitalize text-white/70">{hoje}</span>
        </div>
      </div>

      {n === 0 ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-white/85">
          <CheckCircle2 className="h-4 w-4" /> Nenhuma assinatura, aprovação ou
          resposta aguardando você.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {visiveis.map((p) => {
            const Icone = ICONE[p.tipo] ?? BadgeCheck;
            return (
              <li key={p.chave}>
                <Link
                  href={p.link}
                  className="flex items-center gap-3 rounded-2xl bg-white/10 p-3 text-sm transition-colors hover:bg-white/20"
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                      p.prioridade === 1 ? "bg-amber-400 text-slate-950" : "bg-white/15 text-white"
                    )}
                  >
                    <Icone className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.titulo}</span>
                    <span className="block truncate text-xs text-white/75">
                      {p.contexto} · {haQuantoTempo(p.desde)}
                    </span>
                  </span>
                  {p.acao && (
                    <span className="shrink-0 rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-slate-900">
                      {ACAO_LABEL[p.acao]}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
          {n > visiveis.length && (
            <li className="pt-1 text-xs text-white/75">
              +{n - visiveis.length} outro(s) item(ns) — veja em{" "}
              <Link href="/dashboard/notificacoes" className="font-medium underline">
                Notificações
              </Link>
              .
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
