-- Chaves Asaas separadas: conta da plataforma (licenças) configurável pela
-- interface do super admin, além da conta própria de cada loja (Lodge.asaasApiKey)

CREATE TABLE "platform_config" (
  "id" TEXT NOT NULL DEFAULT 'platform',
  "asaasApiKey" TEXT,
  "asaasWebhookToken" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "platform_config_pkey" PRIMARY KEY ("id")
);
