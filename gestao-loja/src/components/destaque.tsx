"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

// Deep link por item: com `?destaque=<id>` na URL (links das notificações),
// rola até o elemento com esse id e o realça por alguns segundos.
export function Destaque() {
  const sp = useSearchParams();
  const alvo = sp.get("destaque");
  useEffect(() => {
    if (!alvo) return;
    const el = document.getElementById(alvo);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const classes = ["ring-2", "ring-amber-400", "bg-amber-50", "transition-colors", "duration-1000"];
    el.classList.add(...classes);
    const t = setTimeout(() => el.classList.remove("ring-2", "ring-amber-400", "bg-amber-50"), 6000);
    return () => clearTimeout(t);
  }, [alvo]);
  return null;
}
