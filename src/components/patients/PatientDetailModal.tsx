import { useState, useEffect } from "react";
import { Pencil, Mail, Phone, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getPatient, type DecryptedPatient } from "@/lib/supabase-patients";
import { useToast } from "@/hooks/use-toast";
import { PatientActivitiesTab } from "./PatientActivitiesTab";
import { PatientDocumentsTab } from "./PatientDocumentsTab";
import { PatientConversationInvitationsTab } from "./PatientConversationInvitationsTab";

interface PatientDetailModalProps {
  patientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (patientId: string) => void;
}

export function PatientDetailModal({
  patientId,
  open,
  onOpenChange,
  onEdit,
}: PatientDetailModalProps) {
  const { toast } = useToast();
  const [patient, setPatient] = useState<DecryptedPatient | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (open && patientId) {
      loadPatient();
    } else {
      setPatient(null);
    }
  }, [open, patientId]);

  const loadPatient = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await getPatient(patientId);

      if (error) {
        toast({
          title: "Ошибка",
          description: `Не удалось загрузить данные пациента: ${error.message}`,
          variant: "destructive",
        });
        onOpenChange(false);
        return;
      }

      if (!data) {
        toast({
          title: "Пациент не найден",
          description: "Пациент с указанным ID не существует",
          variant: "destructive",
        });
        onOpenChange(false);
        return;
      }

      setPatient(data);
    } catch (error) {
      console.error("Error loading patient:", error);
      toast({
        title: "Ошибка",
        description: "Произошла ошибка при загрузке данных пациента",
        variant: "destructive",
      });
      onOpenChange(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] w-full max-h-[90vh] overflow-hidden flex flex-col p-0">
        {isLoading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : patient ? (
          <>
            {/* Header with patient info */}
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <DialogTitle className="text-2xl font-bold mb-2">
                    {patient.name || "—"}
                  </DialogTitle>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    {patient.email && (
                      <div className="flex items-center gap-1.5">
                        <Mail className="w-4 h-4" />
                        <a
                          href={`mailto:${patient.email}`}
                          className="hover:text-foreground hover:underline"
                        >
                          {patient.email}
                        </a>
                      </div>
                    )}
                    {patient.phone && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-4 h-4" />
                        <span>{patient.phone}</span>
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => onEdit(patientId)}
                >
                  <Pencil className="w-4 h-4" />
                  Редактировать
                </Button>
              </div>
            </DialogHeader>

            {/* Tabs */}
            <div className="flex-1 overflow-hidden flex flex-col">
              <Tabs defaultValue="activities" className="flex-1 flex flex-col overflow-hidden">
                <div className="px-6 pt-4 border-b border-border">
                  <TabsList>
                    <TabsTrigger value="activities">Активности</TabsTrigger>
                    <TabsTrigger value="documents">Документы</TabsTrigger>
                    <TabsTrigger value="invitations">
                      Приглашения в диалоги
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="flex-1 overflow-auto px-6 py-4">
                  <TabsContent value="activities" className="mt-0">
                    <PatientActivitiesTab patientId={patientId} />
                  </TabsContent>
                  <TabsContent value="documents" className="mt-0">
                    <PatientDocumentsTab patientId={patientId} />
                  </TabsContent>
                  <TabsContent value="invitations" className="mt-0">
                    <PatientConversationInvitationsTab patientId={patientId} />
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </>
        ) : (
          <div className="p-12 text-center text-muted-foreground">
            Пациент не найден
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}






