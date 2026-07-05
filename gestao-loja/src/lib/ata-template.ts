import type { Degree, SessionType } from "@prisma/client";
import { degreeLabels, sessionTypeLabels } from "@/lib/labels";

// Gera o texto-base da ata (balaústre) conforme o modelo da Loja,
// preenchido com os dados da sessão. Campos sem dado ficam como ___
// para o Secretário completar no rascunho.

const DIAS_EXTENSO = [
  "", "primeiro", "segundo", "terceiro", "quarto", "quinto", "sexto",
  "sétimo", "oitavo", "nono", "décimo", "décimo primeiro", "décimo segundo",
  "décimo terceiro", "décimo quarto", "décimo quinto", "décimo sexto",
  "décimo sétimo", "décimo oitavo", "décimo nono", "vigésimo",
  "vigésimo primeiro", "vigésimo segundo", "vigésimo terceiro",
  "vigésimo quarto", "vigésimo quinto", "vigésimo sexto", "vigésimo sétimo",
  "vigésimo oitavo", "vigésimo nono", "trigésimo", "trigésimo primeiro",
];

const UNIDADES = [
  "", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove",
];
const DEZ_A_DEZENOVE = [
  "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis",
  "dezessete", "dezoito", "dezenove",
];
const DEZENAS = [
  "", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta",
  "setenta", "oitenta", "noventa",
];

// 0–99 por extenso (suficiente para o resto do ano após "dois mil")
function dezenasExtenso(n: number): string {
  if (n <= 0) return "";
  if (n < 10) return UNIDADES[n];
  if (n < 20) return DEZ_A_DEZENOVE[n - 10];
  const d = DEZENAS[Math.floor(n / 10)];
  const u = n % 10;
  return u ? `${d} e ${UNIDADES[u]}` : d;
}

export function anoExtenso(ano: number): string {
  if (ano < 2000 || ano > 2099) return String(ano);
  const resto = ano - 2000;
  return resto ? `dois mil e ${dezenasExtenso(resto)}` : "dois mil";
}

function horaExtenso(date: Date): string {
  const h = date.getHours();
  const m = date.getMinutes();
  const horas =
    h === 0 ? "zero hora" : `${dezenasExtenso(h)} ${h === 1 ? "hora" : "horas"}`;
  if (!m) return horas;
  return `${horas} e ${dezenasExtenso(m)} ${m === 1 ? "minuto" : "minutos"}`;
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
  "agosto", "setembro", "outubro", "novembro", "dezembro",
];

type Presenca = { name: string };
type Visitante = { name: string; lodge?: string | null; potencia?: string | null };

export type AtaTemplateData = {
  lodgeName: string;
  address: string | null;
  degree: Degree;
  type: SessionType;
  date: Date;
  masterName: string | null;
  secretaryName: string | null;
  treasurerName: string | null;
  primeiroVigilanteName: string | null;
  segundoVigilanteName: string | null;
  dirCerimoniasName: string | null;
  guardaInternoName: string | null;
  presentes: Presenca[]; // membros presentes (exceto os cargos nomeados acima)
  visitantes: Visitante[];
  totalMembros: number; // membros da Loja presentes
  // Campos livres preenchidos pelo Secretário antes de gerar o rascunho
  // (vazios viram _____ para completar depois)
  ausenciasJustificadas?: string;
  pautaDoDia?: string;
  primeiroLevantamento?: string;
  segundoLevantamento?: string;
  terceiroLevantamento?: string;
  horaEncerramento?: string;
};

function livre(v: string | undefined): string {
  const t = v?.trim();
  return t ? t : PLACEHOLDER;
}

const PLACEHOLDER = "_____";

