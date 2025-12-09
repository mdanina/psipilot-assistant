import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload,
  Download,
  FileText,
  Loader2,
  X,
  Plus,
  Mic,
  File,
  ExternalLink,
} from "lucide-react";
import {
  uploadPatientDocument,
  getDocumentDownloadUrl,
  formatFileSize,
  deleteDocument,
} from "@/lib/supabase-documents";
import { getPatientFiles } from "@/lib/supabase-patient-files";
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
import type { PatientFile, PatientFileType } from "@/types/patient-files";
import { getFileTypeLabel, getFileTypeColor } from "@/types/patient-files";

interface PatientDocumentsTabProps {
  patientId: string;
}

function getFileIcon(type: PatientFileType) {
  switch (type) {
    case 'transcript':
      return <Mic className="w-5 h-5 text-purple-500 flex-shrink-0" />;
    case 'note_file':
      return <File className="w-5 h-5 text-green-500 flex-shrink-0" />;
    case 'document':
    default:
      return <FileText className="w-5 h-5 text-primary flex-shrink-0" />;
  }
}

export function PatientDocumentsTab({
  patientId,
}: PatientDocumentsTabProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<PatientFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    loadFiles();
  }, [patientId]);

  const loadFiles = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await getPatientFiles(patientId);

      if (error) {
        toast({
          title: "Ошибка",
          description: `Не удалось загрузить файлы: ${error.message}`,
          variant: "destructive",
        });
        return;
      }

      // Filter: only show directly uploaded documents (not transcripts, note files, or session-linked documents)
      const uploadedDocuments = (data || []).filter(
        file => file.type === 'document' && file.source === 'direct'
      );

      setFiles(uploadedDocuments);
    } catch (error) {
      console.error("Error loading files:", error);
      toast({
        title: "Ошибка",
        description: "Произошла ошибка при загрузке файлов",
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
        await loadFiles();
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

  const handleDownload = async (file: PatientFile) => {
    if (!file.filePath) {
      toast({
        title: "Ошибка",
        description: "Файл недоступен для скачивания",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: url, error } = await getDocumentDownloadUrl(file.filePath);

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

  const handleGoToSession = (sessionId: string) => {
    navigate("/sessions", { state: { sessionId } });
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

      await loadFiles();
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
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.txt"
        />
      </div>

      {/* Files list */}
      {files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FileText className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-2">Нет файлов</p>
          <p className="text-sm text-muted-foreground">
            Загрузите документы для пациента
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {files.map((file) => (
            <div
              key={file.id}
              className="border border-border rounded-lg p-4 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    {getFileIcon(file.type)}
                    <h3 className="font-medium truncate">
                      {file.name}
                    </h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getFileTypeColor(file.type)}`}>
                      {getFileTypeLabel(file.type)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground ml-7">
                    {file.size && <span>{formatFileSize(file.size)}</span>}
                    <span>{formatDateTime(file.createdAt)}</span>
                    {file.source === 'session' && file.sessionId && (
                      <button
                        onClick={() => handleGoToSession(file.sessionId!)}
                        className="flex items-center gap-1 text-primary hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        {file.sessionTitle || 'Сессия'}
                      </button>
                    )}
                  </div>
                  {file.description && (
                    <p className="text-sm text-muted-foreground mt-2 ml-7">
                      {file.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  {/* Download button - only for documents with file path */}
                  {file.type === 'document' && file.filePath && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => handleDownload(file)}
                    >
                      <Download className="w-4 h-4" />
                      Скачать
                    </Button>
                  )}
                  {/* Go to session button - for session-linked files */}
                  {file.source === 'session' && file.sessionId && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => handleGoToSession(file.sessionId!)}
                    >
                      <ExternalLink className="w-4 h-4" />
                      К сессии
                    </Button>
                  )}
                  {/* Delete button - only for direct documents */}
                  {file.canDelete && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeleteClick(file.id)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
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
