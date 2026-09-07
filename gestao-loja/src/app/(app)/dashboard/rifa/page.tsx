import Link from "next/link";
import QRCode from "qrcode";
import { Ticket, Trophy } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { buildPixPayload } from "@/lib/pix";
import { AJUDA } from "@/lib/ajuda";
import { InfoDica } from "@/components/info-dica";
import { CopyButton } from "@/components/copy-button";
import { mediaSrc } from "@/lib/media-url";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  brl,
  dataBr,
  faseRifa,
  FASE_LABEL,
  isoSp,
  podeGerirRifa,
  podeReservar,
  podeSortear,
  resumoRifa,
  rifaAtiva,
  rifaSelect,
  rifaVisivelAoQuadro,
  SORTEIO_MODO_LABEL,
  type SorteioModo,
} from "@/lib/rifa";
import { GradeNumeros, LiberarNumeroButton } from "./grade-numeros";
import { CampanhaForm, type CampanhaFormDados } from "./campanha-form";
import { PagoToggle, SorteioAutomaticoForm, SorteioForm, VendaPresencialForm } from "./gestor";

/*
 * Rifa de Benemerência — página única para todos:
 *  - irmão: vê a campanha vigente, escolhe números, paga por Pix, acompanha
 *    o resultado;
 *  - VM/Esmoler: além disso habilita/edita/encerra a campanha, registra
 *    vendas presenciais e baixas, e registra o número sorteado.
 */
