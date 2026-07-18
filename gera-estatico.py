#!/usr/bin/env python3
"""Gera um snapshot estático navegável da loja demo (jeru.olgado.org)."""
import os, re, sys, shutil
import requests

BASE = "https://jeru.olgado.org"
OUT = "/home/ubuntu/jeru/demo-estatico"

ROTAS = [
    "/dashboard", "/dashboard/instrucoes", "/dashboard/loja",
    "/dashboard/notificacoes", "/dashboard/perfil", "/dashboard/privacidade",
    "/dashboard/senha",
    "/secretaria/admissoes", "/secretaria/atas", "/secretaria/cargos",
    "/secretaria/documentos", "/secretaria/emails", "/secretaria/membros",
    "/secretaria/membros/novo", "/secretaria/pranchas",
    "/secretaria/progressoes", "/secretaria/quitte-placets",
    "/secretaria/sessoes",
    "/tesouraria/balancete", "/tesouraria/despesas",
    "/tesouraria/mensalidades",
]

def login(cim: str):
    s = requests.Session()
    csrf = s.get(f"{BASE}/api/auth/csrf", timeout=30).json()["csrfToken"]
    r = s.post(f"{BASE}/api/auth/callback/credentials", data={
        "csrfToken": csrf, "cim": cim, "password": "demo123",
        "redirectTo": "/dashboard"}, timeout=30, allow_redirects=False)
    assert r.status_code == 302 and "error" not in r.headers.get("location", ""), \
        f"login {cim} falhou: {r.headers.get('location')}"
    return s

def rota_para_arquivo(rota: str) -> str:
    return rota.strip("/").replace("/", "-") + ".html"

def main():
    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(f"{OUT}/assets", exist_ok=True)
    s = login("demo-vm")

    paginas = {}  # rota -> html
    for rota in ROTAS:
        r = s.get(f"{BASE}{rota}", timeout=60)
        if r.status_code != 200:
            print(f"  ! {rota} -> {r.status_code} (pulada)"); continue
        paginas[rota] = r.text
        print(f"  ok {rota}")

    # Páginas de detalhe: primeiro link de cada listagem
    detalhes = {
        "/secretaria/atas": r"/secretaria/atas/([a-z0-9]{20,})",
        "/secretaria/sessoes": r"/secretaria/sessoes/([a-z0-9]{20,})",
        "/secretaria/membros": r"/secretaria/membros/([a-z0-9]{20,})",
        "/tesouraria/mensalidades": r"/tesouraria/mensalidades/([a-z0-9]{20,})",
    }
    for lista, padrao in detalhes.items():
        if lista not in paginas: continue
        m = re.search(padrao, paginas[lista])
        if not m: continue
        rota = m.group(0)
        r = s.get(f"{BASE}{rota}", timeout=60)
        if r.status_code == 200:
            paginas[rota] = r.text
            print(f"  ok {rota} (detalhe)")

    mapa = {rota: rota_para_arquivo(rota) for rota in paginas}

    # CSS e imagens do Next → assets locais
    assets = {}
    def baixa_asset(url_path: str) -> str:
        if url_path in assets: return assets[url_path]
        nome = os.path.basename(url_path.split("?")[0])
        r = s.get(f"{BASE}{url_path}", timeout=60)
        if r.status_code != 200: return url_path
        with open(f"{OUT}/assets/{nome}", "wb") as f:
            f.write(r.content)
        assets[url_path] = f"assets/{nome}"
        return assets[url_path]

    aviso = ('<div style="position:fixed;bottom:0;left:0;right:0;z-index:9999;'
             'background:#1c3a5e;color:#fff;text-align:center;font-size:12px;'
             'padding:4px 8px;font-family:sans-serif;">Cópia estática de '
             'demonstração — Loja fictícia nº 9999. Botões e formulários não '
             'executam ações; a navegação pelo menu funciona.</div>')

    for rota, html in paginas.items():
        # remove scripts (sem hidratação: fica só o HTML renderizado)
        html = re.sub(r"<script\b[^>]*>.*?</script>", "", html, flags=re.S)
        # CSS do Next
        for css in set(re.findall(r'href="(/_next/[^"]+\.css[^"]*)"', html)):
            html = html.replace(css, baixa_asset(css))
        # links internos conhecidos → arquivo local; demais → âncora inerte
        def troca(m):
            alvo = m.group(1)
            base_alvo = alvo.split("?")[0].split("#")[0]
            if base_alvo in mapa: return f'href="{mapa[base_alvo]}"'
            if base_alvo.startswith("/"): return 'href="#"'
            return m.group(0)
        html = re.sub(r'href="([^"]+)"', troca, html)
        html = html.replace("</body>", aviso + "</body>")
        with open(f"{OUT}/{mapa[rota]}", "w", encoding="utf-8") as f:
            f.write(html)

    # index aponta para o dashboard
    with open(f"{OUT}/index.html", "w", encoding="utf-8") as f:
        f.write('<meta http-equiv="refresh" content="0; url=dashboard.html">')

    print(f"\n{len(paginas)} páginas salvas em {OUT}")

if __name__ == "__main__":
    sys.exit(main())
