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
  };
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
  for (let i = 0; i < validos.length; i += LOTE) {
    await Promise.all(
      validos.slice(i, i + LOTE).map(async (m, k) => {
        if (!m.metaId) return;
        try {
          const detalhe = await metaFetch(`members/${m.metaId}`, { headers: auth });
          validos[i + k] = mapMember(detalhe);
        } catch {
          // mantém os dados resumidos da listagem
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
