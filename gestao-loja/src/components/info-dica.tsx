"use client";

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

// Ícone (i) com popover de ajuda em linguagem simples — funciona por clique
// (touch-friendly) e fecha com Esc ou clique fora. Acessível (aria-expanded).
export function InfoDica({ titulo, texto }: { titulo?: string; texto: string }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function fechar(e: MouseEvent | KeyboardEvent) {
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") setAberto(false);
        return;
      }
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener("mousedown", fechar);
    document.addEventListener("keydown", fechar);
    return () => {
      document.removeEventListener("mousedown", fechar);
      document.removeEventListener("keydown", fechar);
    };
  }, [aberto]);

  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={titulo ? `O que é ${titulo}?` : "O que é esta tela?"}
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Info className="h-4 w-4" aria-hidden />
      </button>
      {aberto && (
        <span
          role="tooltip"
          className="absolute left-0 top-9 z-50 w-72 max-w-[80vw] rounded-md border bg-popover p-3 text-left text-sm font-normal normal-case leading-relaxed text-popover-foreground shadow-md"
        >
          {titulo && <strong className="mb-1 block">{titulo}</strong>}
          {texto}
        </span>
      )}
    </span>
  );
}
