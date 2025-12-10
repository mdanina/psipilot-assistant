import { useState, useEffect } from "react";
import { Calendar, Clock, Loader2, User, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PatientCombobox } from "@/components/ui/patient-combobox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, startOfToday, isBefore, isToday } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database.types";
import type { DecryptedPatient } from "@/lib/supabase-patients";
import { createPatient } from "@/lib/supabase-patients";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

// Helper to get timezone from browser or default
function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

type Patient = Database['public']['Tables']['patients']['Row'];

interface CreateAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patients: DecryptedPatient[];
  clinicId: string;
  defaultDate?: Date;
  defaultTime?: string;
  isAdmin?: boolean;
  currentUserId?: string;
  timezone?: string; // Timezone from profile settings (selected in TimezoneSelector)
  onCreateAppointment: (params: {
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
  }) => Promise<void>;
}

type Profile = Database['public']['Tables']['profiles']['Row'];

export function CreateAppointmentDialog({
  open,
  onOpenChange,
  patients,
  clinicId,
  defaultDate,
  defaultTime,
  isAdmin = false,
  currentUserId,
  timezone: propTimezone,
  onCreateAppointment,
}: CreateAppointmentDialogProps) {
  const { profile } = useAuth();
  
  // Use timezone from props (from profile) or fallback to browser/default
  const userTimezone = propTimezone || getBrowserTimezone();
  
  const [clientType, setClientType] = useState<'existing' | 'new'>('existing');
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [newPatientName, setNewPatientName] = useState("");
  const [newPatientEmail, setNewPatientEmail] = useState("");
  const [newPatientPhone, setNewPatientPhone] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(defaultDate || new Date());
  const [selectedTime, setSelectedTime] = useState(defaultTime || "09:00");
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(currentUserId || "");
  const [availableDoctors, setAvailableDoctors] = useState<Profile[]>([]);

  // Update date and time when dialog opens or defaults change
  useEffect(() => {
    if (open) {
      const today = startOfToday();
      if (defaultDate) {
        // If default date is in the past, use today instead
        const dateToUse = isBefore(defaultDate, today) ? new Date() : defaultDate;
        setSelectedDate(dateToUse);
      } else {
        setSelectedDate(new Date());
      }
      if (defaultTime) {
        // If selected date is today, validate time
        const dateToCheck = defaultDate && !isBefore(defaultDate, today) ? defaultDate : new Date();
        if (isToday(dateToCheck)) {
          const [hours, minutes] = defaultTime.split(':').map(Number);
          const timeToCheck = new Date();
          timeToCheck.setHours(hours, minutes, 0, 0);
          if (isBefore(timeToCheck, new Date())) {
            // If time is in the past, set to current time + 1 hour
            const now = new Date();
            now.setHours(now.getHours() + 1, 0, 0, 0);
            setSelectedTime(format(now, "HH:mm"));
          } else {
            setSelectedTime(defaultTime);
          }
        } else {
          setSelectedTime(defaultTime);
        }
      } else {
        // If no default time and date is today, set to current time + 1 hour
        const dateToCheck = defaultDate && !isBefore(defaultDate, today) ? defaultDate : new Date();
        if (isToday(dateToCheck)) {
          const now = new Date();
          now.setHours(now.getHours() + 1, 0, 0, 0);
          setSelectedTime(format(now, "HH:mm"));
        } else {
          setSelectedTime("09:00");
        }
      }
    }
  }, [open, defaultDate, defaultTime]);

  // Load available doctors for admin
  useEffect(() => {
    if (isAdmin && open && clinicId) {
      const loadDoctors = async () => {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('clinic_id', clinicId)
          .in('role', ['specialist', 'admin'])
          .order('full_name', { ascending: true });
        
        if (!error && data) {
          setAvailableDoctors(data);
          if (!selectedDoctorId && currentUserId) {
            setSelectedDoctorId(currentUserId);
          }
        }
      };
      loadDoctors();
    }
  }, [isAdmin, open, clinicId, currentUserId]);

  const [durationMinutes, setDurationMinutes] = useState(60);
  const [meetingFormat, setMeetingFormat] = useState<'online' | 'in_person'>('online');
  const [isRecurring, setIsRecurring] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const resetState = () => {
    setClientType('existing');
    setSelectedPatientId("");
    setNewPatientName("");
    setNewPatientEmail("");
    setNewPatientPhone("");
    setSelectedDate(defaultDate || new Date());
    setSelectedTime(defaultTime || "09:00");
    setDurationMinutes(60);
    setMeetingFormat('online');
    setIsRecurring(false);
    setIsCreating(false);
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const handleCreate = async () => {
    if (!selectedDate) {
      return;
    }

    setIsCreating(true);

    try {
      let patientId: string | null = null;
      let patientName: string | undefined;
      let contactInfo: string | undefined;

      if (clientType === 'existing') {
        if (!selectedPatientId) {
          throw new Error('Выберите пациента');
        }
        patientId = selectedPatientId;
      } else {
        // Create new patient
        if (!newPatientName.trim()) {
          throw new Error('Введите имя пациента');
        }

        const { data: newPatient, error: createError } = await createPatient({
          clinic_id: clinicId,
          name: newPatientName.trim(),
          email: newPatientEmail.trim() || null,
          phone: newPatientPhone.trim() || null,
        });

        if (createError || !newPatient) {
          throw new Error(createError?.message || 'Не удалось создать пациента');
        }

        patientId = newPatient.id;

        // Ensure consent exists for the new patient (required for RLS)
        try {
          const { error: consentError } = await supabase.rpc('create_consent_for_patient', {
            p_patient_id: patientId,
            p_consent_type: 'data_processing',
            p_consent_purpose: 'Обработка персональных данных для ведения клинических записей и планирования встреч',
            p_legal_basis: 'contract',
            p_consent_method: 'electronic',
          });

          if (consentError) {
            console.warn('Failed to create consent for patient:', consentError);
            // Don't throw - consent might already exist or be created by trigger
          }
        } catch (consentErr) {
          console.warn('Error creating consent:', consentErr);
          // Continue anyway - consent might be created by trigger
        }
        patientName = newPatientName.trim();
        contactInfo = newPatientEmail.trim() || newPatientPhone.trim() || undefined;
      }

      // Combine date and time
      const [hours, minutes] = selectedTime.split(':').map(Number);
      const scheduledDateTime = new Date(selectedDate);
      scheduledDateTime.setHours(hours, minutes, 0, 0);

      // Validate that appointment is not in the past
      const now = new Date();
      if (isBefore(scheduledDateTime, now)) {
        throw new Error('Нельзя создать встречу в прошлом. Выберите будущую дату и время.');
      }

      const recurringPattern = isRecurring ? 'weekly' : undefined;
      const recurringEndDate = isRecurring
        ? new Date(scheduledDateTime.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString() // 90 days from now
        : undefined;

      console.log('[CreateAppointmentDialog] Calling onCreateAppointment with params:', {
        patientId,
        scheduledAt: scheduledDateTime.toISOString(),
        durationMinutes,
        meetingFormat,
      });

      await onCreateAppointment({
        patientId,
        patientName,
        contactInfo,
        scheduledAt: scheduledDateTime.toISOString(),
        durationMinutes,
        meetingFormat,
        recurringPattern,
        recurringEndDate,
        assignedDoctorId: isAdmin ? selectedDoctorId : undefined,
        timezone: userTimezone,
      });

      console.log('[CreateAppointmentDialog] ✅ Appointment created, closing dialog');
      handleClose();
    } catch (error) {
      console.error('[CreateAppointmentDialog] ❌ Error creating appointment:', error);
      // Error is already handled by parent component (CalendarPage)
      // Don't throw - let parent handle it
    } finally {
      setIsCreating(false);
    }
  };

  // Check if selected date/time is valid (not in the past)
  const isValidDateTime = selectedDate && selectedTime && (() => {
    const [hours, minutes] = selectedTime.split(':').map(Number);
    const scheduledDateTime = new Date(selectedDate);
    scheduledDateTime.setHours(hours, minutes, 0, 0);
    return !isBefore(scheduledDateTime, new Date());
  })();

  const canCreate = selectedDate && isValidDateTime && (
    (clientType === 'existing' && selectedPatientId) ||
    (clientType === 'new' && newPatientName.trim())
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Новая встреча</DialogTitle>
          <p className="text-sm text-muted-foreground">Запланируйте встречу с пациентом</p>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Patient Selection */}
          <div className="space-y-3">
            <Label>Пациент</Label>
            <RadioGroup value={clientType} onValueChange={(v) => setClientType(v as 'existing' | 'new')}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="existing" id="existing" />
                <Label htmlFor="existing" className="cursor-pointer">Существующий пациент</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="new" id="new" />
                <Label htmlFor="new" className="cursor-pointer">Новый пациент</Label>
              </div>
            </RadioGroup>

            {clientType === 'existing' ? (
              <div className="space-y-2">
                <PatientCombobox
                  patients={patients as Patient[]}
                  value={selectedPatientId}
                  onValueChange={setSelectedPatientId}
                  placeholder="Поиск пациента..."
                />
                {selectedPatientId && (
                  <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-md">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                      <span className="text-sm font-medium">
                        {patients.find(p => p.id === selectedPatientId)?.name
                          .split(' ')
                          .map(n => n[0])
                          .join('')
                          .toUpperCase() || 'К'}
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {patients.find(p => p.id === selectedPatientId)?.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {patients.find(p => p.id === selectedPatientId)?.email || 'Нет контакта'}
                      </p>
                    </div>
                    <Check className="w-5 h-5 text-primary" />
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="patient-name">
                    Имя пациента <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="patient-name"
                    placeholder="Иванов Иван"
                    value={newPatientName}
                    onChange={(e) => setNewPatientName(e.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="patient-email">Email</Label>
                    <Input
                      id="patient-email"
                      type="email"
                      placeholder="ivan@example.com"
                      value={newPatientEmail}
                      onChange={(e) => setNewPatientEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="patient-phone">Телефон</Label>
                    <Input
                      id="patient-phone"
                      type="tel"
                      placeholder="+7 (999) 123-45-67"
                      value={newPatientPhone}
                      onChange={(e) => setNewPatientPhone(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Doctor Selection (Admin only) */}
          {isAdmin && (
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

          {/* Meeting Details */}
          <div className="space-y-3">
            <Label>Детали встречи</Label>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date">Дата</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !selectedDate && "text-muted-foreground"
                      )}
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {selectedDate ? (
                        format(selectedDate, "d MMMM yyyy", { locale: ru })
                      ) : (
                        <span>Выберите дату</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      initialFocus
                      disabled={(date) => isBefore(date, startOfToday())}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="time">Время</Label>
                <Input
                  id="time"
                  type="time"
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  className="w-full"
                  min={isToday(selectedDate || new Date()) ? format(new Date(), "HH:mm") : undefined}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Продолжительность</Label>
              <Select value={durationMinutes.toString()} onValueChange={(v) => setDurationMinutes(Number(v))}>
                <SelectTrigger id="duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 минут</SelectItem>
                  <SelectItem value="45">45 минут</SelectItem>
                  <SelectItem value="60">1 час</SelectItem>
                  <SelectItem value="90">1.5 часа</SelectItem>
                  <SelectItem value="120">2 часа</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Формат</Label>
              <RadioGroup value={meetingFormat} onValueChange={(v) => setMeetingFormat(v as 'online' | 'in_person')}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="online" id="online" />
                  <Label htmlFor="online" className="cursor-pointer">Онлайн</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="in_person" id="in_person" />
                  <Label htmlFor="in_person" className="cursor-pointer">Очно</Label>
                </div>
              </RadioGroup>
            </div>
          </div>

          {/* Recurring Meeting */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Повторяющаяся встреча</Label>
                <p className="text-xs text-muted-foreground">
                  Встреча будет повторяться каждую неделю в этот же день и время
                </p>
              </div>
              <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
            </div>
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
                Сохранение...
              </>
            ) : (
              "Сохранить встречу"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

