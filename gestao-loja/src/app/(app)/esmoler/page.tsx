import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { frequenciaAnual, MIN_SESSOES_PARA_ALERTA } from "@/lib/frequencia";
import { degreeLabels, memberStatusLabels } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InfoDica } from "@/components/info-dica";
import { RegistrarContato } from "./registrar-contato";
import {
  Cake,
  CalendarOff,
  CalendarX2,
  HandHeart,
  MessageCircle,
  Phone,
  Wallet,
} from "lucide-react";

/*
 * Esmoler (Hospitaleiro) — irmãos a acompanhar: inadimplentes e quase
 * (capitações vencidas ≥ limite − 1), frequência abaixo do mínimo, licenciados
 * com fim previsto e aniversariantes da semana. Telefone/WhatsApp e registro
 * de contato fraterno (nota). Também visível ao Venerável Mestre.
 */

type Irmao = {
  id: string;
  name: string;
  phone: string | null;
  degree: string;
  status: string;
};

type Motivo = { icone: React.ReactNode; texto: string; tom: "danger" | "warning" | "info" };

function digitos(phone: string) {
  const d = phone.replace(/\D/g, "");
  return d.startsWith("55") && d.length >= 12 ? d : `55${d}`;
}

function brl(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Dia/mês do aniversário nos próximos 7 dias (inclui hoje)
function aniversarioNaSemana(birth: Date, hoje: Date): Date | null {
  for (let i = 0; i < 7; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + i);
    if (d.getDate() === birth.getDate() && d.getMonth() === birth.getMonth()) return d;
  }
  return null;
}

