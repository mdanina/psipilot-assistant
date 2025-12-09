import { useState, useEffect } from "react";
import { Loader2, UserPlus, X, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  getPatientAssignments,
  assignPatientToDoctor,
  unassignPatientFromDoctor,
  reassignPatient,
  type PatientAssignmentWithDoctor,
  type AssignmentType,
} from "@/lib/supabase-patient-assignments";
import { getSpecializationName } from "@/lib/specializations";
import type { Database } from "@/types/database.types";

type Profile = Database['public']['Tables']['profiles']['Row'];

interface PatientAssignmentsDialogProps {
  patientId: string;
  patientName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssignmentsChanged?: () => void;
}

export function PatientAssignmentsDialog({
  patientId,
  patientName,
  open,
  onOpenChange,
  onAssignmentsChanged,
}: PatientAssignmentsDialogProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<PatientAssignmentWithDoctor[]>([]);
  const [availableDoctors, setAvailableDoctors] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("");
  const [assignmentType, setAssignmentType] = useState<AssignmentType>("primary");

  // Load assignments and available doctors
  useEffect(() => {
    if (open && profile?.clinic_id) {
      loadData();
    }
  }, [open, patientId, profile?.clinic_id]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load current assignments
      const { data: assignmentsData, error: assignmentsError } = await getPatientAssignments(patientId);
      if (assignmentsError) throw assignmentsError;
      setAssignments(assignmentsData || []);

      // Load available doctors (specialists and admins) from clinic
      const { data: doctorsData, error: doctorsError } = await supabase
        .from('profiles')
        .select('*')
        .eq('clinic_id', profile!.clinic_id)
        .in('role', ['specialist', 'admin'])
        .order('full_name', { ascending: true });

      if (doctorsError) throw doctorsError;
      setAvailableDoctors(doctorsData || []);
    } catch (error) {
      console.error('Error loading assignments:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить назначения",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedDoctorId) {
      toast({
        title: "Ошибка",
        description: "Выберите врача",
        variant: "destructive",
      });
      return;
    }

    setIsAssigning(true);
    try {
      const { error } = await assignPatientToDoctor(
        patientId,
        selectedDoctorId,
        assignmentType
      );

      if (error) {
        throw error;
      }

      toast({
        title: "Успешно",
        description: "Врач назначен пациенту",
      });

      setSelectedDoctorId("");
      setAssignmentType("primary");
      await loadData();
      onAssignmentsChanged?.();
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось назначить врача",
        variant: "destructive",
      });
    } finally {
      setIsAssigning(false);
    }
  };

  const handleUnassign = async (doctorId: string, doctorName: string) => {
    if (!confirm(`Отвязать врача ${doctorName} от пациента?`)) {
      return;
    }

    try {
      const { error } = await unassignPatientFromDoctor(patientId, doctorId);

      if (error) {
        throw error;
      }

      toast({
        title: "Успешно",
        description: "Врач отвязан от пациента",
      });

      await loadData();
      onAssignmentsChanged?.();
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось отвязать врача",
        variant: "destructive",
      });
    }
  };

  // Get doctors not yet assigned
  const unassignedDoctors = availableDoctors.filter(
    (doctor) => !assignments.some((a) => a.doctor_id === doctor.id)
  );

  const assignmentTypeLabels: Record<AssignmentType, string> = {
    primary: "Основной врач",
    consultant: "Консультант",
    group_therapist: "Групповой терапевт",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Назначения врачей для {patientName}</DialogTitle>
          <DialogDescription>
            Управление назначениями врачей пациенту. Только администратор может управлять назначениями.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Current Assignments */}
            <div>
              <Label className="text-base font-semibold mb-3 block">
                Назначенные врачи ({assignments.length})
              </Label>
              {assignments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  Нет назначенных врачей
                </p>
              ) : (
                <div className="space-y-2">
                  {assignments.map((assignment) => (
                    <div
                      key={assignment.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">
                            {assignment.doctor.full_name || assignment.doctor.email}
                          </p>
                          <Badge variant="outline">
                            {assignmentTypeLabels[assignment.assignment_type as AssignmentType]}
                          </Badge>
                        </div>
                        {assignment.doctor.specialization && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {getSpecializationName(assignment.doctor.specialization)}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          Назначен: {new Date(assignment.assigned_at).toLocaleDateString('ru-RU')}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          handleUnassign(
                            assignment.doctor_id,
                            assignment.doctor.full_name || assignment.doctor.email
                          )
                        }
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Assign New Doctor */}
            {unassignedDoctors.length > 0 && (
              <div className="border-t pt-4">
                <Label className="text-base font-semibold mb-3 block">
                  Назначить нового врача
                </Label>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="doctor-select">Врач</Label>
                    <Select
                      value={selectedDoctorId}
                      onValueChange={setSelectedDoctorId}
                    >
                      <SelectTrigger id="doctor-select">
                        <SelectValue placeholder="Выберите врача" />
                      </SelectTrigger>
                      <SelectContent>
                        {unassignedDoctors.map((doctor) => (
                          <SelectItem key={doctor.id} value={doctor.id}>
                            {doctor.full_name || doctor.email}
                            {doctor.specialization && (
                              <span className="text-muted-foreground ml-2">
                                ({getSpecializationName(doctor.specialization)})
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="assignment-type">Тип назначения</Label>
                    <Select
                      value={assignmentType}
                      onValueChange={(value) => setAssignmentType(value as AssignmentType)}
                    >
                      <SelectTrigger id="assignment-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="primary">Основной врач</SelectItem>
                        <SelectItem value="consultant">Консультант</SelectItem>
                        <SelectItem value="group_therapist">Групповой терапевт</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={handleAssign}
                    disabled={isAssigning || !selectedDoctorId}
                  >
                    {isAssigning && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    <UserPlus className="w-4 h-4 mr-2" />
                    Назначить
                  </Button>
                </div>
              </div>
            )}

            {unassignedDoctors.length === 0 && assignments.length > 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Все доступные врачи уже назначены
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

