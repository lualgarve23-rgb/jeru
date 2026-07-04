// Cliente mínimo da API Asaas (cobrança recorrente cartão/boleto/Pix).
// Cada Loja usa a própria conta Asaas (Lodge.asaasApiKey).
// Sandbox por padrão; em produção defina ASAAS_BASE_URL=https://api.asaas.com/v3

const BASE_URL =
  process.env.ASAAS_BASE_URL ?? "https://api-sandbox.asaas.com/v3";

export class AsaasError extends Error {}

async function asaasFetch<T>(
  apiKey: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      access_token: apiKey,
      ...init?.headers,
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const desc =
      (body as { errors?: { description?: string }[] } | null)?.errors?.[0]
        ?.description ?? `Asaas respondeu ${res.status}`;
    throw new AsaasError(desc);
  }
  return body as T;
}

// ── Clientes ──

export async function ensureCustomer(
  apiKey: string,
  member: { name: string; cpf: string; email: string; asaasCustomerId: string | null }
): Promise<string> {
  if (member.asaasCustomerId) return member.asaasCustomerId;
  const created = await asaasFetch<{ id: string }>(apiKey, "/customers", {
    method: "POST",
    body: JSON.stringify({
      name: member.name,
      cpfCnpj: member.cpf.replace(/\D/g, ""),
      email: member.email,
    }),
  });
  return created.id;
}

// ── Cobranças avulsas ──

// billingType UNDEFINED → o pagador escolhe boleto, cartão ou Pix no link.
export async function createPayment(
  apiKey: string,
  args: {
    customerId: string;
    amountCents: number;
    dueDate: Date;
    description: string;
    externalReference: string; // Invoice.id
  }
): Promise<{ id: string; invoiceUrl: string }> {
  return asaasFetch(apiKey, "/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: args.customerId,
      billingType: "UNDEFINED",
      value: args.amountCents / 100,
      dueDate: args.dueDate.toISOString().slice(0, 10),
      description: args.description,
      externalReference: args.externalReference,
    }),
  });
}

// ── Assinaturas recorrentes (capitação mensal) ──

export async function createSubscription(
  apiKey: string,
  args: {
    customerId: string;
    amountCents: number;
    nextDueDate: Date;
    description: string;
    externalReference: string; // User.id
  }
): Promise<{ id: string }> {
  return asaasFetch(apiKey, "/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      customer: args.customerId,
      billingType: "UNDEFINED",
      cycle: "MONTHLY",
      value: args.amountCents / 100,
      nextDueDate: args.nextDueDate.toISOString().slice(0, 10),
      description: args.description,
      externalReference: args.externalReference,
    }),
  });
}

export async function cancelSubscription(apiKey: string, subscriptionId: string) {
  await asaasFetch(apiKey, `/subscriptions/${subscriptionId}`, {
    method: "DELETE",
  });
}
