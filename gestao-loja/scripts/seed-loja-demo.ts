import { PrismaClient, type Role, type Degree } from "@prisma/client";

// Loja de DEMONSTRAÇÃO pública (nº 9999 — Acácia do Oriente), oferecida a
// outras lojas para testar a plataforma. Este script PRESERVA as 10 contas
// divulgadas (demo-vm, demo-sec, demo-tes, demo-esm, demo-cc, demo-m1, demo-m2,
// demo-c1, demo-a1, demo-a2 — senha inalterada), apaga os dados transacionais
// e semeia volume robusto no padrão da loja de testes 7777: 42 membros,
// sessões com presenças, atas, capitações, despesas e progressões.
// Os membros novos (demo-11..demo-42) reutilizam o passwordHash do demo-vm,
// ou seja, entram com a MESMA senha já divulgada.
//
//   npx tsx scripts/seed-loja-demo.ts

const prisma = new PrismaClient();

const LODGE_NUMBER = "9999";
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

// 32 nomes para os membros novos (demo-11..demo-42)
const NOMES = [
  "Aluísio Ferreira Campos", "Bernardo Luz Cardoso", "Cristiano Paes Landim",
  "Davi Salgado Moraes", "Eduardo Antunes Freire", "Fernando Sales Quadros",
  "Geraldo Pires Montenegro", "Homero Dutra Cavalheiro", "Ícaro Bastos Meireles",
  "João Pedro Vilanova", "Kléber Soares Fontoura", "Lauro Espíndola Neto",
  "Miguel Arcanjo Terra", "Natanael Borges Serpa", "Orlando Farias Lacerda",
  "Patrício Gomes Alencar", "Querubim Sá Peixoto", "Ronaldo Uchoa Brandão",
  "Saulo Vergueiro Matos", "Teodoro Assunção Leme", "Ulisses Prata Camargo",
  "Vicente Novaes Aragão", "Washington Cruz Sobral", "Xavier Lins Dorneles",
  "Yago Sampaio Furtado", "Zacarias Mello Drummond", "Adriano Solano Vieira",
  "Breno Falcão Siqueira", "Cássio Toledo Amaral", "Décio Junqueira Pontes",
  "Estevão Ramos Bulhões", "Firmino Costa Azevedo",
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

async function main() {
  const lodge = await prisma.lodge.findUnique({ where: { number: LODGE_NUMBER } });
  if (!lodge) throw new Error(`Loja ${LODGE_NUMBER} não encontrada.`);
  const where = { lodgeId: lodge.id };

  const preservados = await prisma.user.findMany({
    where,
    orderBy: { cim: "asc" },
  });
  const vm = preservados.find((u) => u.currentRole === "VENERAVEL_MESTRE");
  const sec = preservados.find((u) => u.currentRole === "SECRETARIO");
  if (!vm || !sec) throw new Error("Contas demo-vm/demo-sec não encontradas.");

  // Apaga só os dados transacionais — contas e loja ficam.
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
    // membros extras de execuções anteriores deste seed
    prisma.degreeHistory.deleteMany({ where: { ...where, userId: { notIn: preservados.map((u) => u.id) } } }),
    prisma.roleHistory.deleteMany({ where: { ...where, userId: { notIn: preservados.map((u) => u.id) } } }),
    prisma.user.deleteMany({ where: { ...where, id: { notIn: preservados.map((u) => u.id) } } }),
  ]);
  console.log(`Dados transacionais apagados; ${preservados.length} contas preservadas.`);

  // Cargos do rito (upsert simples: cria os que faltarem)
  const cargosExistentes = await prisma.cargoRito.findMany({ where });
  for (const nome of CARGOS_PADRAO) {
    if (!cargosExistentes.some((c) => c.nome === nome)) {
      await prisma.cargoRito.create({ data: { lodgeId: lodge.id, nome } });
    }
  }

  // 32 membros novos com a mesma senha do demo-vm.
  // Distribuição (com os 10 preservados): 24 Mestres / 10 Companheiros / 8 Aprendizes.
  const novos = [];
  for (const [i, nome] of NOMES.entries()) {
    const grau: Degree = i < 17 ? "MESTRE" : i < 24 ? "COMPANHEIRO" : "APRENDIZ";
    const irregular = i === 12 || i === 20;
    novos.push(
      await prisma.user.create({
        data: {
          lodgeId: lodge.id,
          cim: `demo-${i + 11}`,
          cpf: `777000${String(i).padStart(5, "0")}`,
          name: nome,
          email: `demo-${i + 11}@demo.exemplo.br`,
          phone: `(11) 97777-${String(100 + i).padStart(4, "0")}`,
          profession: PROFISSOES[i % PROFISSOES.length],
          birthDate: new Date(1955 + (i % 35), (i * 5) % 12, 1 + (i % 27)),
          passwordHash: vm.passwordHash,
          degree: grau,
          currentRole: "MEMBER" as Role,
          cargoRito: i < CARGOS_PADRAO.length ? CARGOS_PADRAO[i] : null,
          status: irregular ? "IRREGULAR" : "ATIVO",
          initiationDate: mesesAtras(
            grau === "APRENDIZ" ? 8 + i : grau === "COMPANHEIRO" ? 20 + i : 48 + i,
            10
          ),
        },
      })
    );
  }
  const users = [...preservados, ...novos];
  console.log(`${novos.length} membros novos criados (total ${users.length}).`);

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
      const faltoso = i === 15 || i === 33; // 2 faltosos
      if (faltoso && s > 1) continue;
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

  // Atas: duas assinadas e um rascunho na última sessão
  const textoAta =
    "Aos dias da data, reuniu-se a ARLS Acácia do Oriente nº 9999 em sessão ordinária no grau de Aprendiz. Aberta a sessão pelo Venerável Mestre, foi lida e aprovada a ata anterior, tratados os assuntos da ordem do dia, circulado o Tronco de Solidariedade e encerrados os trabalhos na forma ritualística.";
  for (const [n, idx] of [0, 1].entries()) {
    await prisma.ata.create({
      data: {
        lodgeId: lodge.id,
        sessionId: sessoes[idx].id,
        number: n + 1,
        content: textoAta,
        status: "ASSINADA",
        signedByMasterId: vm.id,
        signedByMasterAt: sessoes[idx + 1].date,
        signedBySecId: sec.id,
        signedBySecAt: sessoes[idx + 1].date,
      },
    });
  }
  await prisma.ata.create({
    data: {
      lodgeId: lodge.id,
      sessionId: sessoes[sessoes.length - 1].id,
      number: 3,
      content:
        "Rascunho da ata da última sessão — edite este texto na Secretaria para experimentar o fluxo de validação e assinaturas.",
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

  // Capitações dos últimos 4 meses; irregulares acumulam vencidas
  const hoje = new Date();
  const irregulares = new Set(users.filter((u) => u.status === "IRREGULAR").map((u) => u.id));
  for (let m = 3; m >= 0; m--) {
    const venc = mesesAtras(m, 10);
    const ref = {
      referenceMonth: venc.getMonth() + 1,
      referenceYear: venc.getFullYear(),
    };
    for (const u of users) {
      const inadimplente = irregulares.has(u.id) && m >= 1;
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

  // Despesas pagas dos últimos 3 meses + livro-caixa
  for (let m = 2; m >= 0; m--) {
    for (const [desc, cat, cents] of [
      ["Aluguel do templo", "Aluguel", 250000],
      ["Manutenção e limpeza", "Manutenção", 68000],
    ] as const) {
      const data = mesesAtras(m, 15);
      await prisma.expense.create({
        data: {
          lodgeId: lodge.id,
          description: desc,
          supplier: cat === "Aluguel" ? "Imobiliária Oriente Ltda." : "Serviços Prumo & Nível",
          amountCents: cents,
          dueDate: data,
          category: cat,
          status: "PAGA",
        },
      });
      await prisma.transaction.create({
        data: {
          lodgeId: lodge.id,
          type: "DESPESA",
          description: desc,
          amountCents: cents,
          date: data,
          category: cat,
        },
      });
    }
  }
  console.log("Despesas criadas.");

  // Progressões em andamento no Kanban
  const companheiro = users.find((u) => u.degree === "COMPANHEIRO");
  const aprendiz = users.find((u) => u.degree === "APRENDIZ");
  if (companheiro && aprendiz) {
    await prisma.processoProgressao.createMany({
      data: [
        {
          lodgeId: lodge.id,
          userId: companheiro.id,
          grauAlvo: "MESTRE",
          status: "INSTRUCAO_E_FREQUENCIA",
          dataInicio: mesesAtras(2, 1),
        },
        {
          lodgeId: lodge.id,
          userId: aprendiz.id,
          grauAlvo: "COMPANHEIRO",
          status: "EXAME_PROFICIENCIA",
          dataInicio: mesesAtras(3, 1),
        },
      ],
    });
  }

  console.log(
    `\nLoja demo nº ${LODGE_NUMBER} semeada com ${users.length} membros.` +
      `\nContas divulgadas preservadas (senha inalterada); novos membros demo-11..demo-42 usam a mesma senha.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
