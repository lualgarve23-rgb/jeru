# Runbook — Backup e Restauração (NoPrumo / gestao-loja)

**Última validação em staging:** 2026-08-09 — `npx tsx scripts/testa-restore.ts` passou
(contagens idênticas, senha preservada por CIM, segredo cifrado AES-256-GCM sobreviveu
ao ciclo e decifra, ZIP não contém segredos).

---

## Visão geral

Há dois caminhos de backup, ambos gerando o mesmo ZIP por loja (`src/lib/backup.ts`):

1. **Backup manual da loja** — Venerável/Secretário em *Configurações da Loja* →
   download do ZIP (`GET /api/backup`, autenticado por sessão).
2. **Backup automático da plataforma** — cron diário sobe um ZIP por loja para o
   Google Drive do super admin (`src/lib/backup-plataforma.ts`), na pasta
   **"Backups NoPrumo"** → subpasta `backup-AAAA-MM-DD` (fuso São Paulo).
   Lojas 9999 (demo) e 7777 (testes) ficam de fora.

O ZIP contém: `dados/*.json` (dump fiel, ids originais), `planilhas/*.csv`,
`arquivos/` (PDFs gov.br, biblioteca, anexos de candidatos, fundo do certificado)
e `LEIA-ME.txt`. **Nunca contém segredos**: hashes de senha, códigos de recuperação,
chaves Asaas, tokens de webhook, refresh tokens Google, senha de app do Gmail,
fotos/assinaturas (data URI) e QR/invite tokens de sessões ficam de fora.

Arquivos arquivados no **Google Drive da loja** (atas assinadas, pranchas, documentos,
certificados de visita) não entram no ZIP — só as referências (`driveFileId`).
O backup dessa pasta do Drive é responsabilidade separada.

## Pré-requisitos no servidor

| Variável | Para quê | Sem ela |
|----------|----------|---------|
| `AUTH_SECRET` (ou `SECRETS_ENCRYPTION_KEY`) | Decifrar segredos `enc:v1:…` no banco | Cifra falha; integrações Asaas/Gmail/Drive quebram |
| `CRON_SECRET` | Autenticar `POST /api/cron/backup` (header `x-cron-secret`) | Cron rejeitado com 401 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth do Drive de backup | "Conta Google de backup não conectada" |
| `DATABASE_URL` | Postgres | — |

Além das envs, o super admin precisa ter conectado a conta Google em `/admin`
("Conectar Google Drive", escopo `drive.file`). O refresh token fica cifrado em
`PlatformConfig.backupGoogleRefreshToken`; o id da pasta raiz em `backupDriveFolderId`
(recriada automaticamente se apagada).

## Cron diário

No host (crontab do usuário da app), ex. 03:15 BRT:

```cron
15 3 * * * curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" https://noprumo.ia.br/api/cron/backup >> /var/log/noprumo-backup.log 2>&1
```

Resposta esperada: `{"enviados": N, "falhas": [], "pasta": "backup-AAAA-MM-DD"}`.
Também dá para disparar manualmente pelo botão **"Backup agora"** em `/admin`.

### Verificação periódica (semanal)

1. `/admin` → lista de backups no Drive mostra a subpasta do dia com um ZIP por loja.
2. Ou conferir no log do cron o campo `enviados` e `falhas: []`.

## Restauração

**Quem:** SUPER_ADMIN, em `/admin`. Duas formas:
- **Do Drive:** escolher o ZIP na lista → restaurar (`restaurarBackupDoDrive`).
- **De arquivo:** upload do ZIP baixado (`restaurarBackup`).

**O que acontece** (`src/lib/restore.ts`):
- Substitui **todos** os dados da loja de mesmo número/id (transação, timeout 120 s);
  recria a loja se não existir mais. Ids originais preservados → referências ao Drive
  continuam válidas.
- **Preservados da loja atual** (não estão no ZIP): credenciais da loja (Asaas,
  Google, Gmail — cifradas), fotos/assinaturas e senhas dos membros (casadas por CIM).
- Membros sem senha preservada recebem hash aleatório + `mustChangePassword` →
  orientar "Esqueci a senha".
- Avisos retornados na tela (ex.: binário de biblioteca ausente em backup antigo).

**Recusa esperada:** "Já existe outra loja com o número X (ids diferentes)" —
o backup é de outra base ou a loja foi recriada. Excluir a loja conflitante antes,
ou confirmar que o ZIP é mesmo desta base.

### Teste de ida-e-volta (staging)

```bash
npx tsx scripts/seed-loja-testes.ts   # recria a loja 7777
npx tsx scripts/testa-restore.ts      # backup → suja dados → restore → confere
```

O teste valida: contagens idênticas, nome restaurado, senha preservada por CIM,
segredo cifrado (`gmailAppPassword`) sobrevive e decifra, ZIP sem segredos.
Rodar após qualquer mudança no schema Prisma ou em `backup.ts`/`restore.ts` —
**campo novo no schema entra no backup automaticamente (dump fiel), mas confira
se é segredo/binário e precisa entrar na lista de omissão de `backup.ts`.**

## Falhas conhecidas e resposta

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| Cron responde 401 | `CRON_SECRET` ausente/errado no host ou no curl | Conferir env e header `x-cron-secret` |
| "Conta Google de backup não conectada" | Refresh token ausente/revogado, ou `GOOGLE_CLIENT_*` faltando | Reconectar em `/admin`; conferir envs |
| `invalid_grant` do Google | Token revogado (troca de senha, app OAuth alterado) | Reconectar a conta em `/admin` |
| `falhas` não vazio no cron | Erro pontual numa loja (dados/timeout) | Rodar "Backup agora"; se persistir, testar `gerarBackupLoja` da loja em staging |
| Restore lento/timeout | Loja grande (binários no banco) | Transação tem timeout 120 s; se estourar, aumentar em `restore.ts` e reexecutar |
| Segredos não decifram após restore/migração de servidor | `AUTH_SECRET`/`SECRETS_ENCRYPTION_KEY` diferente do que cifrou | Restaurar a env original; sem ela os segredos são irrecuperáveis — reconfigurar credenciais nas lojas |
| Pasta "Backups NoPrumo" sumiu do Drive | Apagada pelo usuário | Auto-recriada na próxima rodada (id memorizado é revalidado) |

## Recuperação de desastre (perda total do banco)

1. Provisionar Postgres novo; `npx prisma migrate deploy`.
2. Garantir no host o **mesmo** `AUTH_SECRET`/`SECRETS_ENCRYPTION_KEY` de antes.
3. Criar o SUPER_ADMIN e reconectar o Google Drive de backup em `/admin`.
4. Restaurar cada loja a partir do ZIP mais recente no Drive.
5. Reconfigurar credenciais das lojas (Asaas, Gmail, Google) — não estão no backup;
   se o banco antigo sobreviveu parcialmente, os segredos cifrados preservados
   continuam válidos com a mesma chave.
6. Avisar os membros: quem não teve a senha preservada usa "Esqueci a senha".
