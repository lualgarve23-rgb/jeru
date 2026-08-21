"use client";

import { useEffect } from "react";

// Download automático do PDF para o próximo assinante do fluxo gov.br pelo
// portal: quando chega a vez dele, o arquivo já baixa sozinho. A chave inclui
// o documento e a etapa (nº de assinaturas), para baixar uma única vez por
// etapa mesmo que a página seja recarregada na mesma sessão.
export function AutoDownload({ href, chave }: { href: string; chave: string }) {
  useEffect(() => {
    try {
      const k = `autodl:${chave}`;
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, "1");
    } catch {
      // sessionStorage indisponível — segue com o download mesmo assim
    }
    const a = document.createElement("a");
    a.href = href;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [href, chave]);
  return null;
}
