import { PrismaClient, Role, Degree } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("senha123", 10);

  const lodgeA = await prisma.lodge.upsert({
    where: { number: "1234" },
    update: {},
    create: {
      name: "ARLS Estrela do Oriente nº 1234",
      number: "1234",
      potencia: "GOB-SP",
      oriente: "São Paulo/SP",
    },
  });

  const lodgeB = await prisma.lodge.upsert({
    where: { number: "5678" },
    update: {},
    create: {
      name: "ARLS Acácia do Sul nº 5678",
      number: "5678",
      potencia: "GOB-SP",
      oriente: "Campinas/SP",
    },
  });

  const users: Array<{
    lodgeId: string;
    cim: string;
    cpf: string;
    name: string;
    email: string;
    role: Role;
    degree: Degree;
  }> = [
    // Loja A
    { lodgeId: lodgeA.id, cim: "100001", cpf: "11111111111", name: "Venerável da Silva", email: "vm@lojaa.test", role: Role.VENERAVEL_MESTRE, degree: Degree.MESTRE },
    { lodgeId: lodgeA.id, cim: "100002", cpf: "22222222222", name: "Secretário Souza", email: "sec@lojaa.test", role: Role.SECRETARIO, degree: Degree.MESTRE },
    { lodgeId: lodgeA.id, cim: "100003", cpf: "33333333333", name: "Tesoureiro Lima", email: "tes@lojaa.test", role: Role.TESOUREIRO, degree: Degree.MESTRE },
    { lodgeId: lodgeA.id, cim: "100004", cpf: "44444444444", name: "Conselheiro Costa", email: "cc@lojaa.test", role: Role.CONSELHO_CONTAS, degree: Degree.MESTRE },
    { lodgeId: lodgeA.id, cim: "100005", cpf: "55555555555", name: "Aprendiz Oliveira", email: "obr@lojaa.test", role: Role.MEMBER, degree: Degree.APRENDIZ },
    // Loja B (outro tenant)
    { lodgeId: lodgeB.id, cim: "200001", cpf: "66666666666", name: "Venerável Pereira", email: "vm@lojab.test", role: Role.VENERAVEL_MESTRE, degree: Degree.MESTRE },
  ];

  for (const { role, ...u } of users) {
    await prisma.user.upsert({
      where: { cim: u.cim },
      update: {},
      create: {
        ...u,
        currentRole: role,
        passwordHash,
        initiationDate: new Date("2020-01-15"),
      },
    });
  }

  
  // Admin master do SaaS (tenant "sistema")
  const adminLodge = await prisma.lodge.upsert({
    where: { number: "0000" },
    update: {},
    create: { name: "Administração do Sistema", number: "0000" },
  });
  await prisma.user.upsert({
    where: { cim: "999999" },
    update: { currentRole: "SUPER_ADMIN" },
    create: {
      lodgeId: adminLodge.id,
      cim: "999999",
      cpf: "99999999999",
      name: "Admin Master",
      email: "admin@sistema.local",
      passwordHash,
      degree: "MESTRE",
      currentRole: "SUPER_ADMIN",
    },
  });

  console.log("Seed concluído. Senha de todos os usuários: senha123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
