// Cliente do METAGOB (meta.gob.org.br) — importação do quadro de obreiros.
// A loja informa as credenciais de um usuário com acesso ao Meta (CPF + senha);
// o sistema autentica na API do portal e lê a listagem de membros da loja.
// As credenciais são usadas apenas durante a importação e não são armazenadas.

const META_API = "https://meta.gob.org.br/api/v1";

type MetaContext = {
  id: string;
  context_type: string;
  display_name: string;
  member_id: string | null;
  lodge_id: string | null;
  lodge_city: string | null;
  is_primary: boolean;
};

type MetaLoginResponse = {
  access_token: string;
  contexts?: MetaContext[];
};

export type MetaDependente = {
  nome: string;
  // Só CONJUGE e FILHO existem no cadastro local; outros parentescos vêm null
  parentesco: "CONJUGE" | "FILHO" | null;
  nascimento: string | null; // ISO
};

// Registro genérico das demais abas do Meta (linha do tempo, cargos por
// período, lojas do quadro e títulos/comendas) — vira MetaRegistro local
export type MetaRegistroItem = {
  tipo: "EVENTO" | "CARGO" | "LOJA" | "TITULO";
  titulo: string;
  detalhe: string | null;
  data: string | null; // ISO
  dataFim: string | null;
};

export type MetaMember = {
  metaId: string;
  cim: string;
  cpf: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  nascimento: string | null; // ISO
  grau: string | null;
  status: string | null;
  lodgeName: string | null;
  // Campos do detalhe (members/{id})
  endereco: string | null;
  profissao: string | null;
  iniciacao: string | null; // ISO
  elevacao: string | null;
  exaltacao: string | null;
  rg: string | null;
  naturalidade: string | null;
  estadoCivil: string | null;
  conjuge: string | null;
  nomePai: string | null;
  nomeMae: string | null;
  tipoSanguineo: string | null;
  instalacao: string | null; // ISO — data de instalação (Mestre Instalado)
  foto: string | null; // data URI
  dependentes: MetaDependente[];
  registros: MetaRegistroItem[];
};

async function metaFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${META_API}/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    let detalhe = "";
    try {
      const body = await res.json();
      detalhe = body?.message || body?.detail || body?.error || "";
    } catch {}
    throw new Error(
      res.status === 401 || res.status === 403
        ? `Meta recusou o acesso (${res.status}). Confira CPF e senha.${detalhe ? ` ${detalhe}` : ""}`
        : `Meta respondeu ${res.status} em ${path}.${detalhe ? ` ${detalhe}` : ""}`
    );
  }
  return res.json();
}

