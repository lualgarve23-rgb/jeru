#!/usr/bin/env bash
# Porte staging (jeruteste) → produção (jeru): Rifa de Benemerência + tours.
# Rodar no terminal do servidor como ubuntu:  bash ~/jeruteste/gestao-loja/deploy/porta-rifa-producao.sh
set -euo pipefail

ORIGEM=/home/ubuntu/jeruteste
DESTINO=/home/ubuntu/jeru
STAMP=$(date +%Y%m%d-%H%M)

echo "== 1/7 Dump da base de produção (gestao_loja) antes do deploy"
docker exec gestao-loja-pg pg_dump -U postgres gestao_loja > "$DESTINO/backup-pre-deploy-$STAMP.sql"
ls -la "$DESTINO/backup-pre-deploy-$STAMP.sql"

echo "== 2/7 Copiando gestao-loja (preserva .env, node_modules e .next da produção)"
cd "$ORIGEM/gestao-loja"
tar --exclude=node_modules --exclude=.next --exclude=.env --exclude=tsconfig.tsbuildinfo -cf - . \
  | tar -xf - -C "$DESTINO/gestao-loja"

echo "== 3/7 Roteiros de vídeo e prints"
cp "$ORIGEM/roteiros-videos-menus.md" "$DESTINO/"
mkdir -p "$DESTINO/roteiros-prints"
cp "$ORIGEM"/roteiros-prints/*.png "$DESTINO/roteiros-prints/"

echo "== 4/7 Migrações (esperadas 3: rifa_benemerencia, rifa_fotos, rifa_sorteio_sistema)"
cd "$DESTINO/gestao-loja"
npx prisma migrate status || true
npx prisma migrate deploy
npx prisma generate

echo "== 5/7 Build e restart do serviço de produção"
NODE_OPTIONS=--max-old-space-size=6144 npm run build
sudo systemctl restart gestao-loja
sleep 8
systemctl is-active gestao-loja
curl -s -o /dev/null -w "login HTTP %{http_code}\n" http://localhost:3100/login
curl -s -o /dev/null -w "tour HTTP %{http_code}\n" http://localhost:3100/tour/img/esmoler-08.jpg
sudo journalctl -u gestao-loja --since "2 min ago" --no-pager | grep -i "error" | tail -5 || true

echo "== 6/7 Commit no repo jeru"
cd "$DESTINO"
git add -A gestao-loja roteiros-videos-menus.md roteiros-prints
git commit -q -m "Rifa de Benemerência (portado do jeruteste cabc9ac, 06b8f82, 91f11c9, 1b35f34): campanha do VM/Esmoler com fotos do prêmio, grade de números para todos os irmãos com Pix, vendas presenciais e baixas, sorteio pelo sistema com semente registrada ou sorteio externo; migrações 20260907100000/110000/120000; tours do Obreiro, Esmoler, Venerável e Secretário (Visitantes) com vídeos regravados; roteiros 1.16, 4.7 e 6.3

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MRMa3ucuLbj3bTpyvhmgwt" || echo "(nada a commitar)"
git log --oneline -1

echo "== 7/7 Push"
git push origin main
echo "Porte concluído. Confira em https://noprumo.ia.br (login) e https://noprumo.ia.br/tour"
