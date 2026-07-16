import Link from "next/link";
import { requireRole } from "@/lib/session";
import { isGmailConfigured } from "@/lib/gmail";
import { listarInbox } from "@/lib/gmail-inbox";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function EmailsPage() {
  await requireRole("SECRETARIO", "VENERAVEL_MESTRE");

  if (!isGmailConfigured()) {
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-2xl font-bold">E-mails da Loja</h1>
        <p className="text-sm text-muted-foreground">
          Gmail da loja não configurado (defina GMAIL_USER e
          GMAIL_APP_PASSWORD no servidor).
        </p>
      </div>
    );
  }

  let mensagens: Awaited<ReturnType<typeof listarInbox>> = [];
  let erro: string | null = null;
  try {
    mensagens = await listarInbox(25);
  } catch (e) {
    erro = e instanceof Error ? e.message : "Falha ao acessar a caixa.";
  }

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold">E-mails da Loja</h1>
      <Card>
        <CardHeader>
          <CardTitle>Caixa de entrada — {process.env.GMAIL_USER}</CardTitle>
          <CardDescription>
            Últimas {mensagens.length} mensagens recebidas no Gmail da Loja.
            Clique para ler e responder.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {erro ? (
            <p className="text-sm text-destructive">{erro}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>De</TableHead>
                  <TableHead>Assunto</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {mensagens.map((m) => (
                  <TableRow key={m.uid} className={m.seen ? "" : "bg-accent/40"}>
                    <TableCell className={m.seen ? "" : "font-semibold"}>
                      {m.from}
                    </TableCell>
                    <TableCell className={m.seen ? "" : "font-semibold"}>
                      <Link
                        href={`/secretaria/emails/${m.uid}`}
                        className="hover:underline"
                      >
                        {m.subject}
                      </Link>{" "}
                      {m.hasAttachments && <Badge variant="outline">anexo</Badge>}
                      {!m.seen && <Badge className="ml-1">novo</Badge>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {m.date
                        ? m.date.toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/secretaria/emails/${m.uid}`}
                        className="text-sm text-primary hover:underline"
                      >
                        Abrir
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
                {mensagens.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      Caixa de entrada vazia.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
