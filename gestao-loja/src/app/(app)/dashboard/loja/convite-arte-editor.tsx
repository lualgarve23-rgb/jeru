"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  updateConviteArteLayout,
  resetConviteArteLayout,
} from "./actions";

type Layout = { x: number; y: number; w: number };

// Medidas de referência do painel desenhado em lib/convite-arte.ts — o mock
// do editor reproduz as proporções (largura 985.6, altura com 2 linhas de
// pauta = 304) para o que se vê aqui bater com a imagem final
const REF_W = 985.6;
const REF_H = 304;
const DEFAULT_W = 0.88;

// Editor visual: arraste o painel de dados sobre a arte do convite e salve a
// posição — usada no e-mail, na página pública e no preview do WhatsApp
export function ConviteArteEditor({
  arte,
  layout,
}: {
  arte: string;
  layout: Layout | null;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Layout>(
    layout ?? { x: (1 - DEFAULT_W) / 2, y: 0.5, w: DEFAULT_W }
  );
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const drag = useRef<{
    mode: "move" | "resize";
    startX: number;
    startY: number;
    orig: Layout;
  } | null>(null);

  // Altura do painel como fração da altura da arte, derivada da largura atual
  const boxW = boxRef.current?.clientWidth ?? 560;
  const boxH = boxRef.current?.clientHeight ?? 560;
  const panelPx = pos.w * boxW;
  const f = panelPx / REF_W;
  const panelHPx = REF_H * f;

  const clamp = (l: Layout): Layout => {
    const w = Math.min(1, Math.max(0.25, l.w));
    const hFrac = (REF_H * ((w * boxW) / REF_W)) / Math.max(1, boxH);
    return {
      w,
      x: Math.min(Math.max(0, l.x), 1 - w),
      y: Math.min(Math.max(0, l.y), Math.max(0, 1 - hFrac)),
    };
  };

  const onPointerDown =
    (mode: "move" | "resize") => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as Element).setPointerCapture(e.pointerId);
      drag.current = { mode, startX: e.clientX, startY: e.clientY, orig: pos };
    };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !boxRef.current) return;
    const dx = (e.clientX - d.startX) / boxW;
    const dy = (e.clientY - d.startY) / boxH;
    setPos(
      clamp(
        d.mode === "move"
          ? { ...d.orig, x: d.orig.x + dx, y: d.orig.y + dy }
          : { ...d.orig, w: d.orig.w + dx }
      )
    );
    setDirty(true);
    setMsg(null);
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  const salvar = () =>
    startTransition(async () => {
      const r = await updateConviteArteLayout(pos);
      setMsg(r?.error ?? r?.ok ?? null);
      if (r?.ok) setDirty(false);
    });

  const centralizar = () =>
    startTransition(async () => {
      const r = await resetConviteArteLayout();
      setMsg(r?.error ?? r?.ok ?? null);
      setPos({ x: (1 - DEFAULT_W) / 2, y: 0.5, w: DEFAULT_W });
      setDirty(false);
    });

  return (
    <div className="space-y-3">
      <div
        ref={boxRef}
        className="relative max-w-md touch-none select-none overflow-hidden rounded-lg border"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={arte} alt="Arte do convite" className="block w-full" draggable={false} />
        <div
          role="button"
          aria-label="Painel de dados da sessão — arraste para posicionar"
          onPointerDown={onPointerDown("move")}
          className="absolute cursor-move rounded-xl border-2 border-[#c9a84c] bg-[#fffdf7]/85 shadow-sm"
          style={{
            left: `${pos.x * 100}%`,
            top: `${pos.y * 100}%`,
            width: `${pos.w * 100}%`,
            height: panelHPx,
          }}
        >
          <div
            className="flex h-full flex-col items-center justify-center text-center font-serif"
            style={{ gap: 8 * f }}
          >
            <p
              className="uppercase text-[#8a6d1f]"
              style={{ fontSize: 30 * f, letterSpacing: 3 * f }}
            >
              Ordinária · Grau Aprendiz
            </p>
            <p className="font-bold text-[#1e3a5f]" style={{ fontSize: 38 * f }}>
              quinta-feira, 01 de janeiro de 2026, às 20:00
            </p>
            <p className="text-zinc-600" style={{ fontSize: 29 * f }}>
              Pauta da sessão (exemplo)
            </p>
          </div>
          <div
            onPointerDown={onPointerDown("resize")}
            aria-label="Redimensionar painel"
            className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize rounded-sm border border-[#8a6d1f] bg-[#c9a84c]"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={salvar} disabled={pending || !dirty}>
          {pending ? "Salvando…" : "Salvar posição"}
        </Button>
        <Button size="sm" variant="outline" onClick={centralizar} disabled={pending}>
          Centralizar (padrão)
        </Button>
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      </div>
      <p className="text-xs text-muted-foreground">
        Arraste o painel para onde os dados da sessão devem aparecer na arte;
        o quadradinho dourado redimensiona. Os textos acima são um exemplo —
        cada convite sai com o tipo, a data e a pauta reais da sessão.
      </p>
    </div>
  );
}
