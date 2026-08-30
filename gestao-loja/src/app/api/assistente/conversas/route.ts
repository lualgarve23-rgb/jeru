import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Conversas anteriores do assistente — sempre só as do próprio usuário na loja.
export async function GET() {
  const session = await auth();
  if (!session?.user)
    return new NextResponse("Não autenticado.", { status: 401 });

  const conversas = await prisma.assistenteConversa.findMany({
    where: { lodgeId: session.user.lodgeId, userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: { id: true, titulo: true, updatedAt: true },
  });
  return NextResponse.json({ conversas });
}
