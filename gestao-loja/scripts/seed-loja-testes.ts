import { PrismaClient, type Role, type Degree } from "@prisma/client";
import bcrypt from "bcryptjs";

// Loja de TESTES INTERNOS (nº 7777) com 42 membros fictícios — separada da
// loja demo 9999, que está divulgada publicamente e não deve ser mexida.
// Recriável a qualquer momento: rodar de novo apaga e semeia tudo.
//
//   npx tsx scripts/seed-loja-testes.ts

const prisma = new PrismaClient();

const LODGE_NUMBER = "7777";
const PASSWORD = "teste123";
const CAPITACAO_CENTS = 15000;

const CARGOS_PADRAO = [
  "1º Vigilante",
  "2º Vigilante",
  "1º Diácono",
  "2º Diácono",
  "Orador",
  "Guarda Interno",
  "Guarda Externo",
  "Diretor de Cerimônias",
];

const NOMES = [
  "Abel Santana Ribeiro", "Benedito Lopes Farias", "Caio Martins Duarte",
  "Daniel Souza Pinheiro", "Edson Carvalho Neto", "Fábio Teixeira Ramos",
  "Gilberto Nunes Sales", "Hélio Barros Vidal", "Igor Fontes Machado",
  "Jorge Amâncio Peixoto", "Kléber Dias Moreira", "Leandro Assis Cunha",
  "Mauro Siqueira Braga", "Nelson Prado Guimarães", "Otávio Rezende Lima",
  "Pedro Cavalcanti Rocha", "Quintino Alves Serra", "Renato Borges Leal",
  "Samuel Correia Matos", "Tiago Vasconcelos Reis", "Ubirajara Melo Franco",
  "Valter Andrade Coelho", "Wagner Pontes Aguiar", "Xisto Camargo Filho",
  "Yuri Bandeira Sousa", "Zeca Monteiro Paiva", "André Luiz Quaresma",
  "Bruno Cézar Tavares", "Célio Furtado Antunes", "Diego Sampaio Vieira",
  "Elias Werneck Dantas", "Flávio Godoy Xavier", "Gustavo Ferraz Brito",
  "Henrique Sabino Torres", "Ivan Queiroz Macedo", "Júlio Barreto Sena",
  "Kauê Domingues Lira", "Luciano Estevão Porto", "Marcelo Ataíde Neves",
  "Norberto Falcão Silveira", "Osmar Bittar Leão", "Plínio Casado Moura",
];

const PROFISSOES = [
  "Engenheiro civil", "Professor", "Contador", "Médico", "Advogado",
  "Empresário", "Arquiteto", "Analista de sistemas", "Farmacêutico",
  "Administrador", "Dentista", "Economista", "Servidor público", "Comerciante",
];

function mesesAtras(meses: number, dia: number): Date {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - meses);
  d.setDate(dia);
  d.setHours(20, 0, 0, 0);
  return d;
}

// 42 membros: 5 oficiais de acesso, 8 cargos do rito, distribuição de graus
// 24 Mestres / 10 Companheiros / 8 Aprendizes; 2 irregulares e 2 faltosos.
function gerarMembros() {
  const roles: Role[] = [
    "VENERAVEL_MESTRE",
    "SECRETARIO",
    "TESOUREIRO",
    "ESMOLER",
    "CONSELHO_CONTAS",
  ];
  return NOMES.map((nome, i) => {
    const grau: Degree =
      i < 24 ? "MESTRE" : i < 34 ? "COMPANHEIRO" : "APRENDIZ";
    return {
      cim: `teste-${String(i + 1).padStart(2, "0")}`,
      nome,
      grau,
      role: (i < roles.length ? roles[i] : "MEMBER") as Role,
      // Cargos do rito nos mestres seguintes aos oficiais (índices 5..12)
      cargoRito:
        i >= roles.length && i < roles.length + CARGOS_PADRAO.length
          ? CARGOS_PADRAO[i - roles.length]
          : null,
      profissao: PROFISSOES[i % PROFISSOES.length],
      irregular: i === 20 || i === 30,
      faltoso: i === 21 || i === 38,
    };
  });
}

