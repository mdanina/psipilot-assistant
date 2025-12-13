import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Edit,
  Loader2,
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  StickyNote,
  Sparkles,
} from "lucide-react";
import { ShrimpIcon } from "@/components/ShrimpIcon";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  updatePatient,
  type DecryptedPatient,
} from "@/lib/supabase-patients";
import { usePatient } from "@/hooks/usePatients";
import { formatDate } from "@/lib/date-utils";
import { useToast } from "@/hooks/use-toast";
import { PatientForm } from "@/components/patients/PatientForm";
import { PatientActivitiesTab } from "@/components/patients/PatientActivitiesTab";
import { PatientDocumentsTab } from "@/components/patients/PatientDocumentsTab";
import { PatientConversationInvitationsTab } from "@/components/patients/PatientConversationInvitationsTab";
import { PatientSupervisorTab } from "@/components/patients/PatientSupervisorTab";
import { CaseSummaryBlock } from "@/components/patients/CaseSummaryBlock";
import { PatientAssignmentsDialog } from "@/components/patients/PatientAssignmentsDialog";
import { useAuth } from "@/contexts/AuthContext";
import { Users } from "lucide-react";

const PatientDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("info");
  const [assignmentsDialogOpen, setAssignmentsDialogOpen] = useState(false);

  const shouldEdit = searchParams.get("edit") === "true";
  const initialTab = searchParams.get("tab");

  // React Query hook for fetching patient data with automatic caching
  const { 
    data: patient, 
    isLoading, 
    error: patientError,
    refetch: refetchPatient
  } = usePatient(id);

  // Show error if patient query failed
  useEffect(() => {
    if (patientError) {
      toast({
        title: "Ошибка",
        description: `Не удалось загрузить данные пациента: ${patientError.message}`,
        variant: "destructive",
      });
      navigate("/patients");
    } else if (patient === null && !isLoading && id) {
      // Patient not found
      toast({
        title: "Пациент не найден",
        description: "Пациент с указанным ID не существует",
        variant: "destructive",
      });
      navigate("/patients");
    }
  }, [patientError, patient, isLoading, id, navigate, toast]);

  useEffect(() => {
    if (shouldEdit) {
      setIsEditing(true);
    }
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [shouldEdit, initialTab]);

  useEffect(() => {
    if (!id) {
      navigate("/patients");
      return;
    }
  }, [id, navigate]);

  const handleSave = async (formData: any) => {
    if (!id || !patient) return;

    try {
      setIsSaving(true);
      const { data, error } = await updatePatient(id, formData);

      if (error) {
        toast({
          title: "Ошибка",
          description: `Не удалось обновить данные: ${error.message}`,
          variant: "destructive",
        });
        return;
      }

      if (data) {
        // Invalidate patient cache to refetch updated data
        queryClient.invalidateQueries({ queryKey: ['patients', id] });
        queryClient.invalidateQueries({ queryKey: ['patients'] }); // Also invalidate list
        
        setIsEditing(false);
        toast({
          title: "Успешно",
          description: "Данные пациента обновлены",
        });
        navigate(`/patients/${id}`, { replace: true });
      }
    } catch (error) {
      console.error("Error updating patient:", error);
      toast({
        title: "Ошибка",
        description: "Произошла ошибка при обновлении данных",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  if (!patient) {
    return null;
  }

  return (
    <>
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar with back button and patient info */}
        <div className="px-4 md:px-6 py-4 border-b border-border bg-background">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 self-start"
              onClick={() => navigate("/patients")}
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Назад к списку</span>
              <span className="sm:hidden">Назад</span>
            </Button>
            {!isEditing && (
              <div className="flex gap-2 flex-wrap">
                {profile?.role === 'admin' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => setAssignmentsDialogOpen(true)}
                  >
                    <Users className="w-4 h-4" />
                    <span className="hidden sm:inline">Управление назначениями</span>
                    <span className="sm:hidden">Назначения</span>
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setIsEditing(true)}
                >
                  <Edit className="w-4 h-4" />
                  <span className="hidden sm:inline">Редактировать</span>
                </Button>
              </div>
            )}
          </div>

          {/* Patient header info */}
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
              <ShrimpIcon className="w-6 h-6 sm:w-8 sm:h-8" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold truncate">
                {patient.name || "Без имени"}
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-1 text-xs sm:text-sm text-muted-foreground mt-1">
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
                {patient.address && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4" />
                    <span>{patient.address}</span>
                  </div>
                )}
                {patient.date_of_birth && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />
                    <span>{formatDate(patient.date_of_birth)}</span>
                  </div>
                )}
                {patient.gender && (
                  <div className="flex items-center gap-1.5">
                    <User className="w-4 h-4" />
                    <span>{patient.gender}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Content area */}
        {isEditing ? (
          <div className="flex-1 overflow-auto p-4 md:p-6">
            <PatientForm
              patient={patient}
              onSave={handleSave}
              onCancel={() => {
                setIsEditing(false);
                navigate(`/patients/${id}`, { replace: true });
              }}
              isSaving={isSaving}
            />
          </div>
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <div className="px-4 md:px-6 pt-4 border-b border-border overflow-x-auto">
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="info" className="text-xs sm:text-sm">Информация</TabsTrigger>
                <TabsTrigger value="activities" className="text-xs sm:text-sm">Активности</TabsTrigger>
                <TabsTrigger value="documents" className="text-xs sm:text-sm">Документы</TabsTrigger>
                <TabsTrigger value="invitations" className="text-xs sm:text-sm">Приглашения</TabsTrigger>
                <TabsTrigger value="supervisor" className="text-xs sm:text-sm">Супервизор</TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-auto p-4 md:p-6">
              {/* Info Tab */}
              <TabsContent value="info" className="mt-0 space-y-6">
                {/* AI Case Summary */}
                <CaseSummaryBlock patientId={id!} patient={patient} />

                {/* Notes Card */}
                {patient.notes && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <StickyNote className="w-5 h-5" />
                        Заметки
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-wrap">
                        {patient.notes}
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Tags */}
                {patient.tags && patient.tags.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Теги</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {patient.tags.map((tag, index) => (
                          <span
                            key={index}
                            className="px-2 py-1 bg-muted rounded-md text-sm"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Activities Tab */}
              <TabsContent value="activities" className="mt-0">
                <PatientActivitiesTab patientId={id!} />
              </TabsContent>

              {/* Documents Tab */}
              <TabsContent value="documents" className="mt-0">
                <PatientDocumentsTab patientId={id!} />
              </TabsContent>

              {/* Invitations Tab */}
              <TabsContent value="invitations" className="mt-0">
                <PatientConversationInvitationsTab patientId={id!} />
              </TabsContent>

              {/* Supervisor Tab */}
              <TabsContent value="supervisor" className="mt-0">
                <PatientSupervisorTab patientId={id!} patientName={patient.name} />
              </TabsContent>
            </div>
          </Tabs>
        )}
      </div>

      {/* Assignments Dialog */}
      {patient && (
        <PatientAssignmentsDialog
          patientId={patient.id}
          patientName={patient.name}
          open={assignmentsDialogOpen}
          onOpenChange={setAssignmentsDialogOpen}
          onAssignmentsChanged={() => {
            // Optionally reload patient data if needed
          }}
        />
      )}
    </>
  );
};

export default PatientDetailPage;