// Login no Meta: username = CPF (somente dígitos), como o portal faz
async function metaLogin(cpf: string, senha: string): Promise<MetaLoginResponse> {
  return metaFetch("auth/login", {
    method: "POST",
    body: JSON.stringify({
      username: cpf.replace(/\D/g, ""),
      password: senha,
      user_type: "MEMBER",
    }),
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapMember(m: any): MetaMember {
  // Endereço completo em uma linha (o cadastro local usa um campo único)
  const endereco = m.address_street
    ? [
        `${m.address_street}${m.address_number ? `, ${m.address_number}` : ""}`,
        m.address_complement,
        m.address_neighborhood,
        m.address_city && m.address_state
          ? `${m.address_city}/${m.address_state}`
          : m.address_city || m.address_state,
        m.address_zip_code ? `CEP ${m.address_zip_code}` : null,
      ]
        .filter(Boolean)
        .join(" — ")
    : null;
  return {
    metaId: String(m.id ?? ""),
    cim: String(m.identification_card ?? "").trim(),
    cpf: String(m.cpf ?? "").replace(/\D/g, ""),
    nome: String(m.full_name ?? "").trim(),
    email: m.email ? String(m.email).trim().toLowerCase() : null,
    telefone: m.mobile || m.phone || null,
    nascimento: m.birth_date ?? null,
    grau: m.degree ?? null,
    status: m.status ?? null,
    lodgeName: m.default_lodge_name ?? null,
    endereco,
    profissao: m.profession || null,
    iniciacao: m.initiation_date ?? null,
    elevacao: m.elevation_date ?? null,
    exaltacao: m.raising_date ?? null,
    rg: m.rg_number
      ? [m.rg_number, m.rg_issuer, m.rg_state].filter(Boolean).join(" ")
      : null,
    naturalidade: m.birthplace || null,
    estadoCivil: m.marital_status || null,
    conjuge: m.spouse_name || null,
    nomePai: m.father_name || null,
    nomeMae: m.mother_name || null,
    tipoSanguineo: m.blood_type || null,
    instalacao: m.installation_date ?? null,
    foto: null, // preenchida depois, baixando members/{id}/photo
    dependentes: [], // preenchidos depois, via members/{id}/dependents
    registros: [], // preenchidos depois (history/positions/lodges/titles)
  };
}

// Tipos de evento da linha do tempo do Meta → rótulo em português
const EVENTOS_PT: Record<string, string> = {
  INITIATION: "Iniciação",
  ELEVATION: "Elevação",
  RAISING: "Exaltação",
  EXALTATION: "Exaltação",
  INSTALLATION: "Instalação",
  AFFILIATION: "Filiação",
  FILIATION: "Filiação",
  REGULARIZATION: "Regularização",
  POSITION_START: "Início de Cargo",
  POSITION_END: "Fim de Cargo",
  APPOINTMENT: "Nomeação",
  SUSPENSION: "Suspensão",
  WITHDRAWAL: "Desligamento",
  LEAVE: "Licença",
  REINSTATEMENT: "Reintegração",
  ETERNAL_ORIENT: "Oriente Eterno",
};

function rotuloEvento(tipo: unknown): string {
  const t = String(tipo ?? "").toUpperCase();
  if (!t) return "Evento";
  if (EVENTOS_PT[t]) return EVENTOS_PT[t];
  // "SOME_EVENT_TYPE" → "Some Event Type"
  return t
    .split("_")
    .map((p) => p.charAt(0) + p.slice(1).toLowerCase())
    .join(" ");
}

function itensDe(resposta: unknown): any[] {
  if (Array.isArray(resposta)) return resposta;
  const r = resposta as Record<string, unknown>;
  for (const chave of ["items", "data", "results", "dependents"]) {
    const d = r?.[chave];
    if (Array.isArray(d)) return d;
    // um nível de embrulho a mais: { data: { items: [...] } }
    if (d && typeof d === "object") {
      const interno = itensDe(d);
      if (interno.length) return interno;
    }
  }
  return [];
}

// Varre as demais abas da ficha do Meta (linha do tempo, cargos, lojas do
// quadro e títulos) — cada aba é opcional; falha em uma não derruba as outras
async function baixarRegistros(
  metaId: string,
  auth: Record<string, string>
): Promise<MetaRegistroItem[]> {
  const registros: MetaRegistroItem[] = [];
  const pega = async (path: string) => {
    try {
      return itensDe(await metaFetch(path, { headers: auth }));
    } catch {
      return [];
    }
  };
  const [eventos, cargos, lojas, titulos] = await Promise.all([
    pega(`members/${metaId}/history?limit=200`),
    pega(`members/${metaId}/positions`),
    pega(`members/${metaId}/lodges`),
    pega(`members/${metaId}/commendation-titles`),
  ]);

  for (const e of eventos) {
    registros.push({
      tipo: "EVENTO",
      titulo: rotuloEvento(e.event_type ?? e.eventType),
      detalhe:
        [e.description, e.lodge_name ?? e.lodgeName]
          .filter(Boolean)
          .join(" — ") || null,
      data: e.event_date ?? e.eventDate ?? null,
      dataFim: null,
    });
  }
  for (const c of cargos) {
    const nome = String(
      c.position_name ?? c.positionName ?? c.name ?? c.position ?? ""
    ).trim();
    if (!nome) continue;
    registros.push({
      tipo: "CARGO",
      titulo: nome,
      detalhe: c.lodge_name ?? c.lodgeName ?? null,
      data: c.start_date ?? c.startDate ?? null,
      dataFim: c.end_date ?? c.endDate ?? null,
    });
  }
  for (const l of lojas) {
    const nome = String(l.lodge_name ?? l.lodgeName ?? l.name ?? "").trim();
    if (!nome) continue;
    const numero = l.lodge_number ?? l.lodgeNumber ?? l.number;
    const recolhimento = l.is_primary ?? l.isPrimary ?? l.type === "PRIMARY";
    const ativa = l.is_active ?? l.isActive ?? l.status === "ACTIVE";
    registros.push({
      tipo: "LOJA",
      titulo: numero ? `${nome} Nº ${numero}` : nome,
      detalhe: [recolhimento ? "Recolhimento" : "Filiada", ativa ? "Ativa" : "Inativa"].join(
        " · "
      ),
      data: l.affiliation_date ?? l.affiliationDate ?? l.start_date ?? null,
      dataFim: null,
    });
  }
  for (const t of titulos) {
    const nome = String(
      t.title_name ?? t.titleName ?? t.title ?? t.name ?? t.commendation_title ?? ""
    ).trim();
    if (!nome) continue;
    registros.push({
      tipo: "TITULO",
      titulo: nome,
      detalhe: t.description ?? t.reason ?? null,
      data:
        t.granted_date ??
        t.awarded_date ??
        t.award_date ??
        t.concession_date ??
        t.date ??
        null,
      dataFim: null,
    });
  }
  return registros;
}

// Dependente do Meta → parentesco local. O parentesco pode vir como texto
// (relationship/kinship), objeto (relationship_type.name) ou só o id do tipo
// (relationship_type_id, resolvido pela tabela de referência)
function mapDependente(
  d: any,
  tiposParentesco: Map<string, string>
): MetaDependente | null {
  const nome = String(d.full_name ?? d.fullName ?? d.name ?? "").trim();
  if (!nome) return null;
  const bruto =
    d.relationship ??
    d.kinship ??
    d.relation ??
    d.relationship_type?.name ??
    d.relationship_type?.description ??
    (d.relationship_type_id != null || d.relationshipTypeId != null
      ? tiposParentesco.get(String(d.relationship_type_id ?? d.relationshipTypeId))
      : null) ??
    "";
  const rel = String(bruto)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const parentesco = /ESPOS|CONJUGE|SPOUSE|COMPANHEIR/.test(rel)
    ? ("CONJUGE" as const)
    : /FILH|ENTEAD|SON|DAUGHTER|CHILD/.test(rel)
      ? ("FILHO" as const)
      : null;
  return {
    nome,
    parentesco,
    nascimento: d.birth_date ?? d.birthDate ?? null,
  };
}

// Tabela de referência dos tipos de parentesco (id → nome), quando os
// dependentes vierem só com relationship_type_id
async function buscarTiposParentesco(
  auth: Record<string, string>
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  try {
    const resposta = (await metaFetch("relationship-types", { headers: auth })) as
      | { items?: any[]; data?: any[] }
      | any[];
    const itens = Array.isArray(resposta)
      ? resposta
      : (resposta.items ?? resposta.data ?? []);
    for (const t of itens) {
      if (t?.id != null) mapa.set(String(t.id), String(t.name ?? t.description ?? ""));
    }
  } catch {
    // sem a tabela, os parentescos textuais continuam funcionando
  }
  return mapa;
}

// Dependentes do membro (cônjuge e filhos) — members/{id}/dependents
async function baixarDependentes(
  metaId: string,
  auth: Record<string, string>,
  tiposParentesco: Map<string, string>
): Promise<MetaDependente[]> {
  try {
    const resposta = await metaFetch(`members/${metaId}/dependents`, {
      headers: auth,
    });
    return itensDe(resposta)
      .map((d) => mapDependente(d, tiposParentesco))
      .filter((d): d is MetaDependente => d !== null);
  } catch {
    return [];
  }
}

// Mescla a ficha completa sobre a linha da listagem: só substitui um campo
// quando o detalhe realmente trouxe valor (evita apagar dados bons quando a
// resposta do detalhe vem em outro formato ou incompleta)
function mergeMember(base: MetaMember, detalhe: MetaMember): MetaMember {
  const out = { ...base };
  for (const k of Object.keys(detalhe) as (keyof MetaMember)[]) {
    const v = detalhe[k];
    if (v !== null && v !== "") (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

// Foto do membro (members/{id}/photo) como data URI — até 500 KB
async function baixarFoto(
  metaId: string,
  auth: Record<string, string>
): Promise<string | null> {
  try {
    const res = await fetch(`${META_API}/members/${metaId}/photo`, {
      headers: auth,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const tipo = res.headers.get("content-type") ?? "";
    if (tipo.startsWith("image/")) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0 || buf.length > 500_000) return null;
      return `data:${tipo};base64,${buf.toString("base64")}`;
    }
    // Alguns backends devolvem JSON com a URL da imagem
    if (tipo.includes("json")) {
      const body = (await res.json()) as { url?: string; photo_url?: string };
      const url = body.url || body.photo_url;
      if (!url) return null;
      const img = await fetch(url.startsWith("http") ? url : `https://meta.gob.org.br${url}`, {
        headers: auth,
        cache: "no-store",
      });
      const t2 = img.headers.get("content-type") ?? "";
      if (!img.ok || !t2.startsWith("image/")) return null;
      const buf = Buffer.from(await img.arrayBuffer());
      if (buf.length === 0 || buf.length > 500_000) return null;
      return `data:${t2};base64,${buf.toString("base64")}`;
    }
    return null;
  } catch {
    return null;
  }
}

// Lê todos os membros visíveis no contexto de loja do usuário do Meta.
// Se o usuário tiver mais de um contexto de loja, usa o marcado como
// primário (ou o primeiro) — o Meta já filtra a listagem pelo contexto.
export async function buscarMembrosMeta(
  cpf: string,
  senha: string
): Promise<{ membros: MetaMember[]; contexto: string }> {
  const login = await metaLogin(cpf, senha);
  let token = login.access_token;
  if (!token) throw new Error("O Meta não devolveu o token de acesso.");

  const contextos = (login.contexts ?? []).filter((c) => c.lodge_id);
  const contexto =
    contextos.find((c) => c.is_primary) ?? contextos[0] ?? null;

  // Garante que o token vale para o contexto da loja escolhida
  if (contexto && (login.contexts?.length ?? 0) > 1) {
    try {
      const trocado = (await metaFetch("auth/switch-context", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ context_id: contexto.id }),
      })) as MetaLoginResponse;
      if (trocado.access_token) token = trocado.access_token;
    } catch {
      // segue com o token original — o Meta já restringe pela permissão
    }
  }

  const auth = { Authorization: `Bearer ${token}` };
  const membros: MetaMember[] = [];
  const pageSize = 100;
  for (let page = 1; page <= 50; page++) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (contexto?.lodge_id) params.set("lodge_id", contexto.lodge_id);
    const data = (await metaFetch(`members?${params}`, { headers: auth })) as {
      items?: unknown[];
      data?: unknown[];
      totalPages?: number;
    };
    const itens = data.items ?? data.data ?? [];
    membros.push(...itens.map(mapMember));
    const totalPages = data.totalPages ?? 1;
    if (page >= totalPages || itens.length === 0) break;
  }

  const validos = membros.filter((m) => m.cim && m.nome);

  // A listagem é resumida — busca a ficha completa de cada membro
  // (endereço, profissão, datas de grau), em lotes para não sobrecarregar
  const LOTE = 5;
  const tiposParentesco = await buscarTiposParentesco(auth);
  for (let i = 0; i < validos.length; i += LOTE) {
    await Promise.all(
      validos.slice(i, i + LOTE).map(async (m, k) => {
        if (!m.metaId) return;
        try {
          const resposta = (await metaFetch(`members/${m.metaId}`, {
            headers: auth,
          })) as { data?: unknown } & Record<string, unknown>;
          // A ficha pode vir direta ou embrulhada em { data: {...} }
          const bruto = (resposta.data ?? resposta) as Record<string, unknown>;
          validos[i + k] = mergeMember(m, mapMember(bruto));
        } catch {
          // mantém os dados resumidos da listagem
        }
        const atual = validos[i + k];
        [atual.foto, atual.dependentes, atual.registros] = await Promise.all([
          baixarFoto(m.metaId, auth),
          baixarDependentes(m.metaId, auth, tiposParentesco),
          baixarRegistros(m.metaId, auth),
        ]);
        // Muitos cadastros do Meta vêm com o parentesco em branco (o portal
        // mostra "-"). Classificação por idade: menor de 21 anos = filho;
        // sobrando um único adulto sem parentesco, é o cônjuge.
        const idade = (iso: string | null) => {
          if (!iso) return null;
          const n = new Date(iso);
          return isNaN(n.getTime())
            ? null
            : (Date.now() - n.getTime()) / (365.25 * 24 * 3600 * 1000);
        };
        for (const d of atual.dependentes) {
          const a = idade(d.nascimento);
          if (!d.parentesco && a !== null && a < 21) d.parentesco = "FILHO";
        }
        if (!atual.dependentes.some((d) => d.parentesco === "CONJUGE")) {
          const semParentesco = atual.dependentes.filter((d) => !d.parentesco);
          if (semParentesco.length === 1) semParentesco[0].parentesco = "CONJUGE";
        }
        if (!atual.conjuge) {
          const c = atual.dependentes.find((d) => d.parentesco === "CONJUGE");
          if (c) atual.conjuge = c.nome;
        }
      })
    );
  }

  return {
    membros: validos,
    contexto: contexto?.display_name ?? "conta Meta",
  };
}

// Grau do Meta → enum Degree local (aceita inglês, português e números)
export function mapGrau(grau: string | null): "APRENDIZ" | "COMPANHEIRO" | "MESTRE" {
  const g = (grau ?? "").toUpperCase();
  if (g.includes("MASTER") || g.includes("MESTR") || g === "3") return "MESTRE";
  if (g.includes("FELLOW") || g.includes("COMPAN") || g === "2") return "COMPANHEIRO";
  return "APRENDIZ";
}

// Status do Meta → enum MemberStatus local (desconhecido = ATIVO)
export function mapStatus(
  status: string | null
): "ATIVO" | "IRREGULAR" | "LICENCIADO" | "EX_MEMBRO" {
  const s = (status ?? "").toUpperCase();
  if (s.includes("IRREG")) return "IRREGULAR";
  if (s.includes("LICEN") || s.includes("LEAVE") || s.includes("SLEEP") || s.includes("SONO"))
    return "LICENCIADO";
  if (
    s.includes("WITHDRAW") ||
    s.includes("EXCLU") ||
    s.includes("DESLIG") ||
    s.includes("EX_") ||
    s.includes("INACTIVE")
  )
    return "EX_MEMBRO";
  return "ATIVO";
}
