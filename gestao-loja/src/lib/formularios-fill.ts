import { readFile } from "fs/promises";
import path from "path";
import JSZip from "jszip";
import { prisma } from "@/lib/prisma";

// Preenchimento automático dos formulários oficiais do GOB-SP (.docx).
// Os formulários usam campos legados do Word (FORMTEXT/FORMCHECKBOX); o
// preenchimento é posicional: o n-ésimo campo do documento recebe o valor da
// chave mapeada em CAMPOS_POR_FORMULARIO. Campos não mapeados (dados do
// candidato, valores livres etc.) ficam em branco para completar no Word.

// Chaves de dados resolvidas no servidor a partir da Loja, dos cargos atuais
// e das entradas do usuário (obreiro selecionado, data da sessão, candidato).
export type CampoChave =
  | "lojaNome"
  | "lojaNumero"
  | "oriente" // cidade do oriente
  | "uf"
  // data de hoje por extenso: "05" / "julho" / "2026"
  | "dia"
  | "mes"
  | "ano"
  // data de hoje numérica: "05" / "07" / "2026"
  | "diaN"
  | "mesN"
  | "anoN"
  | "dataHoje" // "05/07/2026"
  // data da sessão informada pelo usuário
  | "dataSessao" // "05/07/2026"
  | "sessaoDia" // "05"
  | "sessaoMes" // "julho" (extenso)
  | "sessaoAno"
  | "sessaoDiaN"
  | "sessaoMesN"
  | "sessaoAnoN"
  // obreiro selecionado
  | "obreiroNome"
  | "obreiroCim"
  // nome do candidato (digitado)
  | "candidato"
  // cargos atuais da Loja
  | "vmNome"
  | "vmCim"
  | "secNome"
  | "secCim"
  | "oradorNome"
  | "oradorCim"
  | "tesNome"
  | "tesCim";

// Mapa posicional: índice do campo (na ordem dos campos do documento,
// contando FORMTEXT e FORMCHECKBOX) → chave de dado.
export type MapaFormulario = Record<number, CampoChave>;

