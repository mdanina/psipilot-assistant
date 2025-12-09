import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database.types";

type Profile = Database['public']['Tables']['profiles']['Row'];

interface SelectDoctorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinicId: string;
  currentDoctorId?: string;
  onSelect: (doctorId: string) => Promise<void>;
}

export function SelectDoctorDialog({
  open,
  onOpenChange,
  clinicId,
  currentDoctorId,
  onSelect,
}: SelectDoctorDialogProps) {
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(currentDoctorId || "");
  const [availableDoctors, setAvailableDoctors] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open && clinicId) {
      loadDoctors();
      if (currentDoctorId) {
        setSelectedDoctorId(currentDoctorId);
      }
    }
  }, [open, clinicId, currentDoctorId]);

  const loadDoctors = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('clinic_id', clinicId)
        .in('role', ['specialist', 'admin'])
        .order('full_name', { ascending: true });
      
      if (!error && data) {
        setAvailableDoctors(data);
      }
    } catch (error) {
      console.error('Error loading doctors:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedDoctorId) {
      return;
    }

    setIsSaving(true);
    try {
      await onSelect(selectedDoctorId);
      onOpenChange(false);
    } catch (error) {
      console.error('Error reassigning doctor:', error);
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Переназначить врача</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Врач</Label>
              <Select value={selectedDoctorId} onValueChange={setSelectedDoctorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите врача" />
                </SelectTrigger>
                <SelectContent>
                  {availableDoctors.map((doctor) => (
                    <SelectItem key={doctor.id} value={doctor.id}>
                      {doctor.full_name || doctor.email}
                      {doctor.specialization && ` - ${doctor.specialization}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Отмена
          </Button>
          <Button
            onClick={handleSave}
            disabled={!selectedDoctorId || isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Сохранение...
              </>
            ) : (
              "Сохранить"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

