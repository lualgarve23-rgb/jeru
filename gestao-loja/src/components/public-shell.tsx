import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Conchas visuais das telas públicas do redesign (Fase 3).
// AuthShell: tela cheia sobre o gradiente-herói (login, senhas, bloqueio).
// PublicHero: faixa-herói no topo das páginas de token (convite, check-in,
// verificação, candidato), no mesmo padrão da carteirinha.

export function AuthShell({
  icon: Icon,
  title,
  subtitle,
  footer,
  wide,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <main className="bg-hero-gradient flex min-h-screen items-center justify-center p-4">
      <div className={cn("w-full", wide ? "max-w-md" : "max-w-sm")}>
        <div className="mb-8 text-center">
          <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/10 ring-2 ring-gold">
            <Icon className="h-8 w-8 text-gold-bright" aria-hidden />
          </span>
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          {subtitle ? (
            <p className="mt-1 text-sm text-white/75">{subtitle}</p>
          ) : null}
        </div>
        <div className="animate-rise rounded-3xl bg-card p-6 text-card-foreground shadow-raised">
          {children}
        </div>
        {footer ? (
          <p className="mt-6 text-center text-xs text-white/60">{footer}</p>
        ) : null}
      </div>
    </main>
  );
}

export function PublicHero({
  logoUrl,
  logoAlt,
  title,
  subtitle,
  eyebrow,
}: {
  logoUrl?: string | null;
  logoAlt?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="bg-hero-gradient flex items-center gap-3 rounded-2xl px-5 py-4 text-white shadow-raised">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={logoAlt ?? ""}
          className="h-11 w-11 shrink-0 rounded-full bg-white object-contain"
        />
      ) : null}
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[11px] uppercase tracking-widest text-white/70">
            {eyebrow}
          </p>
        ) : null}
        <p className="truncate text-sm font-bold leading-tight">{title}</p>
        {subtitle ? (
          <p className="truncate text-xs opacity-80">{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}
