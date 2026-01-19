import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Video, Users, Pencil, Trash2, Repeat, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database.types";
import type { DecryptedPatient } from "@/lib/supabase-patients";
import { DoctorInfo } from "./DoctorInfo";
import { SelectDoctorDialog } from "./SelectDoctorDialog";
import { supabase } from "@/lib/supabase";

type Session = Database['public']['Tables']['sessions']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];

interface AppointmentListProps {
  appointments: Session[];
  patients: DecryptedPatient[];
  selectedDate: Date;
  isAdmin?: boolean;
  clinicId?: string;
  onEdit?: (appointment: Session) => void;
  onDelete?: (appointmentId: string) => void;
  onCreateAtTime?: (time: string) => void;
  onReassign?: (appointmentId: string) => void;
}

export function AppointmentList({
  appointments,
  patients,
  selectedDate,
  isAdmin = false,
  clinicId,
  onEdit,
  onDelete,
  onCreateAtTime,
  onReassign,
}: AppointmentListProps) {
  const navigate = useNavigate();
  const [doctorsMap, setDoctorsMap] = useState<Map<string, Profile>>(new Map());
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [appointmentToReassign, setAppointmentToReassign] = useState<Session | null>(null);

  // Load doctors for appointments
  useEffect(() => {
    if (appointments.length > 0) {
      const loadDoctors = async () => {
        const doctorIds = new Set(
          appointments
            .map(a => a.user_id)
            .filter((id): id is string => !!id)
        );

        if (doctorIds.size > 0) {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .in('id', Array.from(doctorIds));

          if (!error && data) {
            const map = new Map<string, Profile>();
            data.forEach(doctor => {
              map.set(doctor.id, doctor);
            });
            setDoctorsMap(map);
          }
        }
      };
      loadDoctors();
    }
  }, [appointments]);

  const handleReassignClick = (appointment: Session) => {
    setAppointmentToReassign(appointment);
    setReassignDialogOpen(true);
  };

  const handleReassign = async (newDoctorId: string) => {
    if (!appointmentToReassign || !onReassign || !clinicId) return;

    try {
      const { reassignAppointment } = await import('@/lib/supabase-sessions');
      await reassignAppointment({
        appointmentId: appointmentToReassign.id,
        newDoctorId,
        patientId: appointmentToReassign.patient_id,
      });
      await onReassign(appointmentToReassign.id);
    } catch (error) {
      console.error('Error reassigning appointment:', error);
      throw error;
    }
  };

  const getPatientName = (patientId: string | null) => {
    if (!patientId) return "Без пациента";
    const patient = patients.find((p) => p.id === patientId);
    return patient?.name || "Неизвестный пациент";
  };

  const handleAppointmentClick = (appointmentId: string) => {
    navigate(`/sessions?sessionId=${appointmentId}`);
  };

  // Sort appointments by time
  const sortedAppointments = [...appointments].sort((a, b) => {
    if (!a.scheduled_at || !b.scheduled_at) return 0;
    return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
  });

  // Empty state - no appointments for today
  if (appointments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 text-center h-full">
        <p className="text-lg text-muted-foreground mb-6">
          У вас сегодня нет консультаций
        </p>
        <Button
          onClick={() => onCreateAtTime?.("10:00")}
          className="gap-2"
        >
          <Plus className="w-4 h-4" />
          Новая консультация
        </Button>
      </div>
    );
  }

  // Has appointments - show simple list
  return (
    <div className="space-y-3">
      {sortedAppointments.map((appointment) => {
        const time = appointment.scheduled_at
          ? format(new Date(appointment.scheduled_at), "HH:mm", { locale: ru })
          : "";
        const patientName = appointment.title || getPatientName(appointment.patient_id);
        const isOnline = appointment.meeting_format === 'online';
        const isInPerson = appointment.meeting_format === 'in_person';
        const isRecurring = appointment.recurring_pattern || appointment.parent_appointment_id;

        return (
          <div
            key={appointment.id}
            className={cn(
              "flex items-center gap-4 p-4 rounded-lg border bg-card cursor-pointer hover:bg-accent/50 transition-colors",
              isInPerson && "border-primary/30 bg-primary/5"
            )}
            onClick={() => handleAppointmentClick(appointment.id)}
          >
            {/* Time */}
            <div className="text-xl font-semibold text-foreground min-w-[60px]">
              {time}
            </div>

            {/* Format icon */}
            <div className="flex-shrink-0">
              {isOnline ? (
                <Video className="w-5 h-5 text-muted-foreground" />
              ) : isInPerson ? (
                <Users className="w-5 h-5 text-primary" />
              ) : null}
            </div>

            {/* Patient name and doctor info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground truncate">
                  {patientName}
                </span>
                {isRecurring && (
                  <Repeat className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
              </div>
              {isAdmin && appointment.user_id && (
                <div onClick={(e) => e.stopPropagation()}>
                  <DoctorInfo
                    doctor={doctorsMap.get(appointment.user_id) || null}
                    isAdmin={isAdmin}
                    onClick={() => handleReassignClick(appointment)}
                  />
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              {onEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(appointment)}
                  className="h-8 w-8 p-0"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(appointment.id)}
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        );
      })}

      {/* Add more button */}
      <Button
        variant="outline"
        className="w-full gap-2 mt-4"
        onClick={() => onCreateAtTime?.("10:00")}
      >
        <Plus className="w-4 h-4" />
        Добавить консультацию
      </Button>

      {isAdmin && clinicId && appointmentToReassign && (
        <SelectDoctorDialog
          open={reassignDialogOpen}
          onOpenChange={setReassignDialogOpen}
          clinicId={clinicId}
          currentDoctorId={appointmentToReassign.user_id || undefined}
          onSelect={handleReassign}
        />
      )}
    </div>
  );
}
