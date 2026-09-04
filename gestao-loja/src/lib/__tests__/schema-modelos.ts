import { readFileSync } from "node:fs";
import path from "node:path";

// Leitura estática do prisma/schema.prisma para os testes de cobertura de
// backup/restore/exclusão de loja (sem banco). Só o suficiente: nome do
// modelo, campos com tipo, relações e se há onDelete: Cascade.

export type Campo = { nome: string; tipo: string; opcional: boolean };
export type Relacao = { alvo: string; cascade: boolean };
export type Modelo = {
  nome: string;
  campos: Campo[];
  relacoes: Relacao[];
  temLodgeId: boolean;
};

export const acessorPrisma = (modelo: string) =>
  modelo.charAt(0).toLowerCase() + modelo.slice(1);

export function lerModelos(): Modelo[] {
  const schema = readFileSync(
    path.resolve(__dirname, "../../../prisma/schema.prisma"),
    "utf8"
  );
  const modelos: Modelo[] = [];
  const re = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(schema))) {
    const [, nome, corpo] = m;
    const campos: Campo[] = [];
    const relacoes: Relacao[] = [];
    for (const linhaBruta of corpo.split("\n")) {
      const linha = linhaBruta.replace(/\/\/.*$/, "").trim();
      if (!linha || linha.startsWith("@@")) continue;
      const partes = linha.split(/\s+/);
      const [campo, tipoBruto] = partes;
      if (!tipoBruto) continue;
      const opcional = tipoBruto.endsWith("?");
      const tipo = tipoBruto.replace(/[?[\]]/g, "");
      if (linha.includes("@relation(fields:")) {
        relacoes.push({ alvo: tipo, cascade: linha.includes("onDelete: Cascade") });
      } else if (!tipoBruto.endsWith("[]")) {
        campos.push({ nome: campo, tipo, opcional });
      }
    }
    modelos.push({
      nome,
      campos,
      relacoes,
      temLodgeId: campos.some((c) => c.nome === "lodgeId"),
    });
  }
  return modelos;
}

export const lerLib = (arquivo: string) =>
  readFileSync(path.resolve(__dirname, "..", arquivo), "utf8");