export default async function EsmolerPage() {
  const user = await requireRole("ESMOLER", "VENERAVEL_MESTRE");
  const lodgeId = user.lodgeId;
  const hoje = new Date();

  const [lodge, vencidas, frequencia, licenciados, aniversariantes, contatos] =
    await Promise.all([
      prisma.lodge.findUniqueOrThrow({
        where: { id: lodgeId },
        select: { limiteInadimplencia: true, minFreqProgressao: true },
      }),
      prisma.invoice.groupBy({
        by: ["userId"],
        where: { lodgeId, status: "VENCIDA" },
        _count: { _all: true },
        _sum: { amountCents: true },
      }),
      frequenciaAnual(lodgeId),
      prisma.user.findMany({
        where: { lodgeId, status: "LICENCIADO" },
        select: { id: true, name: true, phone: true, degree: true, status: true, licencaFim: true },
        orderBy: { licencaFim: "asc" },
      }),
      prisma.user.findMany({
        where: {
          lodgeId,
          status: { in: ["ATIVO", "IRREGULAR", "LICENCIADO"] },
          birthDate: { not: null },
        },
        select: { id: true, name: true, phone: true, degree: true, status: true, birthDate: true },
      }),
      prisma.contatoEsmoler.findMany({
        where: { lodgeId },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          userId: true,
          nota: true,
          createdAt: true,
          autor: { select: { name: true } },
          user: { select: { name: true } },
        },
      }),
    ]);

  // Último contato por irmão (a lista já vem do mais recente ao mais antigo)
  const ultimoContato = new Map<string, (typeof contatos)[number]>();
  for (const c of contatos) if (!ultimoContato.has(c.userId)) ultimoContato.set(c.userId, c);

  // Irmãos a acompanhar: agrega os motivos por pessoa
  const motivos = new Map<string, { irmao: Irmao; motivos: Motivo[] }>();
  const add = (irmao: Irmao, m: Motivo) => {
    const atual = motivos.get(irmao.id) ?? { irmao, motivos: [] };
    atual.motivos.push(m);
    motivos.set(irmao.id, atual);
  };

  // Inadimplentes e quase (vencidas ≥ limite − 1)
  const quaseLimite = Math.max(1, lodge.limiteInadimplencia - 1);
  const idsFin = vencidas.filter((v) => v._count._all >= quaseLimite).map((v) => v.userId);
  const irmaosFin = idsFin.length
    ? await prisma.user.findMany({
        where: { id: { in: idsFin }, lodgeId, status: { in: ["ATIVO", "IRREGULAR"] } },
        select: { id: true, name: true, phone: true, degree: true, status: true },
      })
    : [];
  for (const i of irmaosFin) {
    const v = vencidas.find((x) => x.userId === i.id)!;
    const n = v._count._all;
    add(i, {
      icone: <Wallet className="h-3.5 w-3.5" />,
      texto: `${n} capitação(ões) vencida(s) · ${brl(v._sum.amountCents ?? 0)}${
        n >= lodge.limiteInadimplencia ? " — irregular" : " — quase no limite"
      }`,
      tom: n >= lodge.limiteInadimplencia ? "danger" : "warning",
    });
  }

  // Frequência abaixo do mínimo (com sessões suficientes para o alerta)
  const idsFreq = frequencia
    .filter(
      (f) =>
        f.percentual != null &&
        f.sessoesComputadas >= MIN_SESSOES_PARA_ALERTA &&
        f.percentual < lodge.minFreqProgressao
    )
    .map((f) => f.userId);
  const irmaosFreq = idsFreq.length
    ? await prisma.user.findMany({
        where: { id: { in: idsFreq }, lodgeId },
        select: { id: true, name: true, phone: true, degree: true, status: true },
      })
    : [];
  for (const i of irmaosFreq) {
    const f = frequencia.find((x) => x.userId === i.id)!;
    add(i, {
      icone: <CalendarX2 className="h-3.5 w-3.5" />,
      texto: `Frequência ${f.percentual}% (${f.presencas}/${f.sessoesComputadas}) — mínimo ${lodge.minFreqProgressao}%`,
      tom: "warning",
    });
  }

  // Licenciados com fim previsto
  for (const l of licenciados) {
    add(l, {
      icone: <CalendarOff className="h-3.5 w-3.5" />,
      texto: l.licencaFim
        ? `Licenciado até ${l.licencaFim.toLocaleDateString("pt-BR")}${
            l.licencaFim < hoje ? " — prazo encerrado" : ""
          }`
        : "Licenciado (sem data de retorno)",
      tom: l.licencaFim && l.licencaFim < hoje ? "danger" : "info",
    });
  }

  // Aniversariantes da semana
  for (const a of aniversariantes) {
    const dia = a.birthDate ? aniversarioNaSemana(a.birthDate, hoje) : null;
    if (!dia) continue;
    const ehHoje = dia.toDateString() === hoje.toDateString();
    add(a, {
      icone: <Cake className="h-3.5 w-3.5" />,
      texto: ehHoje
        ? "Aniversário hoje!"
        : `Aniversário em ${dia.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}`,
      tom: "info",
    });
  }

  const ordem = { danger: 0, warning: 1, info: 2 };
  const lista = [...motivos.values()].sort(
    (a, b) =>
      Math.min(...a.motivos.map((m) => ordem[m.tom])) -
        Math.min(...b.motivos.map((m) => ordem[m.tom])) ||
      a.irmao.name.localeCompare(b.irmao.name)
  );

  const tomClasse = {
    danger: "bg-destructive/10 text-destructive",
    warning: "bg-amber-100 text-amber-900",
    info: "bg-gold-soft text-gold-text",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <HandHeart className="h-6 w-6 text-gold-text" /> Acompanhamento fraterno
          <InfoDica
            titulo="Esmoler"
            texto="Irmãos que merecem um contato: capitações em atraso (ou perto do limite), frequência abaixo do mínimo, licenciados com data de retorno e aniversariantes da semana. Ligue, mande um WhatsApp e registre o contato para a Loja saber que o irmão foi ouvido."
          />
        </h1>
        <p className="text-sm text-muted-foreground">
          {lista.length === 0
            ? "Ninguém precisa de atenção especial nesta semana."
            : `${lista.length} irmão(s) a acompanhar.`}
        </p>
      </div>

      {lista.length > 0 && (
        <ul className="grid gap-4 lg:grid-cols-2">
          {lista.map(({ irmao, motivos: ms }) => {
            const contato = ultimoContato.get(irmao.id);
            return (
              <li key={irmao.id}>
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      <Link href={`/secretaria/membros/${irmao.id}`} className="hover:underline">
                        {irmao.name}
                      </Link>
                      <Badge variant="outline">{degreeLabels[irmao.degree] ?? irmao.degree}</Badge>
                      {irmao.status !== "ATIVO" && (
                        <Badge variant={irmao.status === "IRREGULAR" ? "destructive" : "secondary"}>
                          {memberStatusLabels[irmao.status] ?? irmao.status}
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="flex flex-wrap gap-3">
                      {irmao.phone ? (
                        <>
                          <a
                            href={`tel:${irmao.phone.replace(/\D/g, "")}`}
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <Phone className="h-3.5 w-3.5" /> {irmao.phone}
                          </a>
                          <a
                            href={`https://wa.me/${digitos(irmao.phone)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-success hover:underline"
                          >
                            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                          </a>
                        </>
                      ) : (
                        <span>Sem telefone cadastrado</span>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ul className="space-y-1.5">
                      {ms.map((m, i) => (
                        <li
                          key={i}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${tomClasse[m.tom]}`}
                        >
                          {m.icone} {m.texto}
                        </li>
                      ))}
                    </ul>
                    {contato ? (
                      <p className="text-xs text-muted-foreground">
                        Último contato em {contato.createdAt.toLocaleDateString("pt-BR")} por{" "}
                        {contato.autor.name.split(" ")[0]}: “{contato.nota}”
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Nenhum contato registrado.</p>
                    )}
                    <RegistrarContato userId={irmao.id} nome={irmao.name} />
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {contatos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Contatos recentes</CardTitle>
            <CardDescription>Registros fraternos dos últimos contatos.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {contatos.slice(0, 15).map((c, i) => (
                <li key={i} className="rounded-xl border border-border bg-background p-3">
                  <span className="font-medium">{c.user.name}</span>{" "}
                  <span className="text-xs text-muted-foreground">
                    · {c.createdAt.toLocaleDateString("pt-BR")} · {c.autor.name.split(" ")[0]}
                  </span>
                  <p className="mt-1 text-muted-foreground">{c.nota}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
