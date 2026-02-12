import { useNavigate } from "react-router-dom";
import { User, ArrowLeft } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { PatientForm } from "@/components/patients/PatientForm";
import { useCreatePatient } from "@/hooks/usePatients";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/types/database.types";

type PatientInsert = Database['public']['Tables']['patients']['Insert'];
type PatientUpdate = Database['public']['Tables']['patients']['Update'];

const PatientCreatePage = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { toast } = useToast();
  const createPatientMutation = useCreatePatient();

  const handleSave = async (formData: PatientInsert | PatientUpdate) => {
    if (!profile?.clinic_id) {
      toast({
        title: "Ошибка",
        description: "Не удалось определить клинику. Пожалуйста, войдите снова.",
        variant: "destructive",
      });
      return;
    }

    createPatientMutation.mutate(
      {
        ...formData,
        clinic_id: profile.clinic_id,
        created_by: profile.id,
      },
      {
        onSuccess: (data) => {
          toast({
            title: "Успешно",
            description: "Пациент успешно создан",
          });
          navigate(`/patients/${data.id}`);
        },
        onError: (error: Error) => {
          // Provide more helpful error messages for common issues
          let errorMessage = error.message;
          if (error.message.includes('row-level security') || error.message.includes('violates')) {
            errorMessage = 'Ошибка доступа. Пожалуйста, выйдите и войдите снова. Если проблема повторится, обратитесь к администратору.';
            console.error('RLS policy violation during patient creation:', {
              error: error.message,
              clinic_id: profile?.clinic_id,
              user_id: profile?.id,
            });
          }
          toast({
            title: "Ошибка",
            description: `Не удалось создать пациента: ${errorMessage}`,
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <>
      <Header title="Новый пациент" icon={<User className="w-5 h-5" />} />
      <div className="flex-1 p-4 md:p-6 overflow-auto">
        <div className="mb-6">
          <Button
            variant="ghost"
            className="gap-2"
            onClick={() => navigate('/patients')}
          >
            <ArrowLeft className="w-4 h-4" />
            Назад к списку
          </Button>
        </div>

        <PatientForm
          onSave={handleSave}
          onCancel={() => navigate('/patients')}
          isSaving={createPatientMutation.isPending}
        />
      </div>
    </>
  );
};

export default PatientCreatePage;






