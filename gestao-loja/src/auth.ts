import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";

const credentialsSchema = z.object({
  cim: z.string().min(1),
  cpf: z
    .string()
    .min(1)
    .transform((v) => v.replace(/\D/g, "")), // aceita com ou sem máscara
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "CIM + CPF + Senha",
      credentials: {
        cim: { label: "CIM", type: "text" },
        cpf: { label: "CPF", type: "text" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { cim, cpf, password } = parsed.data;

        // O CIM é único globalmente e mapeia o usuário à sua Loja (tenant).
        const user = await prisma.user.findUnique({
          where: { cim },
          include: { lodge: { select: { id: true, name: true } } },
        });
        if (!user || user.status === "EX_MEMBRO") return null;
        if (user.cpf.replace(/\D/g, "") !== cpf) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          cim: user.cim,
          lodgeId: user.lodgeId,
          lodgeName: user.lodge.name,
          role: user.currentRole,
          degree: user.degree,
        };
      },
    }),
  ],
});
