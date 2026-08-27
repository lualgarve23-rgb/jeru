import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";

// Reset de emergência da senha do super admin (análise de segurança 2026-08).
// Só roda com acesso ao servidor — não há superfície web para isso.
// Gera uma senha aleatória, grava o hash e a imprime UMA vez no terminal:
//
//   npx tsx scripts/reset-super-admin.ts
//
// A troca é obrigatória no próximo acesso (mustChangePassword). O bloqueio
// anti-força-bruta (lockedUntil) também é limpo.

const prisma = new PrismaClient();

const ALFABETO = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

async function main() {
  const admins = await prisma.user.findMany({
    where: { currentRole: "SUPER_ADMIN" },
    select: { id: true, cim: true, name: true, email: true, lodge: { select: { number: true } } },
  });
  if (admins.length === 0) {
    console.error("Nenhum usuário SUPER_ADMIN encontrado.");
    process.exit(1);
  }
  if (admins.length > 1) {
    console.error(
      "Mais de um SUPER_ADMIN encontrado — resete manualmente pelo id:\n" +
        admins.map((a) => `  ${a.id}  CIM ${a.cim}  ${a.name}`).join("\n")
    );
    process.exit(1);
  }
  const admin = admins[0];

  let senha = "";
  for (let i = 0; i < 14; i++) senha += ALFABETO[randomInt(ALFABETO.length)];

  await prisma.user.update({
    where: { id: admin.id },
    data: {
      passwordHash: await bcrypt.hash(senha, 10),
      mustChangePassword: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      resetCodeHash: null,
      resetCodeExpiresAt: null,
      resetCodeAttempts: 0,
    },
  });

  console.log(`Senha do super admin ${admin.name} (CIM ${admin.cim}, loja ${admin.lodge.number}) resetada.`);
  console.log(`Senha temporária (troca obrigatória no próximo acesso): ${senha}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
