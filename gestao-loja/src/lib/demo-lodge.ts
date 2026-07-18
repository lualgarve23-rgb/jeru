import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { CARGOS_PADRAO } from "@/lib/cargos";

// Loja de DEMONSTRAÇÃO (nº 9999) com dados fictícios, para os usuários
// conhecerem o sistema sem tocar em dados reais. Recriável a qualquer momento
// pelo super admin em /admin — a recriação apaga e semeia tudo de novo.

export const DEMO_LODGE_NUMBER = "9999";
export const DEMO_PASSWORD = "demo123";

// CPFs/CIMs/e-mails fictícios (faixa 999.xxx) — não colidem com dados reais
const MEMBROS = [
  { cim: "demo-vm",  nome: "Antônio Ferreira da Luz",   grau: "MESTRE",      role: "VENERAVEL_MESTRE", profissao: "Engenheiro civil" },
  { cim: "demo-sec", nome: "Carlos Eduardo Menezes",    grau: "MESTRE",      role: "SECRETARIO",       profissao: "Professor" },
  { cim: "demo-tes", nome: "João Batista de Almeida",   grau: "MESTRE",      role: "TESOUREIRO",       profissao: "Contador" },
  { cim: "demo-esm", nome: "Francisco das Chagas Melo", grau: "MESTRE",      role: "ESMOLER",          profissao: "Médico" },
  { cim: "demo-cc",  nome: "Roberto Silveira Campos",   grau: "MESTRE",      role: "CONSELHO_CONTAS",  profissao: "Advogado" },
  { cim: "demo-m1",  nome: "Paulo Henrique Nogueira",   grau: "MESTRE",      role: "MEMBER", cargoRito: "Orador",       profissao: "Empresário" },
  { cim: "demo-m2",  nome: "Sérgio Ricardo Tavares",    grau: "MESTRE",      role: "MEMBER", cargoRito: "1º Vigilante", profissao: "Arquiteto", irregular: true },
  { cim: "demo-c1",  nome: "Marcos Vinícius Prado",     grau: "COMPANHEIRO", role: "MEMBER",           profissao: "Analista de sistemas" },
  { cim: "demo-a1",  nome: "Lucas Gabriel Monteiro",    grau: "APRENDIZ",    role: "MEMBER",           profissao: "Farmacêutico" },
  { cim: "demo-a2",  nome: "Rafael Augusto Bittencourt",grau: "APRENDIZ",    role: "MEMBER",           profissao: "Administrador", faltoso: true },
] as const;

const CAPITACAO_CENTS = 15000; // R$ 150,00

function mesesAtras(meses: number, dia: number): Date {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - meses);
  d.setDate(dia);
  d.setHours(20, 0, 0, 0);
  return d;
}

