import { prisma } from "@/lib/prisma";
import { openSecret } from "@/lib/secrets";

// Credenciais Asaas da PLATAFORMA (licenças do SaaS) — o valor gravado pelo
// super admin em /admin tem prioridade; o .env fica como fallback para
// instalações que preferem configurar pelo servidor.
export async function getPlatformAsaas(): Promise<{
  apiKey: string | null;
  webhookToken: string | null;
}> {
  const config = await prisma.platformConfig.findUnique({
    where: { id: "platform" },
  });
  return {
    apiKey:
      openSecret(config?.asaasApiKey) ||
      process.env.ASAAS_PLATFORM_API_KEY ||
      null,
    // webhook token permanece em claro (lookup por igualdade no header)
    webhookToken:
      config?.asaasWebhookToken ||
      process.env.ASAAS_PLATFORM_WEBHOOK_TOKEN ||
      null,
  };
}
