"use client";

import type { StatusAdmissao } from "@prisma/client";
import { statusAdmissaoLabels } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyButton } from "@/components/copy-button";
import { ActionForm, ActionButton } from "@/components/action-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  anexarFormularioCandidato,
  removerAnexoCandidato,
} from "../actions";

type Anexo = {
  id: string;
  nome: string;
  sizeBytes: number;
  enviadoPor: string;
  createdAt: Date;
};

type Candidato = {
  id: string;
  nomeCandidato: string;
  status: StatusAdmissao;
  email: string | null;
  phone: string | null;
  observacoes: string | null;
  createdAt: Date;
  padrinhoNome: string | null;
  linkCandidato: string;
  souPadrinho: boolean;
  anexos: Anexo[];
};

const kb = (bytes: number) =>
  bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1000))} KB`;

export function CandidatosLista({
  processos,
  isWriter,
}: {
  processos: Candidato[];
  isWriter: boolean;
}) {
  if (processos.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          Nenhum candidato indicado até agora.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Candidatos ({processos.length})</CardTitle>
        <CardDescription>
          O link do candidato dá acesso aos formulários de indicação e ao
          envio dos arquivos preenchidos, sem precisar de senha.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {processos.map((p) => {
          const podeAnexar = isWriter || p.souPadrinho;
          return (
            <details key={p.id} className="rounded-lg border">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3 text-sm">
                <span className="font-medium">{p.nomeCandidato}</span>
                <Badge variant="outline">
                  {statusAdmissaoLabels[p.status]}
                </Badge>
                {p.anexos.length > 0 ? (
                  <Badge variant="success">
                    {p.anexos.length} formulário(s)
                  </Badge>
                ) : (
                  <Badge variant="secondary">Sem formulários</Badge>
                )}
                {p.souPadrinho && <Badge variant="outline">Meu indicado</Badge>}
                <span className="ml-auto text-xs text-muted-foreground">
                  Padrinho: {p.padrinhoNome ?? "Secretaria"}
                </span>
              </summary>

              <div className="space-y-4 border-t p-4 text-sm">
                <div className="grid gap-1 sm:grid-cols-2">
                  <p>
                    <span className="text-muted-foreground">E-mail: </span>
                    {p.email ?? "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Telefone: </span>
                    {p.phone ?? "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Indicado em: </span>
                    {p.createdAt.toLocaleDateString("pt-BR")}
                  </p>
                </div>
                {p.observacoes && (
                  <p className="rounded-md bg-muted/50 p-2 text-sm">
                    {p.observacoes}
                  </p>
                )}

                <div className="space-y-2">
                  <p className="font-medium">Link do candidato</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <CopyButton
                      text={p.linkCandidato}
                      label="Copiar link do candidato"
                    />
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={p.linkCandidato}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir
                      </a>
                    </Button>
                  </div>
                  <p className="break-all text-xs text-muted-foreground">
                    {p.linkCandidato}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="font-medium">
                    Formulários recebidos ({p.anexos.length})
                  </p>
                  {p.anexos.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      O candidato ainda não devolveu nenhum formulário.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {p.anexos.map((a) => (
                        <li
                          key={a.id}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <a
                            href={`/secretaria/admissoes/anexo/${a.id}`}
                            className="min-w-0 break-all underline"
                          >
                            {a.nome}
                          </a>
                          <span className="text-xs text-muted-foreground">
                            {kb(a.sizeBytes)} · por {a.enviadoPor} ·{" "}
                            {a.createdAt.toLocaleDateString("pt-BR")}
                          </span>
                          {podeAnexar && (
                            <ActionButton
                              action={() => removerAnexoCandidato(a.id)}
                              label="Remover"
                              variant="outline"
                            />
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {podeAnexar && (
                  <ActionForm
                    action={anexarFormularioCandidato.bind(null, p.id)}
                    submitLabel="Anexar formulário"
                  >
                    <div className="space-y-1">
                      <Label htmlFor={`arquivo-${p.id}`}>
                        Anexar formulário preenchido (PDF, DOC/DOCX, JPG, PNG)
                      </Label>
                      <Input
                        id={`arquivo-${p.id}`}
                        name="arquivo"
                        type="file"
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                        required
                      />
                    </div>
                  </ActionForm>
                )}
              </div>
            </details>
          );
        })}
      </CardContent>
    </Card>
  );
}
