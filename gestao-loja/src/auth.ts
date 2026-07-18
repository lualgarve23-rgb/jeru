import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";

const credentialsSchema = z.object({
  cim: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1)),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "CIM + Senha",
      credentials: {
        cim: { label: "CIM", type: "text" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { cim, password } = parsed.data;

        // O CIM é único globalmente e mapeia o usuário à sua Loja (tenant).
        const user = await prisma.user.findUnique({
          where: { cim },
          include: { lodge: { select: { id: true, name: true } } },
        });
        if (!user || user.status === "EX_MEMBRO") return null;

        // Aceita a senha como digitada e, como fallback, só os dígitos —
        // a senha inicial é o CPF, que muitos digitam com máscara (000.000.000-00)
        let valid = await bcrypt.compare(password.trim(), user.passwordHash);
        if (!valid) {
          const digits = password.replace(/\D/g, "");
          if (digits) valid = await bcrypt.compare(digits, user.passwordHash);
        }
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
