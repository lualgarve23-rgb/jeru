# NoPrumo — Gestão da Loja

Sistema multi-tenant de gestão para Lojas Maçônicas (secretaria, tesouraria,
atas, presenças, admissões, carteirinha digital). Next.js 16 (App Router) +
Prisma + PostgreSQL, autenticação NextAuth (JWT), isolamento por `lodgeId`.

## Setup local

```bash
npm install
cp .env.example .env        # preencher (ver comentários no arquivo)
docker run -d --name gestao-loja-pg -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:16
npx prisma migrate dev
npx tsx scripts/seed-loja-testes.ts   # loja 7777 de testes
npm run dev
```

Comandos: `npm run lint` · `npm test` (vitest) · `npm run build`.
CI roda os três em todo push/PR (`.github/workflows/ci.yml`).

## Variáveis de ambiente

Documentadas em `.env.example`. As críticas:

| Variável | Papel |
|---|---|
| `DATABASE_URL` | Postgres |
| `AUTH_SECRET` | NextAuth + cifra de segredos no banco (AES-256-GCM em `lib/secrets.ts`) |
| `SECRETS_ENCRYPTION_KEY` | opcional — chave dedicada da cifra (senão usa `AUTH_SECRET`) |
| `APP_URL` | URL pública (links em e-mails, QR codes) |
| `CRON_SECRET` / `PIX_WEBHOOK_SECRET` | protegem `/api/cron/*` e webhooks |
| `MEDIA_DIR` | fotos/assinaturas em disco local (`lib/media.ts`) |
| `GOOGLE_CLIENT_ID/SECRET` | OAuth do Drive por loja (arquivos e backup) |
| `GOOGLE_SERVICE_ACCOUNT_*` | só o backup da plataforma |

## Arquitetura (mapa rápido)

- `src/app/(app)/` — painel logado: `secretaria/` (actions fatiadas em
  `_actions/` por domínio), `tesouraria/`, `dashboard/`, `admin/` (super admin).
- Rotas públicas rate-limited (`lib/rate-limit.ts` no middleware):
  `/checkin`, `/convite`, `/candidato`, `/verificar`, `/esqueci-senha`.
- `src/lib/` — domínio e integrações: Asaas (cobranças/PIX), Gmail por loja,
  Google Drive por loja (OAuth), METAGOB (importação de quadro), gov.br
  (assinatura de atas), backup/restore, audit log (`audit.ts`), media.
- Multi-tenant: toda query filtra por `lodgeId`; testes estáticos em
  `lib/__tests__/tenant-isolation.test.ts` garantem os guards.
- Licença: `licencaStatus` VENCIDA bloqueia o painel (redireciona
  `/licenca-vencida`).

## Deploy (produção)

Host único (OCI): serviço systemd `gestao-loja.service` (porta 3100) atrás de
nginx com HTTPS/HSTS (`deploy/nginx-noprumo.ia.br.conf`), banco em Docker
(`gestao-loja-pg`). Staging: `gestao-loja-teste.service` (porta 3200),
`teste.noprumo.ia.br`, base `gestao_loja_teste`.

```bash
git pull
npm ci && npm run build
npx prisma migrate deploy     # nunca migrate dev em produção (base tem drift)
sudo systemctl restart gestao-loja      # ou gestao-loja-teste no staging
```

Fluxo: desenvolver e validar no staging (repo `jeruteste`) → portar para o
repo de produção (`jeru`).

## Backup e restauração

Runbook completo em [`docs/RUNBOOK-BACKUP.md`](docs/RUNBOOK-BACKUP.md):
cron diário (`/api/cron/backup`), ZIP por loja no Drive (JSON + CSV + pasta
`media/`), restauração via `lib/restore.ts` e teste de ida-e-volta em
`scripts/testa-restore.ts`.

## Incidentes — primeiros passos

```bash
sudo systemctl status gestao-loja       # caiu? journalctl -u gestao-loja -n 100
docker ps | grep gestao-loja-pg         # banco de pé?
df -h /                                 # disco cheio derruba Postgres e media
```

- App de pé mas erro 500: `journalctl -u gestao-loja -f` e reproduzir.
- Webhook Asaas sem processar: conferir token da loja em Configurações e
  `journalctl` à hora do evento.
- Restaurar dados de uma loja: runbook de backup acima.
- Lojas 7777 (testes) e 9999 (demo pública) ficam fora dos backups — não usar
  para dados reais.
