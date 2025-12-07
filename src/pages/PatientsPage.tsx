import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Plus, RefreshCw, Search, Mail, Phone, FileText, Pencil, Trash2, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { useAuth } from "@/contexts/AuthContext";
import { getPatients, searchPatients, deletePatient, type DecryptedPatient } from "@/lib/supabase-patients";
import { getPatientDocumentCounts } from "@/lib/supabase-patients";
import { formatRelativeTime } from "@/lib/date-utils";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface PatientWithDocuments extends DecryptedPatient {
  documentCount: number;
}

const PatientsPage = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [patients, setPatients] = useState<PatientWithDocuments[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<PatientWithDocuments[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deletingPatientId, setDeletingPatientId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Load patients from database
  const loadPatients = useCallback(async () => {
    if (!profile?.clinic_id) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const { data, error } = await getPatients();

      if (error) {
        toast({
          title: "Ошибка",
          description: `Не удалось загрузить пациентов: ${error.message}`,
          variant: "destructive",
        });
        return;
      }

      if (!data) {
        setPatients([]);
        setFilteredPatients([]);
        return;
      }

      // Get document counts for all patients
      const patientIds = data.map((p) => p.id);
      const documentCounts = await getPatientDocumentCounts(patientIds);

      // Combine patient data with document counts
      const patientsWithDocs: PatientWithDocuments[] = data.map((patient) => ({
        ...patient,
        documentCount: documentCounts[patient.id] || 0,
      }));

      setPatients(patientsWithDocs);
      setFilteredPatients(patientsWithDocs);
    } catch (error) {
      console.error("Error loading patients:", error);
      toast({
        title: "Ошибка",
        description: "Произошла ошибка при загрузке пациентов",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [profile?.clinic_id, toast]);

  // Initial load
  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  // Search functionality - search across all patient fields
  useEffect(() => {
    const performSearch = async () => {
      if (!searchQuery.trim()) {
        setFilteredPatients(patients);
        return;
      }

      setIsLoading(true);
      try {
        const { data, error } = await searchPatients(searchQuery);

        if (error) {
          toast({
            title: "Ошибка поиска",
            description: error.message,
            variant: "destructive",
          });
          setFilteredPatients(patients);
          return;
        }

        if (!data) {
          setFilteredPatients([]);
          return;
        }

        // Get document counts for filtered patients
        const patientIds = data.map((p) => p.id);
        const documentCounts = await getPatientDocumentCounts(patientIds);

        const patientsWithDocs: PatientWithDocuments[] = data.map((patient) => ({
          ...patient,
          documentCount: documentCounts[patient.id] || 0,
        }));

        setFilteredPatients(patientsWithDocs);
      } catch (error) {
        console.error("Error searching patients:", error);
        setFilteredPatients(patients);
      } finally {
        setIsLoading(false);
      }
    };

    // Debounce search
    const timeoutId = setTimeout(performSearch, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, patients, toast]);

  // Handle refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadPatients();
    setIsRefreshing(false);
    toast({
      title: "Обновлено",
      description: "Список пациентов обновлен",
    });
  };

  // Handle row click - navigate to patient detail
  const handleRowClick = (patientId: string) => {
    navigate(`/patients/${patientId}`);
  };

  // Handle delete
  const handleDeleteClick = (e: React.MouseEvent, patientId: string) => {
    e.stopPropagation(); // Prevent row click
    setDeletingPatientId(patientId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingPatientId) return;

    try {
      const { success, error } = await deletePatient(deletingPatientId);

      if (error || !success) {
        toast({
          title: "Ошибка",
          description: error?.message || "Не удалось удалить пациента",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Успешно",
        description: "Пациент удален",
      });

      // Reload patients
      await loadPatients();
    } catch (error) {
      console.error("Error deleting patient:", error);
      toast({
        title: "Ошибка",
        description: "Произошла ошибка при удалении пациента",
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setDeletingPatientId(null);
    }
  };

  // Handle edit click
  const handleEditClick = (e: React.MouseEvent, patientId: string) => {
    e.stopPropagation(); // Prevent row click
    navigate(`/patients/${patientId}?edit=true`);
  };

  return (
    <>
      <Header title="Пациенты" icon={<Users className="w-5 h-5" />} />
      <div className="flex-1 p-6 overflow-auto">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Пациенты</h1>
            <p className="text-muted-foreground">Управление пациентами</p>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              className="gap-2"
              onClick={() => navigate("/patients/new")}
            >
              <Plus className="w-4 h-4" />
              Новый пациент
            </Button>
            <Button 
              variant="outline" 
              className="gap-2"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
              Обновить активность
            </Button>
          </div>
        </div>
        
        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по всем данным пациента (имя, email, телефон, адрес, заметки...)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 max-w-md"
          />
        </div>
        
        {/* Table */}
        <div className="bg-card rounded-lg border border-border">
          {isLoading && filteredPatients.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredPatients.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              {searchQuery ? "Пациенты не найдены" : "Нет пациентов"}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Имя</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Телефон</TableHead>
                    <TableHead>Последняя активность</TableHead>
                    <TableHead>Документы</TableHead>
                    <TableHead>Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPatients.map((patient) => (
                    <TableRow
                      key={patient.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleRowClick(patient.id)}
                    >
                      <TableCell className="font-medium">{patient.name || "—"}</TableCell>
                      <TableCell>
                        {patient.email ? (
                          <a
                            href={`mailto:${patient.email}`}
                            className="text-primary hover:underline flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Mail className="w-4 h-4" />
                            {patient.email}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{patient.phone || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatRelativeTime(patient.last_activity_at)}
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <FileText className="w-4 h-4" />
                          {patient.documentCount}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <button
                            className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground"
                            onClick={(e) => handleEditClick(e, patient.id)}
                            title="Редактировать"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-destructive"
                            onClick={(e) => handleDeleteClick(e, patient.id)}
                            title="Удалить"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
          
          {/* Table footer */}
          <div className="p-4 border-t border-border text-center text-sm text-muted-foreground">
            {searchQuery 
              ? `Найдено: ${filteredPatients.length} ${filteredPatients.length === 1 ? 'пациент' : filteredPatients.length < 5 ? 'пациента' : 'пациентов'}`
              : `Всего: ${patients.length} ${patients.length === 1 ? 'пациент' : patients.length < 5 ? 'пациента' : 'пациентов'}`
            }
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить пациента?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Все данные пациента будут удалены.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingPatientId(null)}>
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default PatientsPage;