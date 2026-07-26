"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { buscarMembrosMeta, mapGrau, mapStatus, type MetaMember } from "@/lib/meta-gob";

// Histórico de graus a partir das datas do Meta (iniciação/elevação/exaltação)
function graus(m: MetaMember): { degree: "APRENDIZ" | "COMPANHEIRO" | "MESTRE"; date: Date }[] {
  return [
    m.iniciacao ? { degree: "APRENDIZ" as const, date: new Date(m.iniciacao) } : null,
    m.elevacao ? { degree: "COMPANHEIRO" as const, date: new Date(m.elevacao) } : null,
    m.exaltacao ? { degree: "MESTRE" as const, date: new Date(m.exaltacao) } : null,
  ].filter((g) => g !== null);
}

// Grava TODOS os dependentes do Meta como familiares, sem duplicar os já
// cadastrados (comparação por nome, ignorando maiúsculas). Sem parentesco
// classificado no Meta entra como DEPENDENTE; sem data de nascimento entra
// mesmo assim (só fica fora dos alertas de aniversário).
async function importarDependentes(userId: string, m: MetaMember) {
  if (m.dependentes.length === 0) return;
  const jaTem = await prisma.familyMember.findMany({
    where: { userId },
    select: { name: true },
  });
  const nomes = new Set(jaTem.map((f) => f.name.trim().toUpperCase()));
  const novos = m.dependentes.filter((d) => !nomes.has(d.nome.trim().toUpperCase()));
  if (novos.length) {
    await prisma.familyMember.createMany({
      data: novos.map((d) => {
        const nascimento =
          d.nascimento && !isNaN(new Date(d.nascimento).getTime())
            ? new Date(d.nascimento)
            : null;
        return {
          userId,
          name: d.nome,
          parentesco: d.parentesco ?? "DEPENDENTE",
          birthDate: nascimento,
        };
      }),
    });
  }
}

// Regrava os registros do Meta (linha do tempo, cargos, lojas, títulos) —
// espelho fiel da varredura mais recente, por isso substitui os anteriores
async function importarRegistros(userId: string, m: MetaMember) {
  if (m.registros.length === 0) return;
  const dataOk = (v: string | null) =>
    v && !isNaN(new Date(v).getTime()) ? new Date(v) : null;
  await prisma.$transaction([
    prisma.metaRegistro.deleteMany({ where: { userId } }),
    prisma.metaRegistro.createMany({
      data: m.registros.map((r) => ({
        userId,
        tipo: r.tipo,
        titulo: r.titulo,
        detalhe: r.detalhe,
        data: dataOk(r.data),
        dataFim: dataOk(r.dataFim),
      })),
    }),
  ]);
}

export type LinhaImportacao = {
  cim: string;
  nome: string;
  grau: string;
  status: string;
  acao: "criar" | "atualizar" | "pular";
  motivo?: string;
  // Resumo do que a varredura encontrou no Meta (ajuda a conferir na simulação)
  meta?: string;
};

export type ImportResult =
  | { error: string }
  | {
      ok: string;
      contexto: string;
      linhas: LinhaImportacao[];
      simulacao: boolean;
    }
  | undefined;

