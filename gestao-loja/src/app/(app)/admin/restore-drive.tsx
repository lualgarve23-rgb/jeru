"use client";

import { useState, useTransition } from "react";
import { listarBackupsDoDrive, restaurarBackupDoDrive } from "./actions";
import type { BackupNoDrive } from "@/lib/backup-plataforma";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function tamanhoLegivel(bytes: number | null) {
  if (!bytes) return "";
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? ` · ${mb.toFixed(1)} MB` : ` · ${Math.round(bytes / 1024)} KB`;
}

// Restauração a partir do Google Drive do super admin: carrega a lista de
// ZIPs da pasta "Backups NoPrumo" sob demanda e restaura o escolhido.
export function RestoreFromDrive() {
  const [backups, setBackups] = useState<BackupNoDrive[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, startTransition] = useTransition();

  const carregar = () =>
    startTransition(async () => {
      setErro(null);
      const r = await listarBackupsDoDrive();
      if ("error" in r) setErro(r.error);
      else setBackups(r.backups);
    });

  if (backups === null) {
    return (
      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          onClick={carregar}
          disabled={carregando}
        >
          {carregando ? "Buscando no Drive..." : "Escolher backup do Google Drive"}
        </Button>
        {erro && <p className="text-sm text-red-600">{erro}</p>}
      </div>
    );
  }

  return (
    <ActionForm action={restaurarBackupDoDrive} submitLabel="Restaurar do Drive">
      <div className="space-y-1">
        <Label htmlFor="driveFileId">Backup no Google Drive</Label>
        {backups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum backup encontrado no Drive conectado — rode &quot;Backup
            agora&quot; ou aguarde o cron diário.
          </p>
        ) : (
          <select
            id="driveFileId"
            name="driveFileId"
            required
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {backups.map((b) => (
              <option key={b.id} value={b.id}>
                {b.pasta ? `${b.pasta} / ` : ""}
                {b.nome}
                {tamanhoLegivel(b.tamanho)}
              </option>
            ))}
          </select>
        )}
        <div className="text-right">
          <button
            type="button"
            onClick={carregar}
            disabled={carregando}
            className="text-xs text-primary underline"
          >
            {carregando ? "Atualizando..." : "Atualizar lista"}
          </button>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="confirmNumberDrive">Confirme o número da loja</Label>
        <Input
          id="confirmNumberDrive"
          name="confirmNumber"
          placeholder="ex.: 1234"
          required
        />
      </div>
    </ActionForm>
  );
}
