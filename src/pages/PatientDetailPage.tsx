import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Edit, Save, X, Loader2, User, Mail, Phone, MapPin, Calendar, FileText, StickyNote } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPatient, updatePatient, type DecryptedPatient } from "@/lib/supabase-patients";
import { formatDate, formatDateTime } from "@/lib/date-utils";
import { useToast } from "@/hooks/use-toast";
import { PatientForm } from "@/components/patients/PatientForm";

const PatientDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  
  const [patient, setPatient] = useState<DecryptedPatient | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const shouldEdit = searchParams.get('edit') === 'true';

  useEffect(() => {
    if (shouldEdit) {
      setIsEditing(true);
    }
  }, [shouldEdit]);

  useEffect(() => {
    if (!id) {
      navigate('/patients');
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
        navigate('/patients');
        return;
      }

      if (!data) {
        toast({
          title: "Пациент не найден",
          description: "Пациент с указанным ID не существует",
          variant: "destructive",
        });
        navigate('/patients');
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
      navigate('/patients');
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
        // Remove edit query param
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
      <div className="flex-1 p-6 overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="ghost"
            className="gap-2"
            onClick={() => navigate('/patients')}
          >
            <ArrowLeft className="w-4 h-4" />
            Назад к списку
          </Button>
          {!isEditing && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setIsEditing(true)}
            >
              <Edit className="w-4 h-4" />
              Редактировать
            </Button>
          )}
        </div>

        {isEditing ? (
          <PatientForm
            patient={patient}
            onSave={handleSave}
            onCancel={() => {
              setIsEditing(false);
              navigate(`/patients/${id}`, { replace: true });
            }}
            isSaving={isSaving}
          />
        ) : (
          <div className="space-y-6">
            {/* Patient Info Card */}
            <Card>
              <CardHeader>
                <CardTitle>{patient.name || "Без имени"}</CardTitle>
                <CardDescription>Основная информация о пациенте</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-start gap-3">
                    <Mail className="w-5 h-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Email</p>
                      <p className="text-sm text-muted-foreground">
                        {patient.email || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Phone className="w-5 h-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Телефон</p>
                      <p className="text-sm text-muted-foreground">
                        {patient.phone || "—"}
                      </p>
                    </div>
                  </div>
                  {patient.date_of_birth && (
                    <div className="flex items-start gap-3">
                      <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Дата рождения</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(patient.date_of_birth)}
                        </p>
                      </div>
                    </div>
                  )}
                  {patient.gender && (
                    <div className="flex items-start gap-3">
                      <User className="w-5 h-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Пол</p>
                        <p className="text-sm text-muted-foreground">
                          {patient.gender}
                        </p>
                      </div>
                    </div>
                  )}
                  {patient.address && (
                    <div className="flex items-start gap-3 md:col-span-2">
                      <MapPin className="w-5 h-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Адрес</p>
                        <p className="text-sm text-muted-foreground">
                          {patient.address}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

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
                  <p className="text-sm whitespace-pre-wrap">{patient.notes}</p>
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

            {/* Metadata */}
            <Card>
              <CardHeader>
                <CardTitle>Метаданные</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Создан:</span>
                  <span>{formatDateTime(patient.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Обновлен:</span>
                  <span>{formatDateTime(patient.updated_at)}</span>
                </div>
                {patient.last_activity_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Последняя активность:</span>
                    <span>{formatDateTime(patient.last_activity_at)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </>
  );
};

export default PatientDetailPage;