export const CAMPOS_POR_FORMULARIO: Record<string, MapaFormulario> = {
  "form-102-comunicado-filiacao-outra-potencia.docx": {
    0: "lojaNome", 1: "lojaNumero", 2: "oriente", 3: "uf", 4: "uf",
    5: "dataSessao", 6: "obreiroNome",
    11: "oriente", 12: "uf", 13: "dia", 14: "mes", 15: "ano",
    16: "vmNome", 17: "vmCim", 18: "secNome", 19: "secCim",
  },
  "form-106-comunicado-iniciacao.docx": {
    0: "lojaNome", 1: "lojaNumero", 2: "oriente", 3: "uf", 4: "uf",
    5: "dataSessao", 6: "candidato",
    8: "oriente", 9: "uf", 10: "dia", 11: "mes", 12: "ano",
    13: "vmNome", 14: "vmCim", 15: "secNome", 16: "secCim",
  },
  "form-109-comunicado-filiacao-obreiro-gob.docx": {
    0: "lojaNome", 1: "lojaNumero", 2: "oriente", 3: "uf", 4: "uf",
    5: "dataSessao", 6: "obreiroNome", 7: "obreiroCim",
    8: "oriente", 9: "uf", 10: "dia", 11: "mes", 12: "ano",
    13: "vmNome", 14: "vmCim", 15: "secNome", 16: "secCim",
  },
  "form-110-comunicado-elevacao-exaltacao.docx": {
    0: "lojaNome", 1: "lojaNumero", 2: "oriente", 3: "uf", 4: "uf",
    // 5 e 6 são checkboxes ELEVAÇÃO/EXALTAÇÃO (marcar no Word)
    7: "dataSessao", 8: "obreiroNome", 9: "obreiroCim",
    10: "oriente", 11: "uf", 12: "dia", 13: "mes", 14: "ano",
    15: "vmNome", 16: "vmCim", 17: "secNome", 18: "secCim",
  },
  "form-115-comunicado-desligamento.docx": {
    0: "lojaNome", 1: "lojaNumero", 2: "oriente", 3: "uf", 4: "uf",
    5: "dataSessao", 6: "obreiroNome", 7: "obreiroCim",
    8: "oriente", 9: "uf", 10: "dia", 11: "mes", 12: "ano",
    13: "vmNome", 14: "vmCim", 15: "secNome", 16: "secCim",
  },
  "form-121-comunicado-regularizacao-obreiro-gob.docx": {
    0: "lojaNome", 1: "lojaNumero", 2: "oriente", 3: "uf", 4: "uf",
    5: "dataSessao", 6: "obreiroNome", 7: "obreiroCim",
    12: "oriente", 13: "uf", 14: "dia", 15: "mes", 16: "ano",
    17: "vmNome", 18: "vmCim", 19: "secNome", 20: "secCim",
  },
  "form-122-quite-placet.docx": {
    0: "lojaNome", 1: "lojaNumero", 2: "oriente", 3: "uf",
    4: "sessaoDia", 5: "sessaoMes", 6: "sessaoAno",
    7: "obreiroNome", 8: "obreiroCim",
    9: "oriente", 10: "uf", 11: "dia", 12: "mes", 13: "ano",
    14: "vmNome", 15: "vmCim", 16: "secNome", 17: "secCim",
    18: "oradorNome", 19: "oradorCim",
  },
  "form-123-placet-ex-officio.docx": {
    0: "lojaNome", 1: "lojaNumero", 2: "oriente", 3: "uf", 4: "uf",
    5: "dataSessao", 6: "obreiroNome", 7: "obreiroCim",
    8: "oriente", 9: "uf", 10: "dia", 11: "mes", 12: "ano",
    13: "vmNome", 14: "vmCim", 15: "secNome", 16: "secCim",
    17: "oradorNome", 18: "oradorCim",
  },
  "form-124-suspensao-direitos-maconicos.docx": {
    0: "lojaNome", 1: "lojaNumero", 2: "oriente",
    3: "sessaoDiaN", 4: "sessaoMesN", 5: "sessaoAnoN",
    6: "obreiroNome", 7: "obreiroCim",
    // 8 e 9 são checkboxes (artigos do RGF)
    10: "oriente", 11: "dia", 12: "mes", 13: "ano",
    14: "vmNome", 15: "vmCim", 16: "oradorNome", 17: "oradorCim",
    18: "secNome", 19: "secCim",
  },
  "form-125-notificacao-debitos.docx": {
    0: "lojaNome", 1: "lojaNumero", 2: "oriente", 3: "uf",
    4: "obreiroNome", 5: "obreiroCim",
    8: "oriente", 9: "uf", 10: "dia", 11: "mes", 12: "ano",
    13: "tesNome", 14: "tesCim", 15: "vmNome", 16: "vmCim",
  },
  "form-114-consulta-livros.docx": {
    0: "lojaNome", 1: "lojaNumero", 2: "oriente", 3: "uf",
    14: "oriente", 15: "uf", 16: "dia", 17: "mes", 18: "ano",
    19: "secNome", 20: "secCim",
  },
  "form-116-pedido-licenca.docx": {
    0: "lojaNome", 1: "lojaNumero", 2: "oriente", 3: "uf",
    4: "sessaoDiaN", 5: "sessaoMesN", 6: "sessaoAnoN",
    8: "obreiroNome", 9: "obreiroCim",
    10: "oriente", 11: "uf", 12: "dia", 13: "mes", 14: "ano",
    15: "secNome", 16: "secCim",
  },
  "form-107-solicitacao-placet-iniciacao.docx": {
    0: "lojaNome", 1: "lojaNumero", 2: "uf", 3: "candidato",
    4: "sessaoDiaN", 5: "sessaoMesN", 6: "sessaoAnoN",
    11: "diaN", 12: "mesN", 13: "anoN",
    14: "vmNome", 15: "vmCim",
  },
  "form-112-comunicacao-rejeicao-candidato.docx": {
    0: "lojaNome", 1: "lojaNumero", 2: "oriente", 3: "dataHoje",
    4: "candidato", 7: "dataSessao",
    8: "vmNome", 9: "secNome", 10: "vmCim", 11: "secCim",
  },
  "form-111-termo-responsabilidade.docx": {
    0: "lojaNome", 1: "lojaNumero", 2: "oriente",
    11: "oriente", 12: "dia", 13: "mes", 14: "ano",
    15: "vmNome", 16: "vmCim", 17: "oradorNome", 18: "oradorCim",
  },
  "form-126-solicitacao-titulos-honorificos.docx": {
    0: "lojaNome", 1: "lojaNumero", 2: "oriente", 3: "uf",
    44: "diaN", 45: "mesN", 46: "anoN",
    47: "vmNome", 48: "vmCim",
  },
  "form-105-1-2-indicacao-candidato-dados.docx": {
    0: "lojaNome", 1: "lojaNumero", 2: "candidato",
  },
  "form-105-3-indicacao-candidato-sindicancia.docx": {
    0: "lojaNome", 1: "lojaNumero", 2: "candidato", 4: "dataHoje",
  },
  "form-105-4-indicacao-candidato-apresentacao.docx": {
    0: "candidato", 1: "oriente", 2: "dia", 3: "mes", 4: "ano",
  },
  "form-117-pedido-filiacao-regularizacao.docx": {
    0: "vmNome", 1: "lojaNome", 2: "lojaNumero", 3: "oriente",
    16: "oriente", 17: "dia", 18: "mes", 19: "ano",
    21: "oriente", 22: "dia", 23: "mes", 24: "ano",
    25: "vmNome", 26: "vmCim", 27: "oradorNome", 28: "oradorCim",
    29: "secNome", 30: "secCim",
  },
  "form-118-edital-regularizacao.docx": {
    0: "lojaNome", 1: "lojaNumero", 2: "obreiroNome", 3: "obreiroCim",
    50: "dataHoje", 51: "secNome", 52: "secCim",
  },
  "form-120-mudanca-cadastro-loja.docx": {
    0: "lojaNome", 1: "lojaNumero", 2: "oriente", 3: "uf",
    6: "sessaoDiaN", 7: "sessaoMesN", 8: "sessaoAnoN",
    30: "oriente", 31: "dia", 32: "mes", 33: "ano",
    34: "secNome", 35: "secCim",
  },
  "form-009-comunicacao-filiacao-regularizacao.docx": {
    0: "lojaNome", 1: "lojaNumero", 2: "oriente", 3: "uf",
    4: "obreiroNome", 5: "obreiroCim",
    67: "secNome", 68: "secCim",
  },
  "form-101-edital-filiacao-potencia-tratado.docx": {
    0: "lojaNome", 1: "lojaNumero", 2: "oriente", 3: "uf",
    4: "obreiroNome",
    46: "secNome", 47: "secCim",
  },
};

