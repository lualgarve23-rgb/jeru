import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { updateMyPhoto, removeMyPhoto } from "./actions";
import { ActionForm, ActionButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { degreeLabels, roleLabels } from "@/lib/labels";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function PerfilPage() {
  const user = await requireUser();
  const me = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: {
      name: true,
      cim: true,
      email: true,
      degree: true,
      currentRole: true,
      photoUrl: true,
    },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Meu perfil</h1>
        <p className="text-sm text-muted-foreground">
          {me.name} · CIM {me.cim} ·{" "}
          {degreeLabels[me.degree] ?? me.degree} ·{" "}
          {roleLabels[me.currentRole] ?? me.currentRole}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Foto</CardTitle>
          <CardDescription>
            Exibida no seu cadastro e na lista de membros. Imagem de até 500 KB.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {me.photoUrl ? (
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={me.photoUrl}
                alt={`Foto de ${me.name}`}
                className="h-24 w-24 rounded-full border object-cover"
              />
              <ActionButton
                action={removeMyPhoto}
                label="Remover foto"
                variant="outline"
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhuma foto cadastrada.
            </p>
          )}
          <ActionForm action={updateMyPhoto} submitLabel="Salvar foto">
            <div className="space-y-1">
              <Label htmlFor="photo">Nova foto</Label>
              <Input
                id="photo"
                name="photo"
                type="file"
                accept="image/*"
                required
              />
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
