"use client";

import { useState } from "react";
import { Pencil, Trash2, CircleDollarSign } from "lucide-react";
import { updateLodge, deleteLodge, gerarCobrancaLicenca } from "./actions";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type LodgeData = {
  id: string;
  name: string;
  number: string;
  potencia: string | null;
  oriente: string | null;
  address: string | null;
  licencaValor: number | null;
};

// Botões Editar/Excluir de cada linha da tabela de lojas do /admin
export function LodgeActions({ lodge }: { lodge: LodgeData }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [licencaOpen, setLicencaOpen] = useState(false);

  return (
    <div className="flex justify-end gap-1">
      <Dialog open={licencaOpen} onOpenChange={setLicencaOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" title="Cobrar licença">
            <CircleDollarSign className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cobrança de licença</DialogTitle>
            <DialogDescription>
              Gera uma nova cobrança boleto/Pix (Asaas da plataforma) em nome
              do VM de {lodge.name} nº {lodge.number}, com vencimento em 7
              dias. Substitui a cobrança pendente anterior, se houver.
            </DialogDescription>
          </DialogHeader>
          <ActionForm action={gerarCobrancaLicenca} submitLabel="Gerar cobrança">
            <input type="hidden" name="lodgeId" value={lodge.id} />
            <div className="space-y-1">
              <Label htmlFor={`licvalor-${lodge.id}`}>Valor (R$)</Label>
              <Input
                id={`licvalor-${lodge.id}`}
                name="licencaValor"
                type="number"
                step="0.01"
                min="0"
                defaultValue={lodge.licencaValor ?? ""}
                required
              />
            </div>
          </ActionForm>
        </DialogContent>
      </Dialog>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" title="Editar loja">
            <Pencil className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar loja</DialogTitle>
            <DialogDescription>
              Altere os dados cadastrais. O logo só é substituído se você
              enviar um novo arquivo.
            </DialogDescription>
          </DialogHeader>
          <ActionForm action={updateLodge} submitLabel="Salvar alterações">
            <input type="hidden" name="lodgeId" value={lodge.id} />
            <div className="space-y-1">
              <Label htmlFor={`name-${lodge.id}`}>Nome da loja</Label>
              <Input
                id={`name-${lodge.id}`}
                name="name"
                defaultValue={lodge.name}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor={`number-${lodge.id}`}>Número</Label>
                <Input
                  id={`number-${lodge.id}`}
                  name="number"
                  defaultValue={lodge.number}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`potencia-${lodge.id}`}>Potência</Label>
                <Input
                  id={`potencia-${lodge.id}`}
                  name="potencia"
                  defaultValue={lodge.potencia ?? ""}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`oriente-${lodge.id}`}>Oriente (cidade/UF)</Label>
              <Input
                id={`oriente-${lodge.id}`}
                name="oriente"
                defaultValue={lodge.oriente ?? ""}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`address-${lodge.id}`}>Endereço da sede</Label>
              <Input
                id={`address-${lodge.id}`}
                name="address"
                defaultValue={lodge.address ?? ""}
                placeholder="Av. ..., nº — bairro — cidade — UF"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`logo-${lodge.id}`}>Novo logo (opcional, até 500 KB)</Label>
              <Input
                id={`logo-${lodge.id}`}
                name="logo"
                type="file"
                accept="image/*"
              />
            </div>
          </ActionForm>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            title="Excluir loja"
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir loja</DialogTitle>
            <DialogDescription>
              Isso apaga permanentemente a loja{" "}
              <strong>
                {lodge.name} nº {lodge.number}
              </strong>{" "}
              e TODOS os seus dados: membros, sessões, atas, pranchas,
              cobranças, despesas e lançamentos. Não há como desfazer.
            </DialogDescription>
          </DialogHeader>
          <ActionForm action={deleteLodge} submitLabel="Excluir definitivamente">
            <input type="hidden" name="lodgeId" value={lodge.id} />
            <div className="space-y-1">
              <Label htmlFor={`confirm-${lodge.id}`}>
                Digite o número da loja ({lodge.number}) para confirmar
              </Label>
              <Input
                id={`confirm-${lodge.id}`}
                name="confirmNumber"
                autoComplete="off"
                required
              />
            </div>
          </ActionForm>
        </DialogContent>
      </Dialog>
    </div>
  );
}