// Formulários cujo mapa usa cada tipo de entrada (para a UI montar o diálogo)
export function entradasDoFormulario(arquivo: string) {
  const mapa = CAMPOS_POR_FORMULARIO[arquivo];
  if (!mapa) return null;
  const chaves = new Set(Object.values(mapa));
  return {
    usaObreiro: chaves.has("obreiroNome") || chaves.has("obreiroCim"),
    usaCandidato: chaves.has("candidato"),
    usaDataSessao:
      chaves.has("dataSessao") ||
      chaves.has("sessaoDia") ||
      chaves.has("sessaoDiaN"),
  };
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// Separa "São Paulo/SP", "São Paulo - SP" ou "São Paulo" em cidade e UF
function parseOriente(oriente: string | null): { cidade: string; uf: string } {
  if (!oriente) return { cidade: "", uf: "SP" };
  const m = oriente.match(/^(.*?)[\s]*[/\-–][\s]*([A-Za-z]{2})$/);
  if (m) return { cidade: m[1].trim(), uf: m[2].toUpperCase() };
  return { cidade: oriente.trim(), uf: "SP" };
}

export type EntradasPreenchimento = {
  obreiroId?: string;
  dataSessao?: string; // "aaaa-mm-dd" (input type=date)
  candidato?: string;
};

// Resolve os valores de todas as chaves para uma loja + entradas do usuário
export async function resolverValores(
  lodgeId: string,
  entradas: EntradasPreenchimento
): Promise<Record<CampoChave, string>> {
  const [lodge, cargos, obreiro] = await Promise.all([
    prisma.lodge.findUniqueOrThrow({
      where: { id: lodgeId },
      select: { name: true, number: true, oriente: true },
    }),
    prisma.user.findMany({
      where: {
        lodgeId,
        currentRole: {
          in: ["VENERAVEL_MESTRE", "SECRETARIO", "ORADOR", "TESOUREIRO"],
        },
      },
      select: { name: true, cim: true, currentRole: true },
    }),
    entradas.obreiroId
      ? prisma.user.findFirst({
          where: { id: entradas.obreiroId, lodgeId },
          select: { name: true, cim: true },
        })
      : null,
  ]);

  const cargo = (r: string) => cargos.find((c) => c.currentRole === r);
  const vm = cargo("VENERAVEL_MESTRE");
  const sec = cargo("SECRETARIO");
  const orador = cargo("ORADOR");
  const tes = cargo("TESOUREIRO");
  const { cidade, uf } = parseOriente(lodge.oriente);

  const hoje = new Date();
  let sessao: Date | null = null;
  if (entradas.dataSessao) {
    const [a, m, d] = entradas.dataSessao.split("-").map(Number);
    if (a && m && d) sessao = new Date(a, m - 1, d);
  }

  return {
    lojaNome: lodge.name,
    lojaNumero: lodge.number,
    oriente: cidade,
    uf,
    dia: pad2(hoje.getDate()),
    mes: MESES[hoje.getMonth()],
    ano: String(hoje.getFullYear()),
    diaN: pad2(hoje.getDate()),
    mesN: pad2(hoje.getMonth() + 1),
    anoN: String(hoje.getFullYear()),
    dataHoje: hoje.toLocaleDateString("pt-BR"),
    dataSessao: sessao ? sessao.toLocaleDateString("pt-BR") : "",
    sessaoDia: sessao ? pad2(sessao.getDate()) : "",
    sessaoMes: sessao ? MESES[sessao.getMonth()] : "",
    sessaoAno: sessao ? String(sessao.getFullYear()) : "",
    sessaoDiaN: sessao ? pad2(sessao.getDate()) : "",
    sessaoMesN: sessao ? pad2(sessao.getMonth() + 1) : "",
    sessaoAnoN: sessao ? String(sessao.getFullYear()) : "",
    obreiroNome: obreiro?.name ?? "",
    obreiroCim: obreiro?.cim ?? "",
    candidato: entradas.candidato ?? "",
    vmNome: vm?.name ?? "",
    vmCim: vm?.cim ?? "",
    secNome: sec?.name ?? "",
    secCim: sec?.cim ?? "",
    oradorNome: orador?.name ?? "",
    oradorCim: orador?.cim ?? "",
    tesNome: tes?.name ?? "",
    tesCim: tes?.cim ?? "",
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Preenche o n-ésimo campo legado (FORMTEXT) do document.xml com o valor
// mapeado. O texto exibido do campo fica entre o fldChar "separate" e o
// "end"; o primeiro <w:t> desse trecho recebe o valor (mantendo a formatação
// do run) e os demais são esvaziados.
export function preencherCamposXml(
  xml: string,
  valores: Record<number, string>
): string {
  const re =
    /<w:fldChar[^>]*w:fldCharType="(begin|separate|end)"[^>]*\/?>|<w:instrText[^>]*>([\s\S]*?)<\/w:instrText>/g;

  type Regiao = { inicio: number; fim: number; valor: string };
  const regioes: Regiao[] = [];

  // Coleta todos os campos do documento; a indexação considera apenas
  // FORMTEXT e FORMCHECKBOX (FORMDROPDOWN e campos comuns como PAGE não
  // contam, para bater com a ordem dos mapas em CAMPOS_POR_FORMULARIO).
  type Campo = { instr: string; sepPos: number; endPos: number };
  const campos: Campo[] = [];

  let depth = 0;
  let instr = "";
  let sepPos = -1; // fim do fldChar "separate" do campo atual
  let m: RegExpExecArray | null;

  while ((m = re.exec(xml))) {
    const tipo = m[1];
    if (!tipo) {
      // instrText
      if (depth > 0) instr += m[2] ?? "";
      continue;
    }
    if (tipo === "begin") {
      depth++;
      if (depth === 1) {
        instr = "";
        sepPos = -1;
      }
    } else if (tipo === "separate") {
      if (depth === 1) sepPos = m.index + m[0].length;
    } else if (tipo === "end") {
      if (depth === 1) {
        campos.push({ instr, sepPos, endPos: m.index });
      }
      depth = Math.max(0, depth - 1);
    }
  }

  let idx = -1;
  for (const campo of campos) {
    if (!/FORMTEXT|FORMCHECKBOX/.test(campo.instr)) continue;
    idx++;
    if (
      idx in valores &&
      /FORMTEXT/.test(campo.instr) &&
      campo.sepPos >= 0 &&
      campo.sepPos < campo.endPos
    ) {
      regioes.push({
        inicio: campo.sepPos,
        fim: campo.endPos,
        valor: valores[idx],
      });
    }
  }

  // Aplica de trás para a frente para não deslocar os índices
  let out = xml;
  for (const r of regioes.reverse()) {
    const trecho = out.slice(r.inicio, r.fim);
    let primeiro = true;
    const novo = trecho.replace(/<w:t[^>]*>[\s\S]*?<\/w:t>/g, () => {
      if (primeiro) {
        primeiro = false;
        return `<w:t xml:space="preserve">${escapeXml(r.valor)}</w:t>`;
      }
      return '<w:t xml:space="preserve"></w:t>';
    });
    out = out.slice(0, r.inicio) + novo + out.slice(r.fim);
  }
  return out;
}

// Gera o DOCX preenchido a partir do arquivo em public/formularios-gob
export async function gerarFormularioPreenchido(
  arquivo: string,
  lodgeId: string,
  entradas: EntradasPreenchimento
): Promise<Buffer> {
  const mapa = CAMPOS_POR_FORMULARIO[arquivo];
  if (!mapa) throw new Error("Formulário sem preenchimento automático.");

  const origem = await readFile(
    path.join(process.cwd(), "public", "formularios-gob", arquivo)
  );
  const chaves = await resolverValores(lodgeId, entradas);
  const valores: Record<number, string> = {};
  for (const [i, chave] of Object.entries(mapa)) {
    const v = chaves[chave];
    if (v) valores[Number(i)] = v;
  }

  const zip = await JSZip.loadAsync(origem);
  const doc = zip.file("word/document.xml");
  if (!doc) throw new Error("DOCX inválido.");
  const xml = await doc.async("string");
  zip.file("word/document.xml", preencherCamposXml(xml, valores));
  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  }) as Promise<Buffer>;
}
