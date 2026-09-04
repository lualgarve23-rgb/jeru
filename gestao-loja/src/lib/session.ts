import { cache } from "react";
import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

// Situação da licença da loja, uma query por request (React.cache dedupe
// entre layout, página, actions e rotas na mesma renderização).
const licencaDaLoja = cache(async (lodgeId: string) => {
  const lodge = await prisma.lodge.findUnique({
    where: { id: lodgeId },
    select: { licencaStatus: true },
  });
  return lodge?.licencaStatus ?? null;
});

// Retorna o usuário logado com o lodgeId do tenant.
// Toda query de negócio deve usar este lodgeId como filtro.
//
// Bloqueios aplicados aqui valem para páginas, server actions e route
// handlers de uma vez: conta inválida (EX_MEMBRO/excluída, marcada pelo jwt
// em auth.ts) → login; licença da loja VENCIDA → /licenca-vencida (exceto
// SUPER_ADMIN).
export async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.invalid) {
    try {
      await signOut({ redirect: false });
    } catch {
      // em RSC não dá para apagar o cookie; o redirect abaixo basta
    }
    redirect("/login");
  }
  if (session.user.role !== "SUPER_ADMIN") {
    const licenca = await licencaDaLoja(session.user.lodgeId);
    if (licenca === "VENCIDA") redirect("/licenca-vencida");
  }
  return session.user;
}

// Variante sem o gate da licença — só para a própria página /licenca-vencida
// (e para quem precisa do usuário mesmo com a loja bloqueada).
export async function requireUserSemLicenca() {
  const session = await auth();
  if (!session?.user || session.user.invalid) redirect("/login");
  return session.user;
}

export async function requireRole(...roles: string[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/dashboard");
  return user;
}
