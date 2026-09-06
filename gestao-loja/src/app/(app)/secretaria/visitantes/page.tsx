import Link from "next/link";
import { requireRole } from "@/lib/session";
import { listarVisitantes } from "@/lib/visitantes";
import { criarVisitante } from "../actions";
import { ActionForm } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { InfoDica } from "@/components/info-dica";
import { AJUDA } from "@/lib/ajuda";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Base de Visitantes: só Secretário e Venerável Mestre (alinhado ao menu)
export default async function VisitantesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireRole("SECRETARIO", "VENERAVEL_MESTRE");
  const { q } = await searchParams;
  const visitantes = await listarVisitantes(user.lodgeId, q);
  const total = visitantes.reduce((s, v) => s + v.totalVisitas, 0);
  const csvHref = `/secretaria/visitantes/export${q ? `?q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-1 text-2xl font-bold">
          Visitantes
          <InfoDica titulo="Visitantes" texto={AJUDA.visitantes} />
        </h1>
        <p className="text-sm text-muted-foreground">
          Irmãos de outras Oficinas que visitaram a Loja. A base é alimentada
          pelo check-in por QR Code e pelo convite; aqui a Secretaria completa
          os contatos e consulta o histórico.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cadastrar visitante</CardTitle>
          <CardDescription>
            Para visitantes anunciados ou registrados em papel. Quem fez check-in
            pelo QR Code já está na lista abaixo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={criarVisitante} submitLabel="Cadastrar">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="nome">Nome completo</Label>
                <Input id="nome" name="nome" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cim">CIM</Label>
                <Input id="cim" name="cim" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="telefone">Telefone / WhatsApp</Label>
                <Input id="telefone" name="telefone" type="tel" placeholder="(11) 99999-9999" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" name="email" type="email" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="lojaOrigem">Loja de origem</Label>
                <Input id="lojaOrigem" name="lojaOrigem" placeholder="ex.: ARLS Estrela do Oriente nº 123" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="potencia">Potência</Label>
                <Input id="potencia" name="potencia" placeholder="ex.: GOB-SP" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="oriente">Oriente</Label>
                <Input id="oriente" name="oriente" placeholder="ex.: São Paulo — SP" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="grau">Grau</Label>
                <Input id="grau" name="grau" placeholder="ex.: Mestre" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cargo">Cargo na Loja de origem</Label>
                <Input id="cargo" name="cargo" placeholder="ex.: Orador" />
              </div>
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>
                Visitantes cadastrados ({visitantes.length})
              </CardTitle>
              <CardDescription>
                {total} visita{total === 1 ? "" : "s"} registrada{total === 1 ? "" : "s"} no
                Livro de Presenças.
              </CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <a href={csvHref}>Exportar CSV</a>
            </Button>
          </div>
          <form className="mt-3 flex gap-2" action="/secretaria/visitantes" method="get">
            <Input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Buscar por nome, CIM, e-mail, loja ou potência"
              aria-label="Buscar visitante"
            />
            <Button type="submit" variant="secondary">Buscar</Button>
            {q && (
              <Button asChild variant="ghost">
                <Link href="/secretaria/visitantes">Limpar</Link>
              </Button>
            )}
          </form>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Loja de origem</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead className="text-right">Visitas</TableHead>
                <TableHead>Última visita</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visitantes.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/secretaria/visitantes/${v.id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {v.nome}
                    </Link>
                    {v.cim && (
                      <span className="text-muted-foreground"> · CIM {v.cim}</span>
                    )}
                    {v.grau && (
                      <div className="text-xs text-muted-foreground">
                        {[v.grau, v.cargo].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {v.lojaOrigem ?? <span className="text-muted-foreground">—</span>}
                    {(v.potencia || v.oriente) && (
                      <div className="text-xs text-muted-foreground">
                        {[v.potencia, v.oriente].filter(Boolean).join(" — ")}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {v.telefone && <div>{v.telefone}</div>}
                    {v.email && <div className="text-muted-foreground">{v.email}</div>}
                    {!v.telefone && !v.email && (
                      <span className="text-muted-foreground">sem contato</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{v.totalVisitas}</TableCell>
                  <TableCell>
                    {v.ultimaVisita ? (
                      v.ultimaVisita.toLocaleDateString("pt-BR")
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {visitantes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    {q
                      ? "Nenhum visitante encontrado para a busca."
                      : "Nenhum visitante registrado ainda. Os visitantes entram aqui ao fazer o check-in pelo QR Code da sessão."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
