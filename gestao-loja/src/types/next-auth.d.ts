import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    cim: string;
    lodgeId: string;
    lodgeName: string;
    role: string;
    degree: string;
    status?: string;
    mustChangePassword?: boolean;
  }
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      cim: string;
      lodgeId: string;
      lodgeName: string;
      role: string;
      degree: string;
      mustChangePassword?: boolean;
      // true quando a conta deixou de existir/virou EX_MEMBRO (auth.ts);
      // authorized() e requireUser() tratam como deslogado
      invalid?: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    cim?: string;
    lodgeId?: string;
    lodgeName?: string;
    role?: string;
    degree?: string;
    // situação/flags relidos do banco periodicamente (auth.ts)
    status?: string;
    mustChangePassword?: boolean;
    refreshedAt?: number; // epoch ms da última releitura
    invalid?: boolean; // conta inexistente/EX_MEMBRO → sessão rejeitada
  }
}