async function main() {
  const existing = await prisma.lodge.findUnique({
    where: { number: LODGE_NUMBER },
  });
  if (existing) {
    const where = { lodgeId: existing.id };
    await prisma.$transaction([
      prisma.notification.deleteMany({ where }),
      prisma.instrucao.deleteMany({ where }),
      prisma.visitaExterna.deleteMany({ where }),
      prisma.bibliotecaItem.deleteMany({ where }),
      prisma.processoProgressao.deleteMany({ where }),
      prisma.processoAdmissao.deleteMany({ where }),
      prisma.quittePlacet.deleteMany({ where }),
      prisma.transaction.deleteMany({ where }),
      prisma.invoice.deleteMany({ where }),
      prisma.expense.deleteMany({ where }),
      prisma.categoriaFinanceira.deleteMany({ where }),
      prisma.donation.deleteMany({ where }),
      prisma.charityEvent.deleteMany({ where }),
      prisma.attendance.deleteMany({ where }),
      prisma.ata.deleteMany({ where }),
      prisma.lodgeSession.deleteMany({ where }),
      prisma.prancha.deleteMany({ where }),
      prisma.document.deleteMany({ where }),
      prisma.degreeHistory.deleteMany({ where }),
      prisma.roleHistory.deleteMany({ where }),
      prisma.cargoRito.deleteMany({ where }),
      prisma.user.deleteMany({ where }),
      prisma.lodge.delete({ where: { id: existing.id } }),
    ]);
    console.log("Loja de testes anterior apagada.");
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const lodge = await prisma.lodge.create({
    data: {
      name: "Loja de Testes Obreiros do Prumo",
      number: LODGE_NUMBER,
      potencia: "GOB",
      oriente: "São Paulo/SP",
      address: "Av. dos Testes, 42 — Centro — São Paulo — SP",
      cargosRito: { create: CARGOS_PADRAO.map((nome) => ({ nome })) },
    },
  });

  const MEMBROS = gerarMembros();
  const users = [];
  for (const [i, m] of MEMBROS.entries()) {
    users.push(
      await prisma.user.create({
        data: {
          lodgeId: lodge.id,
          cim: m.cim,
          cpf: `888000${String(i).padStart(5, "0")}`,
          name: m.nome,
          email: `${m.cim}@teste.exemplo.br`,
          phone: `(11) 98888-${String(100 + i).padStart(4, "0")}`,
          profession: m.profissao,
          birthDate: new Date(1955 + (i % 35), (i * 5) % 12, 1 + (i % 27)),
          passwordHash,
          degree: m.grau,
          currentRole: m.role,
          cargoRito: m.cargoRito,
          status: m.irregular ? "IRREGULAR" : "ATIVO",
          initiationDate: mesesAtras(
            m.grau === "APRENDIZ" ? 8 + i : m.grau === "COMPANHEIRO" ? 20 + i : 48 + i,
            10
          ),
        },
      })
    );
  }
  console.log(`${users.length} membros criados.`);

  // Sessões: 2 por mês nos últimos 4 meses, com presenças (~85%)
  const sessoes = [];
  for (let m = 3; m >= 0; m--) {
    for (const dia of [7, 21]) {
      sessoes.push(
        await prisma.lodgeSession.create({
          data: {
            lodgeId: lodge.id,
            date: mesesAtras(m, dia),
            type: m === 0 && dia === 7 ? "MAGNA" : "ORDINARIA",
            degree: "APRENDIZ",
          },
        })
      );
    }
  }
  for (const [s, sessao] of sessoes.entries()) {
    const presencas = [];
    for (const [i, u] of users.entries()) {
      const faltoso = MEMBROS[i].faltoso;
      if (faltoso && s > 1) continue; // faltosos: só as 2 primeiras
      if (!faltoso && (i * 7 + s * 3) % 13 === 0) continue; // falta ocasional
      presencas.push({
        lodgeId: lodge.id,
        sessionId: sessao.id,
        userId: u.id,
        checkedInAt: sessao.date,
        viaQrCode: (i + s) % 2 === 0,
      });
    }
    await prisma.attendance.createMany({ data: presencas });
  }
  console.log(`${sessoes.length} sessões com presenças criadas.`);

  // Uma ata assinada (1ª sessão) e um rascunho (última)
  const vm = users[0];
  const sec = users[1];
  await prisma.ata.create({
    data: {
      lodgeId: lodge.id,
      sessionId: sessoes[0].id,
      number: 1,
      content:
        "Aos dias da data, reuniu-se a Loja de Testes Obreiros do Prumo em sessão ordinária no grau de Aprendiz. Aberta a sessão pelo Venerável Mestre, foi lida e aprovada a ata anterior, tratados os assuntos da ordem do dia, circulado o Tronco de Solidariedade e encerrados os trabalhos na forma ritualística.",
      status: "ASSINADA",
      signedByMasterId: vm.id,
      signedByMasterAt: sessoes[1].date,
      signedBySecId: sec.id,
      signedBySecAt: sessoes[1].date,
    },
  });
  await prisma.ata.create({
    data: {
      lodgeId: lodge.id,
      sessionId: sessoes[sessoes.length - 1].id,
      number: 2,
      content:
        "Rascunho da ata da última sessão — edite este texto na Secretaria para testar o fluxo de validação e assinaturas.",
      status: "RASCUNHO",
    },
  });

  await prisma.categoriaFinanceira.createMany({
    data: [
      { lodgeId: lodge.id, nome: "Capitação", tipo: "RECEITA" },
      { lodgeId: lodge.id, nome: "Tronco", tipo: "RECEITA" },
      { lodgeId: lodge.id, nome: "Aluguel", tipo: "DESPESA" },
      { lodgeId: lodge.id, nome: "Manutenção", tipo: "DESPESA" },
    ],
  });

  // Capitações dos últimos 4 meses; irregulares acumulam 3 vencidas
  const hoje = new Date();
  for (let m = 3; m >= 0; m--) {
    const venc = mesesAtras(m, 10);
    const ref = {
      referenceMonth: venc.getMonth() + 1,
      referenceYear: venc.getFullYear(),
    };
    for (const [i, u] of users.entries()) {
      const inadimplente = MEMBROS[i].irregular && m >= 1;
      const pendente = m === 0;
      const status = inadimplente
        ? "VENCIDA"
        : pendente
          ? venc < hoje
            ? "VENCIDA"
            : "PENDENTE"
          : "PAGA";
      const invoice = await prisma.invoice.create({
        data: {
          lodgeId: lodge.id,
          userId: u.id,
          description: `Capitação ${String(ref.referenceMonth).padStart(2, "0")}/${ref.referenceYear}`,
          ...ref,
          amountCents: CAPITACAO_CENTS,
          dueDate: venc,
          status,
          ...(status === "PAGA" ? { paidAt: venc, paidMethod: "PIX" as const } : {}),
        },
      });
      if (invoice.status === "PAGA") {
        await prisma.transaction.create({
          data: {
            lodgeId: lodge.id,
            type: "RECEITA",
            description: `${invoice.description} — ${u.name}`,
            amountCents: CAPITACAO_CENTS,
            date: venc,
            category: "Capitação",
            invoiceId: invoice.id,
          },
        });
      }
    }
  }
  console.log("Capitações e transações criadas.");

  // Progressões em andamento no Kanban (aprendiz e companheiro elegíveis)
  await prisma.processoProgressao.createMany({
    data: [
      {
        lodgeId: lodge.id,
        userId: users[24].id, // primeiro Companheiro (índices 24–33)
        grauAlvo: "MESTRE",
        status: "INSTRUCAO_E_FREQUENCIA",
        dataInicio: mesesAtras(2, 1),
      },
      {
        lodgeId: lodge.id,
        userId: users[35].id, // Aprendiz (índices 34–41)
        grauAlvo: "COMPANHEIRO",
        status: "EXAME_PROFICIENCIA",
        dataInicio: mesesAtras(3, 1),
      },
    ],
  });

  console.log(
    `\nLoja de testes nº ${LODGE_NUMBER} criada com ${users.length} membros.` +
      `\nLogins: teste-01 (VM), teste-02 (Secretário), teste-03 (Tesoureiro), ` +
      `teste-04 (Esmoler), teste-05 (Conselho de Contas), teste-06..42 (membros).` +
      `\nSenha para todos: "${PASSWORD}".`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
