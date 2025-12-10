import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Clock, Video, Users, Pencil, Trash2, Repeat } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  // Generate time slots for the day (00:00 to 23:30, 30-minute intervals)
  const timeSlots: string[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      timeSlots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
    }
  }

  // Group appointments by time
  const appointmentsByTime = new Map<string, Session[]>();
  appointments.forEach((appointment) => {
    if (appointment.scheduled_at) {
      const appointmentDate = new Date(appointment.scheduled_at);
      const timeKey = format(appointmentDate, "HH:mm");
      if (!appointmentsByTime.has(timeKey)) {
        appointmentsByTime.set(timeKey, []);
      }
      appointmentsByTime.get(timeKey)!.push(appointment);
    }
  });

  const getPatientName = (patientId: string | null) => {
    if (!patientId) return "Без пациента";
    const patient = patients.find((p) => p.id === patientId);
    return patient?.name || "Неизвестный пациент";
  };

  const getAppointmentEndTime = (appointment: Session) => {
    if (!appointment.scheduled_at) return "";
    const start = new Date(appointment.scheduled_at);
    const duration = appointment.duration_minutes || 60;
    const end = new Date(start.getTime() + duration * 60 * 1000);
    return format(end, "HH:mm", { locale: ru });
  };

  const handleAppointmentDoubleClick = (appointmentId: string) => {
    navigate(`/sessions?sessionId=${appointmentId}`);
  };

  return (
    <div className="space-y-1">
      {timeSlots.map((timeSlot) => {
        const isFullHour = timeSlot.endsWith(":00");
        const slotAppointments = appointmentsByTime.get(timeSlot) || [];
        const hasAppointments = slotAppointments.length > 0;

        return (
          <div
            key={timeSlot}
            className={cn(
              "flex items-start gap-3 py-2 px-3 rounded-md hover:bg-accent/50 transition-colors",
              isFullHour && "border-t border-border"
            )}
          >
            <div className={cn(
              "w-16 text-sm font-medium text-muted-foreground",
              isFullHour && "font-semibold"
            )}>
              {timeSlot}
            </div>

            <div className="flex-1 space-y-2">
              {hasAppointments ? (
                slotAppointments.map((appointment) => {
                  const endTime = getAppointmentEndTime(appointment);
                  const formatType = appointment.meeting_format === 'online' ? 'online' : 
                                   appointment.meeting_format === 'in_person' ? 'in_person' : null;

                  return (
                    <div
                      key={appointment.id}
                      className={cn(
                        "p-3 rounded-md border bg-card cursor-pointer",
                        formatType === 'online' && "border-border bg-muted/30",
                        formatType === 'in_person' && "border-primary/30 bg-primary/5",
                        !formatType && "border-border bg-muted/50"
                      )}
                      onDoubleClick={() => handleAppointmentDoubleClick(appointment.id)}
                      title="Двойной клик для открытия сессии"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            {formatType === 'online' ? (
                              <Video className="w-4 h-4 text-muted-foreground" />
                            ) : formatType === 'in_person' ? (
                              <Users className="w-4 h-4 text-primary" />
                            ) : (
                              <Clock className="w-4 h-4 text-muted-foreground" />
                            )}
                            <span className="font-medium text-sm">
                              {appointment.title || getPatientName(appointment.patient_id)}
                            </span>
                            {(appointment.recurring_pattern || appointment.parent_appointment_id) && (
                              <Repeat className="w-3.5 h-3.5 text-muted-foreground" />
                            )}
                            {formatType && (
                              <Badge
                                variant="secondary"
                                className={cn(
                                  "text-xs border",
                                  formatType === 'online' && "bg-muted text-muted-foreground border-border",
                                  formatType === 'in_person' && "bg-primary/10 text-primary border-primary/20"
                                )}
                              >
                                {formatType === 'online' ? 'Онлайн' : 'Очно'}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {getPatientName(appointment.patient_id)}
                          </p>
                          {appointment.user_id && (
                            <DoctorInfo
                              doctor={doctorsMap.get(appointment.user_id) || null}
                              isAdmin={isAdmin}
                              onClick={isAdmin ? () => handleReassignClick(appointment) : undefined}
                            />
                          )}
                          <p className="text-xs text-muted-foreground">
                            {timeSlot} - {endTime} ({appointment.duration_minutes || 60} мин.)
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
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
                    </div>
                  );
                })
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onCreateAtTime?.(timeSlot)}
                  className="text-xs text-muted-foreground hover:text-foreground h-auto py-1 px-2"
                >
                  + Добавить встречу
                </Button>
              )}
            </div>
          </div>
        );
      })}
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

