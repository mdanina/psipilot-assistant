import { useState } from "react";
import { Plus, User, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { Database } from "@/types/database.types";

type Patient = Database['public']['Tables']['patients']['Row'];

interface CreateSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patients: Patient[];
  onCreateSession: (patientId: string | null, title?: string) => Promise<void>;
}

export function CreateSessionDialog({
  open,
  onOpenChange,
  patients,
  onCreateSession,
}: CreateSessionDialogProps) {
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [linkLater, setLinkLater] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const resetState = () => {
    setSelectedPatientId("");
    setLinkLater(false);
    setCustomTitle("");
    setIsCreating(false);
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const handleCreate = async () => {
    setIsCreating(true);

    try {
      const patientId = linkLater ? null : (selectedPatientId || null);
      const title = customTitle.trim() || undefined;

      await onCreateSession(patientId, title);
      handleClose();
    } catch (error) {
      console.error('Error creating session:', error);
      // Toast will be shown by parent component
    } finally {
      setIsCreating(false);
    }
  };

  const canCreate = linkLater || selectedPatientId;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Создать новую сессию
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Patient selection */}
          <div className="space-y-2">
            <Label htmlFor="patient">Пациент</Label>
            <Select
              value={selectedPatientId}
              onValueChange={setSelectedPatientId}
              disabled={linkLater}
            >
              <SelectTrigger id="patient">
                <SelectValue placeholder="Выберите пациента" />
              </SelectTrigger>
              <SelectContent>
                {patients.map((patient) => (
                  <SelectItem key={patient.id} value={patient.id}>
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      {patient.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Link later checkbox */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="link-later"
              checked={linkLater}
              onCheckedChange={(checked) => {
                setLinkLater(checked === true);
                if (checked) {
                  setSelectedPatientId("");
                }
              }}
            />
            <label
              htmlFor="link-later"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              Привязать к пациенту позже
            </label>
          </div>

          {linkLater && (
            <p className="text-xs text-muted-foreground pl-6">
              Сессия будет создана без привязки к пациенту. Все записи и заметки
              будут сохранены, и вы сможете привязать сессию к пациенту позже.
            </p>
          )}

          {/* Custom title (optional) */}
          <div className="space-y-2">
            <Label htmlFor="title">Название (опционально)</Label>
            <Input
              id="title"
              placeholder={`Сессия ${new Date().toLocaleString('ru-RU')}`}
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Если не указано, будет использовано название по умолчанию с датой и временем
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isCreating}>
            Отмена
          </Button>
          <Button onClick={handleCreate} disabled={!canCreate || isCreating}>
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Создание...
              </>
            ) : (
              "Создать"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