function dataHoraBr(d: Date) {
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function RifaPage() {
  const user = await requireUser();
  const gestor = podeGerirRifa(user.role);
  const agora = new Date();

  const [rifa, lodge, historico] = await Promise.all([
    rifaAtiva(user.lodgeId),
    prisma.lodge.findUniqueOrThrow({
      where: { id: user.lodgeId },
      select: { name: true, oriente: true, pixKey: true, pixKeyBenemerencia: true },
    }),
    prisma.rifaCampanha.findMany({
      where: { lodgeId: user.lodgeId, ativa: false },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { ...rifaSelect, _count: { select: { numeros: true } } },
    }),
  ]);

  const visivel = !!rifa && (gestor || rifaVisivelAoQuadro(rifa, agora));
  const fase = rifa ? faseRifa(rifa, agora) : null;

  const numeros = rifa
    ? await prisma.rifaNumero.findMany({
        where: { rifaId: rifa.id },
        orderBy: { numero: "asc" },
        select: { id: true, numero: true, userId: true, pago: true, pagoAt: true, user: { select: { name: true } } },
      })
    : [];
  const meus = numeros.filter((n) => n.userId === user.id);
  const meusPendentes = meus.filter((n) => !n.pago);

  // Pix com o valor dos meus números ainda não pagos (chave da Benemerência)
  const chave = lodge.pixKeyBenemerencia ?? lodge.pixKey;
  let qr: string | null = null;
  let payload: string | null = null;
  if (rifa && chave && meusPendentes.length > 0) {
    payload = buildPixPayload({
      pixKey: chave,
      merchantName: lodge.name,
      merchantCity: lodge.oriente?.split("/")[0] ?? "SAO PAULO",
      txid: "***",
      amountCents: meusPendentes.length * rifa.valorCents,
    });
    qr = await QRCode.toDataURL(payload, { width: 240, margin: 1 });
  }

  const irmaos = gestor
    ? await prisma.user.findMany({
        where: { lodgeId: user.lodgeId, status: { in: ["ATIVO", "IRREGULAR", "LICENCIADO"] }, currentRole: { not: "SUPER_ADMIN" } },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  const formDados: CampanhaFormDados | null = rifa
    ? {
        titulo: rifa.titulo,
        descricao: rifa.descricao,
        inicio: isoSp(rifa.inicio),
        fim: isoSp(rifa.fim),
        sorteio: isoSp(rifa.sorteioEm),
        quantidadeNumeros: rifa.quantidadeNumeros,
        valorReais: (rifa.valorCents / 100).toFixed(2),
        sorteada: rifa.numeroSorteado != null,
        fotos: rifa.fotos,
      }
    : null;

  const resumo = rifa ? resumoRifa(rifa, numeros) : null;
  const faseVariant: Record<string, "success" | "warning" | "gold" | "secondary" | "outline"> = {
    vendas: "success",
    agendada: "outline",
    "aguardando-sorteio": "warning",
    sorteada: "gold",
    encerrada: "secondary",
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-1 text-2xl font-bold">
          Rifa de Benemerência
          <InfoDica titulo="Rifa de Benemerência" texto={AJUDA.rifa} />
        </h1>
        <p className="text-sm text-muted-foreground">
          Campanha solidária da Loja: escolha seus números e contribua com a Bolsa de Benemerência.
        </p>
      </div>

      {!rifa || !visivel ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            <Ticket className="mx-auto mb-2 h-8 w-8 text-primary" />
            {gestor
              ? "Nenhuma campanha ativa. Habilite uma abaixo — enquanto vigente, ela aparece no menu de todos os irmãos."
              : "Não há campanha de rifa em andamento no momento."}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Resultado do sorteio */}
          {rifa.numeroSorteado != null && (
            <Card className="border-gold bg-gold-soft/60">
              <CardHeader className="text-center">
                <span className="mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-white">
                  <Trophy className="h-6 w-6 text-gold-text" />
                </span>
                <CardTitle>Número sorteado: {rifa.numeroSorteado}</CardTitle>
                <CardDescription className="text-base text-foreground">
                  {rifa.ganhador
                    ? rifa.ganhador.id === user.id
                      ? "Parabéns, o número sorteado é o seu!"
                      : `Ganhador: ${rifa.ganhador.name}`
                    : "O número sorteado não havia sido vendido."}
                </CardDescription>
                <p className="text-xs text-muted-foreground">
                  {rifa.sorteioModo?.startsWith("SISTEMA") ? "Sorteado pelo sistema, acionado por " : "Registrado por "}
                  {rifa.sorteadoPor?.name ?? "—"}
                  {rifa.sorteadoAt ? ` em ${dataHoraBr(rifa.sorteadoAt)}` : ""}
                  {rifa.sorteioModo ? ` · ${SORTEIO_MODO_LABEL[rifa.sorteioModo as SorteioModo]}` : ""}
                  {rifa.sorteioUniverso != null ? ` (${rifa.sorteioUniverso} número${rifa.sorteioUniverso === 1 ? "" : "s"} concorrendo)` : ""}
                  {rifa.observacaoSorteio ? ` · ${rifa.observacaoSorteio}` : ""}
                </p>
                {rifa.sorteioSemente && (
                  <p className="text-xs text-muted-foreground">
                    Semente do sorteio: <code className="rounded bg-white px-1">{rifa.sorteioSemente}</code> — o número é a posição
                    (semente mod quantidade concorrendo) na lista ordenada dos números concorrentes; qualquer irmão pode conferir.
                  </p>
                )}
              </CardHeader>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle>{rifa.titulo}</CardTitle>
                  {rifa.descricao && <CardDescription className="mt-1 whitespace-pre-line">{rifa.descricao}</CardDescription>}
                </div>
                <Badge variant={faseVariant[fase!]}>{FASE_LABEL[fase!]}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {rifa.fotos.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {rifa.fotos.map((f) => (
                    <a key={f} href={mediaSrc(f) ?? "#"} target="_blank" rel="noreferrer" className="shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={mediaSrc(f) ?? ""}
                        alt={`Foto do prêmio — ${rifa.titulo}`}
                        className={rifa.fotos.length === 1 ? "h-64 max-w-full rounded-xl border object-cover" : "h-44 w-44 rounded-xl border object-cover"}
                      />
                    </a>
                  ))}
                </div>
              )}
              <div className="grid gap-2 text-sm sm:grid-cols-4">
                <div className="rounded-xl bg-secondary px-3 py-2">
                  <p className="text-xs text-muted-foreground">Cada número</p>
                  <p className="font-semibold">{brl(rifa.valorCents)}</p>
                </div>
                <div className="rounded-xl bg-secondary px-3 py-2">
                  <p className="text-xs text-muted-foreground">Vendas</p>
                  <p className="font-semibold">{dataBr(rifa.inicio)} a {dataBr(rifa.fim)}</p>
                </div>
                <div className="rounded-xl bg-secondary px-3 py-2">
                  <p className="text-xs text-muted-foreground">Sorteio</p>
                  <p className="font-semibold">{dataBr(rifa.sorteioEm)}</p>
                </div>
                <div className="rounded-xl bg-secondary px-3 py-2">
                  <p className="text-xs text-muted-foreground">Números</p>
                  <p className="font-semibold">{resumo!.vendidos} de {rifa.quantidadeNumeros} reservados</p>
                </div>
              </div>

              <GradeNumeros
                quantidade={rifa.quantidadeNumeros}
                valorCents={rifa.valorCents}
                podeReservar={podeReservar(rifa, agora)}
                gestor={gestor}
                ocupados={numeros.map((n) => ({
                  id: n.id,
                  numero: n.numero,
                  meu: n.userId === user.id,
                  pago: n.pago,
                  nome: gestor ? n.user.name : null,
                }))}
              />
            </CardContent>
          </Card>

          {/* Meus números + Pix */}
          {meus.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Meus números</CardTitle>
                <CardDescription>
                  {meus.length} número{meus.length > 1 ? "s" : ""} — {meusPendentes.length === 0
                    ? "todos pagos. Boa sorte!"
                    : `${meusPendentes.length} a pagar (${brl(meusPendentes.length * rifa.valorCents)}).`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="flex flex-wrap gap-2">
                  {meus.map((n) => (
                    <li key={n.id} className="flex items-center gap-2 rounded-full border bg-gold-soft px-3 py-1 text-sm">
                      <span className="font-semibold tabular-nums">{n.numero}</span>
                      <span className={n.pago ? "text-xs text-success" : "text-xs text-muted-foreground"}>{n.pago ? "pago" : "a pagar"}</span>
                      {!n.pago && podeReservar(rifa, agora) && <LiberarNumeroButton numeroId={n.id} numero={n.numero} />}
                    </li>
                  ))}
                </ul>
                {meusPendentes.length > 0 && (
                  chave && qr && payload ? (
                    <div className="flex flex-col items-center gap-3 rounded-xl border p-4 sm:flex-row sm:items-start">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qr} alt="QR Code Pix da rifa" className="h-44 w-44 rounded-md border bg-white p-1" />
                      <div className="space-y-2 text-sm">
                        <p className="font-medium">Pague {brl(meusPendentes.length * rifa.valorCents)} por Pix</p>
                        <p className="text-muted-foreground">
                          Aponte a câmera do seu banco para o QR Code ou use o Copia e Cola — o valor já vai preenchido.
                          Depois do pagamento, o Esmoler (ou o Venerável) dá baixa nos seus números.
                        </p>
                        <CopyButton text={payload} label="Copiar código Pix (Copia e Cola)" />
                        <p className="text-xs text-muted-foreground">Chave Pix: {chave}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      A Loja ainda não cadastrou chave Pix — combine o pagamento com o Esmoler.
                    </p>
                  )
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Gestão (VM/Esmoler) */}
      {gestor && (
        <>
          {rifa && (
            <Card>
              <CardHeader>
                <CardTitle>Arrecadação</CardTitle>
                <CardDescription>
                  {resumo!.vendidos} reservados ({resumo!.pagos} pagos) · {resumo!.livres} livres ·
                  recebido {brl(resumo!.arrecadadoCents)} de {brl(resumo!.previstoCents)} previstos
                  (potencial {brl(resumo!.potencialCents)}).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {numeros.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum número reservado ainda.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="py-1.5 pr-2">Nº</th>
                          <th className="py-1.5 pr-2">Irmão</th>
                          <th className="py-1.5 pr-2">Pagamento</th>
                          {rifa.numeroSorteado == null && <th className="py-1.5" />}
                        </tr>
                      </thead>
                      <tbody>
                        {numeros.map((n) => (
                          <tr key={n.id} className={n.numero === rifa.numeroSorteado ? "bg-gold-soft" : "border-b last:border-0"}>
                            <td className="py-1.5 pr-2 font-semibold tabular-nums">{n.numero}</td>
                            <td className="py-1.5 pr-2">{n.user.name}</td>
                            <td className="py-1.5 pr-2">
                              <PagoToggle numeroId={n.id} pago={n.pago} />
                              {n.pago && n.pagoAt && <span className="ml-1 text-xs text-muted-foreground">{dataBr(n.pagoAt)}</span>}
                            </td>
                            {rifa.numeroSorteado == null && (
                              <td className="py-1.5 text-right"><LiberarNumeroButton numeroId={n.id} numero={n.numero} /></td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {rifa.numeroSorteado == null && (
                  <div className="border-t pt-4">
                    <p className="mb-2 text-sm font-medium">Registrar venda em nome de um irmão</p>
                    <VendaPresencialForm irmaos={irmaos} />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {rifa && rifa.numeroSorteado == null && (
            <Card>
              <CardHeader>
                <CardTitle>Sorteio</CardTitle>
                <CardDescription>
                  {podeSortear(rifa, agora)
                    ? "Sorteie pelo próprio sistema (semente aleatória registrada para conferência) ou informe o número de um sorteio externo. Nos dois casos o sistema aponta o irmão dono do número e avisa todo o quadro."
                    : `Disponível depois do fim das vendas (${dataBr(rifa.fim)}).`}
                </CardDescription>
              </CardHeader>
              {podeSortear(rifa, agora) && (
                <CardContent className="space-y-5">
                  <div className="rounded-xl border bg-secondary/40 p-3">
                    <p className="mb-2 text-sm font-medium">Sortear pelo sistema</p>
                    <SorteioAutomaticoForm pagos={resumo!.pagos} reservados={resumo!.vendidos} />
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium">Ou registrar um sorteio feito fora do sistema</p>
                    <SorteioForm quantidade={rifa.quantidadeNumeros} />
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{rifa ? "Configuração da campanha" : "Habilitar campanha"}</CardTitle>
              <CardDescription>
                {rifa
                  ? "Ajuste título, datas, quantidade de números e valor. Habilitada por " + rifa.criadoPor.name + "."
                  : "Defina período de vendas, quantidade de números, valor de cada número e data do sorteio. Enquanto vigente, a Rifa aparece no menu de todos os irmãos e eles são avisados."}
                {" "}O mesmo formulário está nas{" "}
                <Link href="/dashboard/loja" className="underline">Configurações da Loja</Link>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CampanhaForm atual={formDados} />
            </CardContent>
          </Card>

          {historico.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Campanhas anteriores</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y text-sm">
                  {historico.map((h) => (
                    <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div>
                        <p className="font-medium">{h.titulo}</p>
                        <p className="text-xs text-muted-foreground">
                          {dataBr(h.inicio)} a {dataBr(h.fim)} · {h._count.numeros} de {h.quantidadeNumeros} números a {brl(h.valorCents)}
                        </p>
                      </div>
                      <p className="text-xs">
                        {h.numeroSorteado != null
                          ? `Nº ${h.numeroSorteado} — ${h.ganhador?.name ?? "não vendido"}`
                          : "Encerrada sem sorteio"}
                      </p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
