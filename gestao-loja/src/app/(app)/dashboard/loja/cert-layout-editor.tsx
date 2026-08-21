"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { updateCertLayoutBoxes } from "./actions";

type BoxFrac = { x: number; y: number; w: number; h: number; size: number };
type Boxes = {
  nome: BoxFrac;
  sessao: BoxFrac;
  email?: BoxFrac;
  veneravel?: BoxFrac;
};
type Key = keyof Boxes;

const CAMPOS: { key: Key; label: string; exemplo: string }[] = [
  { key: "nome", label: "Nome do visitante", exemplo: "Irmão Visitante de Exemplo" },
  { key: "sessao", label: "Sessão", exemplo: "Ordinária realizada em 01/01/2026" },
  { key: "veneravel", label: "Venerável Mestre", exemplo: "Nome do Venerável" },
  { key: "email", label: "E-mail (rodapé)", exemplo: "visitante@exemplo.com" },
];

const CORES: Record<Key, string> = {
  nome: "#7c2d12",
  sessao: "#1e3a5f",
  veneravel: "#404040",
  email: "#737373",
};

// Editor visual do Certificado de Visita: arraste as caixas de texto sobre o
// fundo renderizado; as posições salvas valem para todos os certificados.
export function CertLayoutEditor({
  boxes: initial,
  pageW,
}: {
  boxes: Boxes;
  pageW: number; // largura da página do PDF em pontos
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = useState<Boxes>(initial);
  const [sel, setSel] = useState<Key>("nome");
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const drag = useRef<{
    key: Key;
    mode: "move" | "resize";
    startX: number;
    startY: number;
    orig: BoxFrac;
  } | null>(null);

  const imgW = boxRef.current?.clientWidth ?? 560;
  const escala = imgW / pageW; // pt → px na tela

  const onPointerDown =
    (key: Key, mode: "move" | "resize") => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as Element).setPointerCapture(e.pointerId);
      setSel(key);
      drag.current = {
        key,
        mode,
        startX: e.clientX,
        startY: e.clientY,
        orig: boxes[key]!,
      };
    };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = boxRef.current;
    if (!d || !el) return;
    const dx = (e.clientX - d.startX) / el.clientWidth;
    const dy = (e.clientY - d.startY) / el.clientHeight;
    const o = d.orig;
    const b =
      d.mode === "move"
        ? {
            ...o,
            x: Math.min(Math.max(0, o.x + dx), 1 - o.w),
            y: Math.min(Math.max(0, o.y + dy), 1 - o.h),
          }
        : {
            ...o,
            w: Math.min(Math.max(0.05, o.w + dx), 1 - o.x),
            h: Math.min(Math.max(0.01, o.h + dy), 1 - o.y),
          };
    setBoxes((prev) => ({ ...prev, [d.key]: b }));
    setDirty(true);
    setMsg(null);
  };

  const salvar = () =>
    startTransition(async () => {
      const r = await updateCertLayoutBoxes(boxes);
      setMsg(r?.error ?? r?.ok ?? null);
      if (r?.ok) setDirty(false);
    });

  return (
    <div className="space-y-3">
      <div
        ref={boxRef}
        className="relative max-w-md touch-none select-none overflow-hidden rounded-lg border"
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/dashboard/loja/certificado-fundo"
          alt="Fundo do certificado"
          className="block w-full"
          draggable={false}
        />
        {CAMPOS.flatMap(({ key, exemplo }) => {
          const b = boxes[key];
          if (!b) return [];
          return [
            <div
              key={key}
              role="button"
              aria-label={`Caixa ${key} — arraste para posicionar`}
              onPointerDown={onPointerDown(key, "move")}
              className={`absolute flex cursor-move items-center justify-center overflow-hidden rounded border ${
                sel === key
                  ? "border-amber-500 bg-amber-100/40"
                  : "border-dashed border-zinc-400/70 bg-white/20"
              }`}
              style={{
                left: `${b.x * 100}%`,
                top: `${b.y * 100}%`,
                width: `${b.w * 100}%`,
                height: `${b.h * 100}%`,
              }}
            >
              <span
                className="truncate px-1 font-serif font-bold"
                style={{ fontSize: Math.max(6, b.size * escala), color: CORES[key] }}
              >
                {exemplo}
              </span>
              <div
                onPointerDown={onPointerDown(key, "resize")}
                aria-label="Redimensionar caixa"
                className="absolute -bottom-1 -right-1 h-3.5 w-3.5 cursor-nwse-resize rounded-sm border border-amber-700 bg-amber-500"
              />
            </div>,
          ];
        })}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="cert-fonte">
            Fonte de “{CAMPOS.find((c) => c.key === sel)?.label}” (pt)
          </Label>
          <Input
            id="cert-fonte"
            type="number"
            min={4}
            max={96}
            className="w-24"
            value={boxes[sel]?.size ?? 12}
            onChange={(e) => {
              const size = Number(e.target.value);
              if (!Number.isFinite(size)) return;
              setBoxes((prev) => ({
                ...prev,
                [sel]: { ...prev[sel]!, size },
              }));
              setDirty(true);
            }}
          />
        </div>
        <Button size="sm" onClick={salvar} disabled={pending || !dirty}>
          {pending ? "Salvando…" : "Salvar posições"}
        </Button>
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      </div>
      <p className="text-xs text-muted-foreground">
        Arraste cada caixa para onde o texto deve sair no certificado; o
        quadradinho redimensiona (o texto é centralizado dentro da caixa e
        encolhe sozinho se não couber). Clique numa caixa para ajustar o
        tamanho da fonte. Depois de salvar, confira no preview.
      </p>
    </div>
  );
}
