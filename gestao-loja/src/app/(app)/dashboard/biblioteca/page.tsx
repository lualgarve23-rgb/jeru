import { InfoDica } from "@/components/info-dica";
import { AJUDA } from "@/lib/ajuda";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canWriteSecretaria } from "@/lib/permissions";
import { uploadBibliotecaItem, deleteBibliotecaItem } from "./actions";
import { ActionForm, ActionButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bibliotecaCategoriaLabels } from "@/lib/labels";
import { grauWhere, grauMinimoLabels, GRAUS_ACERVO } from "@/lib/graus";
import { Button } from "@/components/ui/button";
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
import { formatBytes } from "@/lib/utils";


export default async function BibliotecaPage() {
  const user = await requireUser();
  const podeEditar = canWriteSecretaria(user.role);
  // Quem edita a Secretaria vê tudo; os demais, só o permitido ao seu grau
  const itens = await prisma.bibliotecaItem.findMany({
    where: {
      lodgeId: user.lodgeId,
      ...(podeEditar ? {} : grauWhere(user.degree)),
    },
    orderBy: [{ categoria: "asc" }, { titulo: "asc" }],
    select: {
      id: true,
      titulo: true,
      autor: true,
      categoria: true,
      descricao: true,
      grauMinimo: true,
      sizeBytes: true,
      createdAt: true,
      uploadedBy: { select: { name: true } },
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-1 text-2xl font-bold">
        Biblioteca Digital
        <InfoDica titulo="Biblioteca Digital" texto={AJUDA.biblioteca} />
      </h1>

      {podeEditar && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Adicionar ao acervo</CardTitle>
            <CardDescription>
              Livros, rituais, decretos e regulamentos ficam disponíveis a
              todos os irmãos da Loja. Arquivo de até 15 MB.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={uploadBibliotecaItem} submitLabel="Adicionar">
              <div className="space-y-1">
                <Label htmlFor="titulo">Título</Label>
                <Input id="titulo" name="titulo" required />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="autor">Autor (opcional)</Label>
                  <Input id="autor" name="autor" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="categoria">Categoria</Label>
                  <select
                    id="categoria"
                    name="categoria"
                    className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                  >
                    {Object.entries(bibliotecaCategoriaLabels).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      )
                    )}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="descricao">Descrição (opcional)</Label>
                <Input id="descricao" name="descricao" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="grauMinimo">Nível de acesso</Label>
                  <select
                    id="grauMinimo"
                    name="grauMinimo"
                    className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                  >
                    {GRAUS_ACERVO.map((g) => (
                      <option key={g} value={g}>
                        {grauMinimoLabels[g]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="file">Arquivo</Label>
                  <Input id="file" name="file" type="file" required />
                </div>
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Acervo da Loja</CardTitle>
          <CardDescription>
            {itens.length === 0
              ? "Nenhum item no acervo ainda."
              : `${itens.length} item(ns) disponíveis para consulta e download.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {itens.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Tamanho</TableHead>
                  <TableHead>Enviado por</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <p className="font-medium">{item.titulo}</p>
                      {(item.autor || item.descricao) && (
                        <p className="text-xs text-muted-foreground">
                          {[item.autor, item.descricao]
                            .filter(Boolean)
                            .join(" — ")}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      {bibliotecaCategoriaLabels[item.categoria] ??
                        item.categoria}
                      {item.grauMinimo !== "APRENDIZ" && (
                        <p className="text-xs text-muted-foreground">
                          {grauMinimoLabels[item.grauMinimo]}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>{formatBytes(item.sizeBytes)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.uploadedBy.name}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button asChild variant="outline" size="sm">
                          <a href={`/api/biblioteca/${item.id}`}>Baixar</a>
                        </Button>
                        {podeEditar && (
                          <ActionButton
                            action={deleteBibliotecaItem.bind(null, item.id)}
                            label="Remover"
                            variant="outline"
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
