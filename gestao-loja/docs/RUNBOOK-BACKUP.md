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
`arquivos/` (binários do banco), `media/` (fotos/assinaturas) e `LEIA-ME.txt`.
**Nunca contém segredos**: hashes de senha, códigos de recuperação e seus prazos,
contadores de bloqueio de login (`failedLoginAttempts`/`lockedUntil`), `cardToken`
da carteirinha (regenerado no restore), chaves Asaas, tokens de webhook, refresh
tokens Google, senha de app do Gmail e QR/invite tokens de sessões ficam de fora.

### Cobertura (desde 2026-09-05)

**Regra:** todo modelo do schema com `lodgeId` entra no backup, é lido pelo
restore e é apagado por `deleteLodgeData` (`src/lib/lodge-delete.ts`). Única
exceção deliberada: a fila `Job` (transitória — só é apagada com a loja). Os
filhos sem `lodgeId` (familiares, registros do Meta, anexos de candidato,
assinantes de processo, mensagens do assistente) vão e voltam junto com o pai.

Cobertura garantida por testes estáticos que leem o `schema.prisma`
(`npx vitest run`): `src/lib/__tests__/backup-cobertura.test.ts` e
`src/lib/__tests__/lodge-delete-cobertura.test.ts`. **Modelo novo com `lodgeId`
ou campo `Bytes` novo quebra o teste até ser incluído nos três arquivos.**

Além do que já existia (membros, sessões, presenças, atas, pranchas, finanças,
admissões, progressão, biblioteca, Quitte Placet), o ZIP agora carrega:
processos da caixa de assinaturas (`processos-documentos.json` +
`processos-assinantes.json`), atestados de regularidade, pedidos de afastamento
(Form. 116), entregas da Mútua, notificações, auditoria (`auditoria.json`) e
conversas/mensagens do assistente.

**Campos `Bytes` nunca vão no JSON** (serializados estouravam o ZIP e faziam o
restore abortar). Ficam em `arquivos/<pasta>/<id>__<campo>.<ext>`:

| Modelo | Pasta | Campos |
|--------|-------|--------|
| ProcessoDocumento | `arquivos/processos/` | `arquivo` (obrigatório), `govbrPdf` |
| QuittePlacet | `arquivos/quitte-placets/` | `cartaArquivo`, `ataArquivo`, `govbrPdf`, `formularioArquivo` |
| AtestadoRegularidade | `arquivos/atestados/` | `govbrPdf` |
| PedidoAfastamento | `arquivos/afastamentos/` | `requerimentoPdf`, `formularioPdf`, `govbrPdf` |
| MutuaEntrega | `arquivos/mutua/` | `arquivo` |
| Ata / Prancha / BibliotecaItem / CandidatoAnexo / Lodge | nomes legados (`atas/`, `pranchas/`, `biblioteca/`, `candidatos/`, `certificado-visita-fundo.pdf`) | — |

ZIPs antigos continuam restauráveis: JSON ausente = modelo pulado; binário
opcional ausente = `null`; binário obrigatório ausente = registro não restaurado
(aviso na tela). Os Bytes que o `quitte-placets.json` antigo trazia serializados
são descartados no restore (viram `null`).

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
- **Regenerados:** `cardToken` de todos os membros (o link antigo da carteirinha
  `/verificar/<token>` deixa de valer — o irmão reabre a carteirinha no app).
  Contadores de bloqueio de login zeram.
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

O teste valida: contagens idênticas (inclusive processos, assinantes, atestados,
afastamentos, Mútua, notificações, auditoria e assistente), nome restaurado,
senha preservada por CIM, `cardToken` regenerado, segredo cifrado
(`gmailAppPassword`) sobrevive e decifra, ZIP sem segredos/cardToken, nenhum
JSON com Bytes serializados, e um processo (com assinante) e uma entrega da
Mútua criados com PDF voltam byte a byte.
Rodar após qualquer mudança no schema Prisma ou em `backup.ts`/`restore.ts` —
**campo novo no schema entra no backup automaticamente (dump fiel), mas confira
se é segredo/binário e precisa entrar na lista de omissão ou em
`separarBinarios` de `backup.ts`** (os testes estáticos cobram os `Bytes`).

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
