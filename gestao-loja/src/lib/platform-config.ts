import { prisma } from "@/lib/prisma";

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
    apiKey: config?.asaasApiKey || process.env.ASAAS_PLATFORM_API_KEY || null,
    webhookToken:
      config?.asaasWebhookToken ||
      process.env.ASAAS_PLATFORM_WEBHOOK_TOKEN ||
      null,
  };
}
