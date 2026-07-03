import { auth, signOut } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const roleLabels: Record<string, string> = {
  MEMBER: "Obreiro",
  VENERAVEL_MESTRE: "Venerável Mestre",
  SECRETARIO: "Secretário",
  TESOUREIRO: "Tesoureiro",
  CONSELHO_CONTAS: "Conselho de Contas",
};

export default async function DashboardPage() {
  const session = await auth();
  const user = session!.user;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{user.lodgeName}</h1>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <Button variant="outline" type="submit">
            Sair
          </Button>
        </form>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Bem-vindo, {user.name}</CardTitle>
          <CardDescription>Sessão autenticada com sucesso.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge>CIM {user.cim}</Badge>
          <Badge variant="secondary">{roleLabels[user.role] ?? user.role}</Badge>
          <Badge variant="outline">{user.degree}</Badge>
          <Badge variant="outline">Loja (tenant): {user.lodgeId}</Badge>
        </CardContent>
      </Card>
    </main>
  );
}
