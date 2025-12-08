import { useState, useEffect } from "react";
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
import { Header } from "@/components/layout/Header";
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
  getPatient,
  updatePatient,
  type DecryptedPatient,
} from "@/lib/supabase-patients";
import { formatDate } from "@/lib/date-utils";
import { useToast } from "@/hooks/use-toast";
import { PatientForm } from "@/components/patients/PatientForm";
import { PatientActivitiesTab } from "@/components/patients/PatientActivitiesTab";
import { PatientDocumentsTab } from "@/components/patients/PatientDocumentsTab";
import { PatientConversationInvitationsTab } from "@/components/patients/PatientConversationInvitationsTab";
import { CaseSummaryBlock } from "@/components/patients/CaseSummaryBlock";

const PatientDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const [patient, setPatient] = useState<DecryptedPatient | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("info");

  const shouldEdit = searchParams.get("edit") === "true";
  const initialTab = searchParams.get("tab");

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

    loadPatient();
  }, [id]);

  const loadPatient = async () => {
    if (!id) return;

    try {
      setIsLoading(true);
      const { data, error } = await getPatient(id);

      if (error) {
        toast({
          title: "Ошибка",
          description: `Не удалось загрузить данные пациента: ${error.message}`,
          variant: "destructive",
        });
        navigate("/patients");
        return;
      }

      if (!data) {
        toast({
          title: "Пациент не найден",
          description: "Пациент с указанным ID не существует",
          variant: "destructive",
        });
        navigate("/patients");
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
      navigate("/patients");
    } finally {
      setIsLoading(false);
    }
  };

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
        setPatient(data);
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
        <Header title="Пациент" icon={<User className="w-5 h-5" />} />
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
      <Header title="Пациент" icon={<User className="w-5 h-5" />} />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar with back button and patient info */}
        <div className="px-6 py-4 border-b border-border bg-background">
          <div className="flex items-center justify-between mb-3">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={() => navigate("/patients")}
            >
              <ArrowLeft className="w-4 h-4" />
              Назад к списку
            </Button>
            {!isEditing && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setIsEditing(true)}
              >
                <Edit className="w-4 h-4" />
                Редактировать
              </Button>
            )}
          </div>

          {/* Patient header info */}
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
              <ShrimpIcon className="w-8 h-8" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold truncate">
                {patient.name || "Без имени"}
              </h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
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
          <div className="flex-1 overflow-auto p-6">
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
            <div className="px-6 pt-4 border-b border-border">
              <TabsList>
                <TabsTrigger value="info">Информация</TabsTrigger>
                <TabsTrigger value="activities">Активности</TabsTrigger>
                <TabsTrigger value="documents">Документы</TabsTrigger>
                <TabsTrigger value="invitations">Приглашения</TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-auto p-6">
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
            </div>
          </Tabs>
        )}
      </div>
    </>
  );
};

export default PatientDetailPage;
