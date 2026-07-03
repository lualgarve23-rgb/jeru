import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    cim: string;
    lodgeId: string;
    lodgeName: string;
    role: string;
    degree: string;
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
  }
}
