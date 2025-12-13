import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, RefreshCw, Search, Mail, Phone, FileText, Pencil, Trash2, Loader2 } from "lucide-react";
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
import { usePatients, useSearchPatients, useDeletePatient, type PatientWithDocuments } from "@/hooks/usePatients";
import { formatRelativeTime } from "@/lib/date-utils";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const PatientsPage = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState("");
  const [deletingPatientId, setDeletingPatientId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // React Query hooks for data fetching with automatic caching
  const { 
    data: patients = [], 
    isLoading: isLoadingPatients, 
    error: patientsError,
    refetch: refetchPatients,
    isRefetching: isRefreshing
  } = usePatients();

  const { 
    data: searchResults = [], 
    isLoading: isLoadingSearch 
  } = useSearchPatients(searchQuery);

  const deletePatientMutation = useDeletePatient();

  // Show error if patients query failed
  useEffect(() => {
    if (patientsError) {
      toast({
        title: "Ошибка",
        description: `Не удалось загрузить пациентов: ${patientsError.message}`,
        variant: "destructive",
      });
    }
  }, [patientsError, toast]);

  // Determine which patients to display (search results or all patients)
  const filteredPatients = useMemo(() => {
    if (searchQuery.trim()) {
      return searchResults;
    }
    return patients;
  }, [searchQuery, searchResults, patients]);

  // Combined loading state
  const isLoading = isLoadingPatients || (searchQuery.trim() ? isLoadingSearch : false);

  // Handle refresh
  const handleRefresh = async () => {
    await refetchPatients();
    toast({
      title: "Обновлено",
      description: "Список пациентов обновлен",
    });
  };

  // Handle row click - navigate to patient detail page
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

    deletePatientMutation.mutate(deletingPatientId, {
      onSuccess: () => {
        toast({
          title: "Успешно",
          description: "Пациент удален",
        });
        setDeleteDialogOpen(false);
        setDeletingPatientId(null);
        // Cache will be automatically invalidated by useDeletePatient hook
      },
      onError: (error: Error) => {
        toast({
          title: "Ошибка",
          description: error.message || "Не удалось удалить пациента",
          variant: "destructive",
        });
        setDeleteDialogOpen(false);
        setDeletingPatientId(null);
      },
    });
  };

  // Handle edit click
  const handleEditClick = (e: React.MouseEvent, patientId: string) => {
    e.stopPropagation(); // Prevent row click
    navigate(`/patients/${patientId}?edit=true`);
  };

  return (
    <>
      <div className="flex-1 p-4 md:p-6 overflow-auto">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <p className="text-muted-foreground">Управление пациентами</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <Button
              className="gap-2"
              onClick={() => navigate("/patients/new")}
            >
              <Plus className="w-4 h-4" />
              <span className="sm:inline">Новый пациент</span>
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
              <span className="hidden sm:inline">Обновить активность</span>
              <span className="sm:hidden">Обновить</span>
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Поиск пациентов..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 w-full md:max-w-md"
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Имя</TableHead>
                    <TableHead className="hidden sm:table-cell">Email</TableHead>
                    <TableHead className="hidden md:table-cell">Телефон</TableHead>
                    <TableHead className="hidden lg:table-cell">Последняя активность</TableHead>
                    <TableHead className="hidden md:table-cell">Документы</TableHead>
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
                      <TableCell className="font-medium">
                        <div>{patient.name || "—"}</div>
                        {/* Show email/phone on mobile under name */}
                        <div className="sm:hidden text-xs text-muted-foreground mt-1">
                          {patient.email || patient.phone || "—"}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {patient.email ? (
                          <a
                            href={`mailto:${patient.email}`}
                            className="text-primary hover:underline flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Mail className="w-4 h-4" />
                            <span className="hidden lg:inline">{patient.email}</span>
                            <span className="lg:hidden">Email</span>
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{patient.phone || "—"}</TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground">
                        {formatRelativeTime(patient.last_activity_at)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <FileText className="w-4 h-4" />
                          {patient.documentCount}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 sm:gap-2">
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
            </div>
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
              Это действие нельзя отменить. Пациент будет удален.
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
