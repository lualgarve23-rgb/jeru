"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

// Envio direto ao WhatsApp: no celular usa o compartilhamento nativo com a
// IMAGEM do convite anexada (vai como foto, com o texto e o link na legenda —
// não depende do preview de link do WhatsApp); sem suporte a compartilhar
// arquivos, abre o wa.me com a mensagem pronta para escolher o contato.
export function WhatsAppShareButton({
  imageUrl,
  text,
}: {
  imageUrl: string | null;
  text: string;
}) {
  const [busy, setBusy] = useState(false);

  const compartilhar = async () => {
    setBusy(true);
    try {
      if (imageUrl && typeof navigator.share === "function") {
        const resp = await fetch(imageUrl);
        if (resp.ok) {
          const blob = await resp.blob();
          const file = new File([blob], "convite.jpg", { type: "image/jpeg" });
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], text });
            return;
          }
        }
      }
      window.open(
        `https://wa.me/?text=${encodeURIComponent(text)}`,
        "_blank",
        "noopener"
      );
    } catch (e) {
      // Compartilhamento cancelado pelo usuário: não abre o fallback
      if (e instanceof Error && e.name === "AbortError") return;
      window.open(
        `https://wa.me/?text=${encodeURIComponent(text)}`,
        "_blank",
        "noopener"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      size="sm"
      onClick={compartilhar}
      disabled={busy}
      className="bg-[#25d366] text-white hover:bg-[#1faa52]"
    >
      {busy ? "Preparando…" : "Enviar no WhatsApp"}
    </Button>
  );
}