// Importa o quadro de obreiros do METAGOB (meta.gob.org.br).
// Casa por CIM: existente → atualiza dados cadastrais; novo → cria com senha
// provisória = CPF (troca obrigatória no primeiro acesso). Nunca altera o
// nível de acesso (currentRole) nem o cargo do rito dos já cadastrados.
export async function importarMembrosMeta(
  _prev: ImportResult,
  formData: FormData
): Promise<ImportResult> {
  const user = await requireRole("VENERAVEL_MESTRE", "SECRETARIO");
  const cpf = String(formData.get("metaCpf") ?? "").trim();
  const senha = String(formData.get("metaSenha") ?? "");
  const simulacao = formData.get("simulacao") === "on";
  if (!cpf || !senha) {
    return { error: "Informe o CPF e a senha de acesso ao Meta." };
  }

  let membros, contexto;
  try {
    ({ membros, contexto } = await buscarMembrosMeta(cpf, senha));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha ao acessar o Meta." };
  }
  if (membros.length === 0) {
    return { error: `Nenhum membro visível no Meta para ${contexto}.` };
  }

  const existentes = await prisma.user.findMany({
    where: { cim: { in: membros.map((m) => m.cim) } },
    select: { id: true, cim: true, lodgeId: true, email: true },
  });
  const porCim = new Map(existentes.map((u) => [u.cim, u]));
  const bcrypt = (await import("bcryptjs")).default;

  const linhas: LinhaImportacao[] = [];
  let criados = 0;
  let atualizados = 0;

  for (const m of membros) {
    const grau = mapGrau(m.grau);
    const status = mapStatus(m.status);
    const nReg = (t: string) => m.registros.filter((r) => r.tipo === t).length;
    const base = {
      cim: m.cim,
      nome: m.nome,
      grau,
      status,
      meta: [
        m.conjuge ? `cônjuge: ${m.conjuge}` : "sem cônjuge",
        `${m.dependentes.length} dependente(s)`,
        `${nReg("EVENTO")} eventos`,
        `${nReg("CARGO")} cargos`,
        `${nReg("LOJA")} lojas`,
        `${nReg("TITULO")} títulos`,
      ].join(" · "),
    };
    const existente = porCim.get(m.cim);

    if (existente && existente.lodgeId !== user.lodgeId) {
      linhas.push({ ...base, acao: "pular", motivo: "CIM já cadastrado em outra loja" });
      continue;
    }

    if (existente) {
      linhas.push({ ...base, acao: "atualizar" });
      if (!simulacao) {
        // E-mail só muda se o do Meta não colidir com o de outro usuário
        const emailLivre =
          m.email &&
          m.email !== existente.email &&
          !(await prisma.user.findUnique({ where: { email: m.email }, select: { id: true } }));
        await prisma.user.update({
          where: { id: existente.id },
          data: {
            name: m.nome,
            degree: grau,
            status,
            phone: m.telefone ?? undefined,
            birthDate: m.nascimento ? new Date(m.nascimento) : undefined,
            address: m.endereco ?? undefined,
            profession: m.profissao ?? undefined,
            initiationDate: m.iniciacao ? new Date(m.iniciacao) : undefined,
            installationDate: m.instalacao ? new Date(m.instalacao) : undefined,
            rg: m.rg ?? undefined,
            naturalidade: m.naturalidade ?? undefined,
            estadoCivil: m.estadoCivil ?? undefined,
            conjuge: m.conjuge ?? undefined,
            nomePai: m.nomePai ?? undefined,
            nomeMae: m.nomeMae ?? undefined,
            tipoSanguineo: m.tipoSanguineo ?? undefined,
            photoUrl: m.foto ?? undefined,
            ...(emailLivre ? { email: m.email! } : {}),
          },
        });
        // Completa o histórico de graus com as datas do Meta (sem duplicar)
        const jaTem = await prisma.degreeHistory.findMany({
          where: { userId: existente.id },
          select: { degree: true },
        });
        const degreesTem = new Set(jaTem.map((h) => h.degree));
        const faltantes = graus(m).filter((g) => !degreesTem.has(g.degree));
        if (faltantes.length) {
          await prisma.degreeHistory.createMany({
            data: faltantes.map((g) => ({
              lodgeId: user.lodgeId,
              userId: existente.id,
              degree: g.degree,
              date: g.date,
            })),
          });
        }
        await importarDependentes(existente.id, m);
        await importarRegistros(existente.id, m);
        atualizados++;
      }
      continue;
    }

    if (!m.cpf) {
      linhas.push({ ...base, acao: "pular", motivo: "sem CPF no Meta" });
      continue;
    }
    const email = m.email ?? `cim${m.cim}@importado.local`;
    linhas.push({ ...base, acao: "criar" });
    if (!simulacao) {
      try {
        const criado = await prisma.user.create({
          data: {
            lodgeId: user.lodgeId,
            cim: m.cim,
            cpf: m.cpf,
            name: m.nome,
            email,
            phone: m.telefone,
            birthDate: m.nascimento ? new Date(m.nascimento) : null,
            address: m.endereco,
            profession: m.profissao,
            initiationDate: m.iniciacao ? new Date(m.iniciacao) : null,
            installationDate: m.instalacao ? new Date(m.instalacao) : null,
            rg: m.rg,
            naturalidade: m.naturalidade,
            estadoCivil: m.estadoCivil,
            conjuge: m.conjuge,
            nomePai: m.nomePai,
            nomeMae: m.nomeMae,
            tipoSanguineo: m.tipoSanguineo,
            photoUrl: m.foto,
            degree: grau,
            status,
            passwordHash: await bcrypt.hash(m.cpf, 10),
            mustChangePassword: true,
          },
        });
        const historico = graus(m);
        if (historico.length) {
          await prisma.degreeHistory.createMany({
            data: historico.map((g) => ({
              lodgeId: user.lodgeId,
              userId: criado.id,
              degree: g.degree,
              date: g.date,
            })),
          });
        }
        await importarDependentes(criado.id, m);
        await importarRegistros(criado.id, m);
        criados++;
      } catch {
        const l = linhas[linhas.length - 1];
        l.acao = "pular";
        l.motivo = "CPF ou e-mail já cadastrado";
      }
    }
  }

  if (!simulacao) revalidatePath("/secretaria/membros");
  const pulados = linhas.filter((l) => l.acao === "pular").length;
  return {
    ok: simulacao
      ? `Simulação (${contexto}): ${linhas.filter((l) => l.acao === "criar").length} a criar, ` +
        `${linhas.filter((l) => l.acao === "atualizar").length} a atualizar, ${pulados} pulado(s). Nada foi gravado.`
      : `Importação de ${contexto} concluída: ${criados} criado(s), ${atualizados} atualizado(s), ${pulados} pulado(s).`,
    contexto,
    linhas,
    simulacao,
  };
}
