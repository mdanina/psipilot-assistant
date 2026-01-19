import { useState, useEffect, useCallback } from "react";
import { Plus, RefreshCw, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { getScheduledSessions, createAppointment, deleteAppointment, deleteAllRecurringAppointments, getRecurringAppointments, reassignAppointment } from "@/lib/supabase-sessions";
import { useQueryClient } from "@tanstack/react-query";
import { getPatients, type DecryptedPatient } from "@/lib/supabase-patients";
import { getAssignedPatients } from "@/lib/supabase-patient-assignments";
import { assignPatientToDoctor } from "@/lib/supabase-patient-assignments";
import { useToast } from "@/hooks/use-toast";
import { CreateAppointmentDialog } from "@/components/calendar/CreateAppointmentDialog";
import { AppointmentList } from "@/components/calendar/AppointmentList";
import { TimezoneSelector } from "@/components/calendar/TimezoneSelector";
import { CalendarFeedDialog } from "@/components/calendar/CalendarFeedDialog";
import { Calendar } from "@/components/ui/calendar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format, startOfDay, endOfDay, isSameDay } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database.types";

type Session = Database['public']['Tables']['sessions']['Row'];

const CalendarPage = () => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [appointments, setAppointments] = useState<Session[]>([]);
  const [patients, setPatients] = useState<DecryptedPatient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [defaultAppointmentDate, setDefaultAppointmentDate] = useState<Date | undefined>(undefined);
  const [defaultAppointmentTime, setDefaultAppointmentTime] = useState<string | undefined>(undefined);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [appointmentToDelete, setAppointmentToDelete] = useState<Session | null>(null);
  const [deleteAllRecurring, setDeleteAllRecurring] = useState(false);
  
  // Get timezone from profile settings
  const userTimezone = (() => {
    if (profile?.settings && typeof profile.settings === 'object') {
      const settings = profile.settings as { timezone?: string };
      if (settings.timezone) {
        return settings.timezone;
      }
    }
    // Default to browser timezone or Moscow for Russian users
    try {
      const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return browserTz || 'Europe/Moscow';
    } catch {
      return 'Europe/Moscow';
    }
  })();

  // Load assigned patients only
  const loadPatients = useCallback(async () => {
    if (!profile?.clinic_id || !user?.id) return;

    try {
      // For admin: load all patients in clinic
      // For specialist: load only assigned patients
      let data;
      let error;
      
      if (profile.role === 'admin') {
        // Admin sees all patients in clinic (RLS will handle this)
        const { getPatients } = await import('@/lib/supabase-patients');
        const result = await getPatients();
        data = result.data;
        error = result.error;
      } else {
        // Specialist sees only assigned patients
        const result = await getAssignedPatients();
        data = result.data;
        error = result.error;
      }
      
      if (error) {
        console.error('Error loading patients:', error);
        return;
      }
      if (data) {
        // For admin: getPatients() already returns decrypted data
        // For specialist: getAssignedPatients() returns raw data, need to decrypt
        if (profile.role === 'admin') {
          setPatients(data); // Already decrypted by getPatients()
        } else {
          // Decrypt patient PII for specialists
          const { decryptPatientPII } = await import('@/lib/supabase-patients');
          const decryptedPatients = await Promise.all(
            data.map((p) => decryptPatientPII(p))
          );
          setPatients(decryptedPatients);
        }
      }
    } catch (error) {
      console.error('Error loading patients:', error);
    }
  }, [profile?.clinic_id, profile?.role, user?.id]);

  // Load appointments for date range (load entire month for calendar dots)
  const loadAppointments = useCallback(async () => {
    if (!profile?.clinic_id || !user?.id) return;

    try {
      setIsRefreshing(true);
      // Load appointments for the entire month to show dots in calendar
      const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
      const monthEnd = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0, 23, 59, 59);
      
      const sessions = await getScheduledSessions(monthStart, monthEnd);
      console.log('Loaded appointments:', sessions.length, 'for month:', calendarMonth);
      setAppointments(sessions);
    } catch (error) {
      console.error('Error loading appointments:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить встречи",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [profile?.clinic_id, user?.id, calendarMonth, toast]);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  const handleCreateAppointment = async (params: {
    patientId: string | null;
    patientName?: string;
    contactInfo?: string;
    scheduledAt: string;
    durationMinutes: number;
    meetingFormat: 'online' | 'in_person' | null;
    recurringPattern?: 'weekly' | 'monthly' | null;
    recurringEndDate?: string | null;
    assignedDoctorId?: string;
    timezone?: string;
  }) => {
    if (!user?.id || !profile?.clinic_id) {
      toast({
        title: "Ошибка",
        description: "Необходимо войти в систему",
        variant: "destructive",
      });
      return;
    }

    try {
      // Определить userId для встречи
      const appointmentUserId = params.assignedDoctorId || user.id;
      
      console.log('[Calendar] Creating appointment with params:', {
        userId: appointmentUserId,
        clinicId: profile.clinic_id,
        patientId: params.patientId,
        scheduledAt: params.scheduledAt,
        durationMinutes: params.durationMinutes,
        meetingFormat: params.meetingFormat,
      });
      
      // Если админ назначает встречу другому врачу, нужно назначить пациента этому врачу ПЕРЕД созданием встречи
      if (params.assignedDoctorId && params.assignedDoctorId !== user.id && params.patientId) {
        const { error: assignError } = await assignPatientToDoctor(
          params.patientId,
          params.assignedDoctorId,
          'primary'  // Тип назначения 'primary' дает полный доступ
        );
        
        if (assignError) {
          throw new Error(`Не удалось назначить пациента врачу: ${assignError.message}`);
        }
        // После назначения врач автоматически получает доступ ко всей информации пациента
        // благодаря RLS политикам в БД
      }

      const createdSessions = await createAppointment({
        userId: appointmentUserId, // использовать выбранного врача для админа
        clinicId: profile.clinic_id,
        patientId: params.patientId,
        scheduledAt: params.scheduledAt,
        durationMinutes: params.durationMinutes,
        meetingFormat: params.meetingFormat,
        title: params.patientName || null,
        recurringPattern: params.recurringPattern || null,
        recurringEndDate: params.recurringEndDate || null,
        timezone: params.timezone || 'UTC',
      });

      console.log('[Calendar] ✅ Appointment created successfully:', createdSessions.length, 'sessions');

      // Invalidate React Query cache for sessions to ensure new appointment appears
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      
      // Reload appointments after creation
      await loadAppointments();

      toast({
        title: "Успешно",
        description: "Встреча создана",
      });
      
      // Close dialog
      setCreateDialogOpen(false);
    } catch (error) {
      console.error('[Calendar] ❌ Error creating appointment:', error);
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось создать встречу",
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleDeleteAppointment = async (appointmentId: string) => {
    // Find the appointment to check if it's recurring
    const appointment = appointments.find(apt => apt.id === appointmentId);
    if (!appointment) return;

    // Check if it's a recurring appointment
    const isRecurring = appointment.recurring_pattern || appointment.parent_appointment_id;
    
    if (isRecurring) {
      // Show confirmation dialog
      setAppointmentToDelete(appointment);
      setDeleteDialogOpen(true);
      return;
    }

    // Not recurring, delete directly
    await performDelete(appointmentId, false);
  };

  const performDelete = async (appointmentId: string, deleteAll: boolean) => {
    try {
      if (deleteAll) {
        await deleteAllRecurringAppointments(appointmentId);
        toast({
          title: "Успешно",
          description: "Все повторяющиеся встречи удалены",
        });
      } else {
        await deleteAppointment(appointmentId);
        toast({
          title: "Успешно",
          description: "Встреча удалена",
        });
      }
      await loadAppointments();
      setDeleteDialogOpen(false);
      setAppointmentToDelete(null);
    } catch (error) {
      console.error('Error deleting appointment:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось удалить встречу",
        variant: "destructive",
      });
    }
  };

  const handleCreateAtTime = (time: string) => {
    setDefaultAppointmentDate(selectedDate);
    setDefaultAppointmentTime(time);
    setCreateDialogOpen(true);
  };

  const handleReassignAppointment = async (appointmentId: string) => {
    // Reload appointments after reassignment
    await loadAppointments();
    toast({
      title: "Успешно",
      description: "Врач переназначен",
    });
  };

  // Filter appointments for selected date
  const dayAppointments = appointments.filter((appointment) => {
    if (!appointment.scheduled_at) return false;
    return isSameDay(new Date(appointment.scheduled_at), selectedDate);
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Загрузка календаря...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="border-b bg-background px-4 md:px-6 py-3 md:py-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              className="flex-1 sm:flex-none"
              onClick={() => {
                setDefaultAppointmentDate(selectedDate);
                setDefaultAppointmentTime(undefined);
                setCreateDialogOpen(true);
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              <span className="sm:inline">Новая встреча</span>
            </Button>
            <CalendarFeedDialog />
          </div>
          <TimezoneSelector />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Panel - Calendar */}
        <div className="lg:w-1/2 border-b lg:border-b-0 lg:border-r bg-background p-4 md:p-6 flex flex-col items-center justify-center">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => date && setSelectedDate(date)}
            month={calendarMonth}
            onMonthChange={setCalendarMonth}
            className="w-fit"
            classNames={{
              months: "flex justify-center",
              month: "space-y-8",
              caption: "flex justify-center pt-2 relative items-center",
              caption_label: "text-xl font-semibold",
              nav_button_previous: "absolute left-1",
              nav_button_next: "absolute right-1",
              table: "mx-auto",
              head_cell: "text-base font-medium w-[80px] h-12",
              cell: "h-[80px] w-[80px]",
              day: "h-[80px] w-[80px] text-lg relative [&.has-online-appointment]:after:content-[''] [&.has-online-appointment]:after:absolute [&.has-online-appointment]:after:bottom-2 [&.has-online-appointment]:after:left-1/2 [&.has-online-appointment]:after:-translate-x-1/2 [&.has-online-appointment]:after:h-1.5 [&.has-online-appointment]:after:w-1.5 [&.has-online-appointment]:after:rounded-full [&.has-online-appointment]:after:bg-muted-foreground [&.has-inperson-appointment]:after:content-[''] [&.has-inperson-appointment]:after:absolute [&.has-inperson-appointment]:after:bottom-2 [&.has-inperson-appointment]:after:left-1/2 [&.has-inperson-appointment]:after:-translate-x-1/2 [&.has-inperson-appointment]:after:h-1.5 [&.has-inperson-appointment]:after:w-1.5 [&.has-inperson-appointment]:after:rounded-full [&.has-inperson-appointment]:after:bg-primary",
              day_selected: "border-2 border-primary rounded-full bg-transparent text-foreground hover:border-primary hover:bg-transparent focus:border-primary focus:bg-transparent",
            }}
            modifiers={{
              hasOnlineAppointment: (date) => {
                const dayAppts = appointments.filter((apt) => {
                  if (!apt.scheduled_at) return false;
                  return isSameDay(new Date(apt.scheduled_at), date);
                });
                // Only show online dot if there's no in-person appointment
                const hasInPerson = dayAppts.some(apt => apt.meeting_format === 'in_person');
                return !hasInPerson && dayAppts.some(apt => apt.meeting_format === 'online');
              },
              hasInPersonAppointment: (date) => {
                return appointments.some((apt) => {
                  if (!apt.scheduled_at || apt.meeting_format !== 'in_person') return false;
                  return isSameDay(new Date(apt.scheduled_at), date);
                });
              },
            }}
            modifiersClassNames={{
              hasOnlineAppointment: "has-online-appointment",
              hasInPersonAppointment: "has-inperson-appointment",
            }}
          />
        </div>

        {/* Right Panel - Schedule */}
        <div className="lg:w-1/2 p-4 md:p-6 flex-1 min-h-0">
          <div className="bg-card rounded-lg border border-border shadow-sm h-full flex flex-col overflow-hidden">
            <div className="p-4 md:p-6 pb-3 md:pb-4 border-b border-border">
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedDate(new Date(selectedDate.getTime() - 24 * 60 * 60 * 1000))}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="text-center flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium truncate">
                    {format(selectedDate, "EEEE, d MMMM yyyy", { locale: ru })}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedDate(new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000))}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 md:p-6 pt-3 md:pt-4">
              <AppointmentList
                appointments={dayAppointments}
                patients={patients}
                selectedDate={selectedDate}
                isAdmin={profile?.role === 'admin'}
                clinicId={profile?.clinic_id}
                onDelete={handleDeleteAppointment}
                onCreateAtTime={handleCreateAtTime}
                onReassign={handleReassignAppointment}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Create Appointment Dialog */}
      {profile?.clinic_id && (
        <CreateAppointmentDialog
          open={createDialogOpen}
          onOpenChange={(open) => {
            setCreateDialogOpen(open);
            if (!open) {
              // Reset defaults when dialog closes
              setDefaultAppointmentDate(undefined);
              setDefaultAppointmentTime(undefined);
            }
          }}
          patients={patients}
          clinicId={profile.clinic_id}
          defaultDate={defaultAppointmentDate || selectedDate}
          defaultTime={defaultAppointmentTime}
          isAdmin={profile?.role === 'admin'}
          currentUserId={user?.id || undefined}
          timezone={userTimezone}
          onCreateAppointment={handleCreateAppointment}
        />
      )}

      {/* Delete Recurring Appointment Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удаление повторяющейся встречи</AlertDialogTitle>
            <AlertDialogDescription>
              Эта встреча является частью повторяющейся серии. Что вы хотите сделать?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-4">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                name="deleteOption"
                checked={!deleteAllRecurring}
                onChange={() => setDeleteAllRecurring(false)}
                className="w-4 h-4"
              />
              <span className="text-sm">Удалить только эту встречу</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                name="deleteOption"
                checked={deleteAllRecurring}
                onChange={() => setDeleteAllRecurring(true)}
                className="w-4 h-4"
              />
              <span className="text-sm">Удалить все последующие встречи</span>
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setDeleteDialogOpen(false);
              setAppointmentToDelete(null);
              setDeleteAllRecurring(false);
            }}>
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (appointmentToDelete) {
                  performDelete(appointmentToDelete.id, deleteAllRecurring);
                }
              }}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CalendarPage;

