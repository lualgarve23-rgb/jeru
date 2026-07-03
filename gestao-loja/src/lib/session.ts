import { auth } from "@/auth";
import { redirect } from "next/navigation";

// Retorna o usuário logado com o lodgeId do tenant.
// Toda query de negócio deve usar este lodgeId como filtro.
export async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session.user;
}

export async function requireRole(...roles: string[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/dashboard");
  return user;
}
