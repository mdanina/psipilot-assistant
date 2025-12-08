import { useState, useEffect, useRef } from "react";
import {
  Upload,
  Download,
  FileText,
  Loader2,
  X,
  Plus,
} from "lucide-react";
import {
  getPatientDocuments,
  uploadPatientDocument,
  getDocumentDownloadUrl,
  formatFileSize,
  getDocumentTypeLabel,
  deleteDocument,
} from "@/lib/supabase-documents";
import { formatDateTime } from "@/lib/date-utils";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
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
import type { Database } from "@/types/database.types";

type Document = Database["public"]["Tables"]["documents"]["Row"];

interface PatientDocumentsTabProps {
  patientId: string;
}

export function PatientDocumentsTab({
  patientId,
}: PatientDocumentsTabProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    loadDocuments();
  }, [patientId]);

  const loadDocuments = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await getPatientDocuments(patientId);

      if (error) {
        toast({
          title: "Ошибка",
          description: `Не удалось загрузить документы: ${error.message}`,
          variant: "destructive",
        });
        return;
      }

      setDocuments(data || []);
    } catch (error) {
      console.error("Error loading documents:", error);
      toast({
        title: "Ошибка",
        description: "Произошла ошибка при загрузке документов",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const { data, error } = await uploadPatientDocument(patientId, file, {
        documentType: "other",
      });

      if (error) {
        toast({
          title: "Ошибка загрузки",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      if (data) {
        toast({
          title: "Успешно",
          description: "Документ загружен",
        });
        await loadDocuments();
      }
    } catch (error) {
      console.error("Error uploading document:", error);
      toast({
        title: "Ошибка",
        description: "Произошла ошибка при загрузке документа",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDownload = async (document: Document) => {
    try {
      const { data: url, error } = await getDocumentDownloadUrl(
        document.file_path
      );

      if (error || !url) {
        toast({
          title: "Ошибка",
          description: "Не удалось получить ссылку для скачивания",
          variant: "destructive",
        });
        return;
      }

      window.open(url, "_blank");
    } catch (error) {
      console.error("Error downloading document:", error);
      toast({
        title: "Ошибка",
        description: "Произошла ошибка при скачивании документа",
        variant: "destructive",
      });
    }
  };

  const handleDeleteClick = (docId: string) => {
    setDeletingDocId(docId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingDocId) return;

    try {
      const { success, error } = await deleteDocument(deletingDocId);

      if (error || !success) {
        toast({
          title: "Ошибка",
          description: error?.message || "Не удалось удалить документ",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Успешно",
        description: "Документ удален",
      });

      await loadDocuments();
    } catch (error) {
      console.error("Error deleting document:", error);
      toast({
        title: "Ошибка",
        description: "Произошла ошибка при удалении документа",
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setDeletingDocId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Upload button */}
      <div className="flex justify-end">
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="gap-2"
        >
          {isUploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Загрузка...
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              Загрузить документ
            </>
          )}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelect}
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif"
        />
      </div>

      {/* Documents list */}
      {documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FileText className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-2">Нет документов</p>
          <p className="text-sm text-muted-foreground">
            Загрузите документы для этого пациента
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((document) => (
            <div
              key={document.id}
              className="border border-border rounded-lg p-4 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    <h3 className="font-medium truncate">
                      {document.title || document.file_name}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                      {getDocumentTypeLabel(document.document_type)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground ml-7">
                    <span>{formatFileSize(document.file_size_bytes)}</span>
                    <span>{formatDateTime(document.created_at)}</span>
                  </div>
                  {document.description && (
                    <p className="text-sm text-muted-foreground mt-2 ml-7">
                      {document.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => handleDownload(document)}
                  >
                    <Download className="w-4 h-4" />
                    Скачать
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDeleteClick(document.id)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить документ?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Документ будет удален безвозвратно.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingDocId(null)}>
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
    </div>
  );
}