export function gerarTextoAta(d: AtaTemplateData): string {
  const grau = (degreeLabels[d.degree] ?? d.degree).toUpperCase();
  const tipo = sessionTypeLabels[d.type] ?? d.type;
  const dia = d.date.getDate();
  const mes = MESES[d.date.getMonth()];
  const ano = d.date.getFullYear();
  const local = d.address
    ? `no endereço de sua sede própria, situada na ${d.address}`
    : "no endereço de sua sede própria";

  const vm = d.masterName ?? PLACEHOLDER;
  const secr = d.secretaryName ?? PLACEHOLDER;
  const tes = d.treasurerName ?? PLACEHOLDER;
  const vig1 = d.primeiroVigilanteName ?? PLACEHOLDER;
  const vig2 = d.segundoVigilanteName ?? PLACEHOLDER;
  const dirCer = d.dirCerimoniasName ?? PLACEHOLDER;
  const gi = d.guardaInternoName ?? PLACEHOLDER;
  const demais = d.presentes.length
    ? d.presentes.map((p) => `Ir∴ ${p.name}`).join(", ")
    : PLACEHOLDER;
  const visitantes = d.visitantes.length
    ? d.visitantes
        .map((v) => {
          const origem = [v.lodge, v.potencia].filter(Boolean).join(" — ");
          return origem ? `Ir∴ ${v.name} (${origem})` : `Ir∴ ${v.name}`;
        })
        .join(", ")
    : null;
  const total = d.totalMembros + d.visitantes.length;

  return `À G∴ D∴ G∴ A∴ D∴ U∴

ATA DA SESSÃO ${tipo.toUpperCase()} DO GRAU DE ${grau}, REALIZADA EM ${String(dia).padStart(2, "0")} DE ${mes.toUpperCase()} DE ${ano}

Ao ${DIAS_EXTENSO[dia]} dia do mês de ${mes} do ano de ${anoExtenso(ano)}, às ${horaExtenso(d.date)}, reuniu-se em número legal, ${local}, os Irs∴ do quadro que assinaram o Livro de Presença, sendo os Trabalhos abertos pelo Mestre da Loja Venerável Ir∴ ${vm}, informando aos presentes que a carta patente da Loja ${d.lodgeName} estava presente em seu devido lugar, apresentando-a e deixando-a à disposição, sendo os cargos preenchidos conforme segue: 1º Vig∴ Ir∴ ${vig1}, 2º Vig∴ Ir∴ ${vig2}, Secr∴ Ir∴ ${secr}, Dir∴ de Cerimônias Ir∴ ${dirCer}, G∴ I∴ Ir∴ ${gi}, Tesoureiro Ir∴ ${tes} e demais cargos preenchidos pelos Irs∴ do quadro, a pedido do Dir∴ de Cer∴.

Demais irmãos do quadro presentes: ${demais}.

Os seguintes irmãos justificaram ausência: ${livre(d.ausenciasJustificadas)}.

Os trabalhos foram abertos conforme o Ritual, no Grau de ${degreeLabels[d.degree] ?? d.degree} Maçom, sendo lida pelo Secretário a pauta do dia:
${livre(d.pautaDoDia)}

No primeiro levantamento, o Secr∴ ${livre(d.primeiroLevantamento)}.

No segundo levantamento, o Secr∴ ${livre(d.segundoLevantamento)}.

No terceiro levantamento, que trata a respeito de questões voltadas à nossa Loja, alguns irmãos se manifestaram conforme descrito abaixo:

${livre(d.terceiroLevantamento)}

A sessão foi preenchida por ${total} obreiros, sendo ${d.totalMembros} da Loja e ${d.visitantes.length} ${d.visitantes.length === 1 ? "irmão visitante" : "irmãos visitantes"}${visitantes ? `: ${visitantes}` : ""}.

Nada mais havendo a tratar e, estando justa e perfeita a Sessão, o M∴ da Loja encerrou os TTrab∴ às ${livre(d.horaEncerramento)}, guardando a carta patente e agradecendo aos presentes, sendo esta Ata lavrada por mim, Secr∴, sendo que após apreciada e aprovada, deverá ser assinada e armazenada em local próprio, determinado pelos quais de direito.`;
}
