import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { getPatients, searchPatients, type DecryptedPatient } from "@/lib/supabase-patients";
import { useToast } from "@/hooks/use-toast";

const PatientsPage = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const { toast } = useToast();

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1); // Reset to first page on new search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch patients with pagination
  const {
    data: patientsData,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['patients', currentPage, debouncedSearch],
    queryFn: async () => {
      if (debouncedSearch) {
        // Search mode - returns all matching patients
        const result = await searchPatients(debouncedSearch);
        if (result.error) throw result.error;
        return {
          patients: result.data || [],
          pagination: null,
        };
      } else {
        // Paginated mode
        const result = await getPatients({ page: currentPage, pageSize: 10 });
        if (result.error) throw result.error;
        return {
          patients: result.data || [],
          pagination: result.pagination,
        };
      }
    },
    staleTime: 30000, // 30 seconds
  });

  const patients = patientsData?.patients || [];
  const pagination = patientsData?.pagination;

  const handleRefresh = useCallback(() => {
    refetch();
    toast({
      title: "Обновление",
      description: "Список пациентов обновлён",
    });
  }, [refetch, toast]);

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  };

  const handleNextPage = () => {
    if (pagination?.hasMore) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const formatLastActivity = (date: string | null) => {
    if (!date) return "—";
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return `сегодня в ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
      return `вчера в ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  };

  return (
    <>
      <Header title="Пациенты" icon={<Users className="w-5 h-5" />} />
      <div className="flex-1 p-6 overflow-auto">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Пациенты</h1>
            <p className="text-muted-foreground">
              {pagination ? `Всего: ${pagination.totalCount}` : 'Управление пациентами'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Новый пациент
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={handleRefresh}
              disabled={isFetching}
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
              Обновить
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по имени, email или телефону..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 max-w-md"
          />
        </div>

        {/* Error state */}
        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-6">
            <p className="text-destructive">
              Ошибка загрузки: {error instanceof Error ? error.message : 'Неизвестная ошибка'}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">
              Попробовать снова
            </Button>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">Загрузка пациентов...</span>
          </div>
        )}

        {/* Table */}
        {!isLoading && !error && (
          <div className="bg-card rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Имя</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Телефон</TableHead>
                  <TableHead>Последняя активность</TableHead>
                  <TableHead>Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      {debouncedSearch
                        ? 'Пациенты не найдены'
                        : 'Нет пациентов. Добавьте первого пациента.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  patients.map((patient: DecryptedPatient) => (
                    <TableRow key={patient.id}>
                      <TableCell className="font-medium">{patient.name || '—'}</TableCell>
                      <TableCell>
                        {patient.email ? (
                          <a href={`mailto:${patient.email}`} className="text-primary hover:underline flex items-center gap-1">
                            <Mail className="w-4 h-4" />
                            {patient.email}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {patient.phone ? (
                          <span className="flex items-center gap-1">
                            <Phone className="w-4 h-4 text-muted-foreground" />
                            {patient.phone}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatLastActivity(patient.updated_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <button className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {/* Table footer */}
            <div className="p-4 border-t border-border text-center text-sm text-muted-foreground">
              {pagination
                ? `Страница ${pagination.page} из ${pagination.totalPages}`
                : debouncedSearch
                  ? `Найдено: ${patients.length}`
                  : 'Список пациентов'}
            </div>
          </div>
        )}

        {/* Pagination */}
        {pagination && !debouncedSearch && (
          <div className="flex items-center justify-end gap-2 mt-4">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1"
              onClick={handlePreviousPage}
              disabled={currentPage <= 1 || isFetching}
            >
              <ChevronLeft className="w-4 h-4" />
              Назад
            </Button>
            <span className="px-3 py-1 bg-muted rounded text-sm">
              {pagination.page}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1"
              onClick={handleNextPage}
              disabled={!pagination.hasMore || isFetching}
            >
              Вперёд
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </>
  );
};

export default PatientsPage;