// Apaga a loja demo (se existir) e recria com dados fictícios.
// Devolve as credenciais de acesso para exibição ao super admin.
export async function recreateDemoLodge(): Promise<{ logins: string }> {
  const existing = await prisma.lodge.findUnique({
    where: { number: DEMO_LODGE_NUMBER },
  });
  if (existing) {
    const where = { lodgeId: existing.id };
    await prisma.$transaction([
      prisma.notification.deleteMany({ where }),
      prisma.instrucao.deleteMany({ where }),
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
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const lodge = await prisma.lodge.create({
    data: {
      name: "Loja de Demonstração Acácia do Oriente",
      number: DEMO_LODGE_NUMBER,
      potencia: "GOB",
      oriente: "São Paulo/SP",
      address: "Rua Exemplo, 123 — Centro — São Paulo — SP",
      cargosRito: { create: CARGOS_PADRAO.map((nome) => ({ nome })) },
    },
  });

  // ── Membros ──
  const users = await Promise.all(
    MEMBROS.map((m, i) =>
      prisma.user.create({
        data: {
          lodgeId: lodge.id,
          cim: m.cim,
          cpf: `999000001${String(i).padStart(2, "0")}`,
          name: m.nome,
          email: `${m.cim}@demo.exemplo.br`,
          phone: `(11) 99999-01${String(i).padStart(2, "0")}`,
          profession: m.profissao,
          birthDate: new Date(1960 + i * 3, (i * 2) % 12, 5 + i),
          passwordHash,
          degree: m.grau,
          currentRole: m.role,
          cargoRito: "cargoRito" in m ? m.cargoRito : null,
          status: "irregular" in m && m.irregular ? "IRREGULAR" : "ATIVO",
          initiationDate: mesesAtras(("faltoso" in m ? 10 : 60) + i, 10),
        },
      })
    )
  );
  const byCim = Object.fromEntries(users.map((u) => [u.cim, u]));

  // Familiares (aniversários — um deles neste mês, para acionar os alertas)
  const nesteMes = new Date();
  await prisma.familyMember.createMany({
    data: [
      { userId: byCim["demo-vm"].id, name: "Maria Helena da Luz", parentesco: "CONJUGE", birthDate: new Date(1968, nesteMes.getMonth(), Math.min(nesteMes.getDate() + 3, 28)) },
      { userId: byCim["demo-vm"].id, name: "Pedro da Luz", parentesco: "FILHO", birthDate: new Date(1998, 4, 12) },
      { userId: byCim["demo-sec"].id, name: "Ana Beatriz Menezes", parentesco: "CONJUGE", birthDate: new Date(1972, 8, 21) },
    ],
  });

  // ── Sessões (2 por mês nos últimos 4 meses) e presenças ──
  // demo-a2 é o faltoso: comparece só a 2 de 8 (abaixo da frequência mínima)
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
  for (const [i, sessao] of sessoes.entries()) {
    for (const u of users) {
      if (u.cim === "demo-a2" && i > 1) continue; // faltoso
      if (u.cim === "demo-m2" && i % 3 === 0) continue; // falta ocasional
      await prisma.attendance.create({
        data: {
          lodgeId: lodge.id,
          sessionId: sessao.id,
          userId: u.id,
          checkedInAt: sessao.date,
          viaQrCode: i % 2 === 0,
        },
      });
    }
    // Um visitante em algumas sessões
    if (i % 3 === 0) {
      await prisma.attendance.create({
        data: {
          lodgeId: lodge.id,
          sessionId: sessao.id,
          visitorName: "José Ribamar Visitante",
          visitorCim: "demo-visit",
          visitorLodge: "Estrela do Norte nº 8888",
          visitorPotencia: "GOB",
          checkedInAt: sessao.date,
        },
      });
    }
  }

  // Uma ata assinada (sessão antiga) e uma em rascunho (última sessão)
  await prisma.ata.create({
    data: {
      lodgeId: lodge.id,
      sessionId: sessoes[0].id,
      number: 1,
      content:
        "Aos dias da data, reuniu-se a Loja de Demonstração Acácia do Oriente em sessão ordinária no grau de Aprendiz. Aberta a sessão pelo Venerável Mestre, foi lida e aprovada a ata anterior, tratados os assuntos da ordem do dia, circulado o Tronco de Solidariedade e encerrados os trabalhos na forma ritualística.",
      status: "ASSINADA",
      signedByMasterId: byCim["demo-vm"].id,
      signedByMasterAt: sessoes[1].date,
      signedBySecId: byCim["demo-sec"].id,
      signedBySecAt: sessoes[1].date,
    },
  });
  await prisma.ata.create({
    data: {
      lodgeId: lodge.id,
      sessionId: sessoes[sessoes.length - 1].id,
      number: 2,
      content:
        "Rascunho da ata da última sessão — edite este texto na Secretaria para experimentar o fluxo de validação e assinaturas.",
      status: "RASCUNHO",
    },
  });

  // ── Categorias financeiras ──
  await prisma.categoriaFinanceira.createMany({
    data: [
      { lodgeId: lodge.id, nome: "Capitação", tipo: "RECEITA" },
      { lodgeId: lodge.id, nome: "Tronco", tipo: "RECEITA" },
      { lodgeId: lodge.id, nome: "Eventos", tipo: "RECEITA" },
      { lodgeId: lodge.id, nome: "Aluguel", tipo: "DESPESA" },
      { lodgeId: lodge.id, nome: "Manutenção", tipo: "DESPESA" },
      { lodgeId: lodge.id, nome: "Eventos", tipo: "DESPESA" },
    ],
  });

  // ── Capitações (4 meses): pagas nos meses anteriores; mês atual pendente;
  // demo-m2 com 3 vencidas (motivo do status IRREGULAR) ──
  const hoje = new Date();
  for (let m = 3; m >= 0; m--) {
    const venc = mesesAtras(m, 10);
    const ref = { referenceMonth: venc.getMonth() + 1, referenceYear: venc.getFullYear() };
    for (const u of users) {
      const inadimplente = u.cim === "demo-m2" && m >= 1;
      const pendente = m === 0;
      const invoice = await prisma.invoice.create({
        data: {
          lodgeId: lodge.id,
          userId: u.id,
          description: `Capitação ${String(ref.referenceMonth).padStart(2, "0")}/${ref.referenceYear}`,
          ...ref,
          amountCents: CAPITACAO_CENTS,
          dueDate: venc,
          status: inadimplente ? "VENCIDA" : pendente ? (venc < hoje ? "VENCIDA" : "PENDENTE") : "PAGA",
          ...(!inadimplente && !pendente
            ? { paidAt: venc, paidMethod: "PIX" as const }
            : {}),
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

  // ── Tronco de Solidariedade (uma arrecadação por mês) ──
  for (let m = 3; m >= 1; m--) {
    const data = mesesAtras(m, 21);
    const donation = await prisma.donation.create({
      data: {
        lodgeId: lodge.id,
        type: "TRONCO_SOLIDARIEDADE",
        amountCents: 18000 + m * 2500,
        date: data,
      },
    });
    await prisma.transaction.create({
      data: {
        lodgeId: lodge.id,
        type: "RECEITA",
        description: "Tronco de Solidariedade",
        amountCents: donation.amountCents,
        date: data,
        category: "Tronco",
        donationId: donation.id,
      },
    });
  }

  // ── Despesas: pagas (com aprovação dupla) + uma aguardando aprovação ──
  const despesas = [
    { desc: "Aluguel do templo", fornecedor: "Condomínio Oriente Ltda.", cents: 120000, cat: "Aluguel", mes: 2 },
    { desc: "Manutenção do ar-condicionado", fornecedor: "Clima Frio Serviços", cents: 45000, cat: "Manutenção", mes: 1 },
    { desc: "Jantar festivo — aniversário da Loja", fornecedor: "Buffet Estrela", cents: 250000, cat: "Eventos", mes: 1 },
  ];
  for (const d of despesas) {
    const data = mesesAtras(d.mes, 15);
    const expense = await prisma.expense.create({
      data: {
        lodgeId: lodge.id,
        description: d.desc,
        supplier: d.fornecedor,
        amountCents: d.cents,
        dueDate: data,
        category: d.cat,
        status: "PAGA",
        approvedByMasterId: byCim["demo-vm"].id,
        approvedByMasterAt: data,
        approvedByTreasurerId: byCim["demo-tes"].id,
        approvedByTreasurerAt: data,
        paidAt: data,
      },
    });
    await prisma.transaction.create({
      data: {
        lodgeId: lodge.id,
        type: "DESPESA",
        description: d.desc,
        amountCents: d.cents,
        date: data,
        category: d.cat,
        expenseId: expense.id,
      },
    });
  }
  await prisma.expense.create({
    data: {
      lodgeId: lodge.id,
      description: "Reforma da secretaria",
      supplier: "Construtora Prumo & Nível",
      amountCents: 380000,
      dueDate: mesesAtras(-1, 5),
      category: "Manutenção",
      status: "PENDENTE_APROVACAO",
    },
  });

  // ── Kanban: admissão em andamento e progressões de grau ──
  await prisma.processoAdmissao.create({
    data: {
      lodgeId: lodge.id,
      nomeCandidato: "Fernando Costa Andrade (candidato fictício)",
      email: "candidato@demo.exemplo.br",
      phone: "(11) 98888-0000",
      status: "SINDICANCIA",
      certidoesValidas: true,
      observacoes: "Processo fictício para demonstração do Kanban de admissão.",
    },
  });
  await prisma.processoProgressao.createMany({
    data: [
      { lodgeId: lodge.id, userId: byCim["demo-a1"].id, grauAlvo: "COMPANHEIRO", status: "INSTRUCAO_E_FREQUENCIA", dataInicio: mesesAtras(2, 1) },
      { lodgeId: lodge.id, userId: byCim["demo-c1"].id, grauAlvo: "MESTRE", status: "EXAME_PROFICIENCIA", dataInicio: mesesAtras(3, 1) },
    ],
  });

  const logins = MEMBROS.map((m) => `${m.cim} (${m.nome.split(" ")[0]})`).join(
    ", "
  );
  return {
    logins: `Acessos de teste — senha "${DEMO_PASSWORD}" para todos: ${logins}.`,
  };
}
