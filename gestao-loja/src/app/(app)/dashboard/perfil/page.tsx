import { mediaSrc } from "@/lib/media-url";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  updateMyPhoto,
  removeMyPhoto,
  updateMyBirthDate,
  addMeuFamiliar,
  updateMeuFamiliar,
  removeMeuFamiliar,
} from "./actions";
import { FamiliaresCard } from "@/components/familiares-card";
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
      cargoRito: true,
      photoUrl: true,
      birthDate: true,
      familiares: { orderBy: { birthDate: "asc" } },
    },
  });

  const initials = me.name
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="sr-only">Meu perfil</h1>
      <section className="bg-hero-gradient shadow-raised flex items-center gap-4 rounded-2xl p-5 text-white">
        {me.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaSrc(me.photoUrl)!}
            alt={`Foto de ${me.name}`}
            className="h-16 w-16 shrink-0 rounded-full border-2 border-white/40 object-cover"
          />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/15 text-xl font-bold">
            {initials}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-lg font-bold leading-tight">{me.name}</p>
          <p className="mt-0.5 truncate text-xs text-white/80">
            CIM {me.cim} · {degreeLabels[me.degree] ?? me.degree}
          </p>
          <p className="truncate text-xs text-white/80">
            {me.cargoRito ?? roleLabels[me.currentRole] ?? me.currentRole}
          </p>
        </div>
      </section>

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
                src={mediaSrc(me.photoUrl)!}
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

      <Card>
        <CardHeader>
          <CardTitle>Aniversário</CardTitle>
          <CardDescription>
            Sua data de nascimento alimenta os alertas de aniversariantes da
            Loja.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={updateMyBirthDate} submitLabel="Salvar data">
            <div className="max-w-xs space-y-1">
              <Label htmlFor="birthDate">Data de nascimento</Label>
              <Input
                id="birthDate"
                name="birthDate"
                type="date"
                defaultValue={
                  me.birthDate ? me.birthDate.toISOString().slice(0, 10) : ""
                }
                required
              />
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      <FamiliaresCard
        familiares={me.familiares}
        addAction={addMeuFamiliar}
        editAction={(familiarId) => updateMeuFamiliar.bind(null, familiarId)}
        removeAction={removeMeuFamiliar}
      />
    </div>
  );
}
