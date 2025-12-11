import { useState, useEffect } from "react";
import { AlertCircle, Download, Upload, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  deleteLocalRecording,
  downloadLocalRecording,
} from "@/lib/local-recording-storage";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface RecoveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordings: Array<{
    id: string;
    fileName: string;
    duration: number;
    createdAt: number;
    uploadError?: string;
  }>;
  onRetryUpload?: (recordingId: string) => Promise<void>;
  onRefresh?: () => Promise<void>;
}

export function RecoveryDialog({
  open,
  onOpenChange,
  recordings,
  onRetryUpload,
  onRefresh,
}: RecoveryDialogProps) {
  const { toast } = useToast();
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [uploadingIds, setUploadingIds] = useState<Set<string>>(new Set());

  const handleDownload = async (id: string, fileName: string) => {
    try {
      await downloadLocalRecording(id);
      toast({
        title: "Успешно",
        description: "Запись скачана",
      });
    } catch (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось скачать запись",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingIds(prev => new Set(prev).add(id));
    try {
      await deleteLocalRecording(id);
      if (onRefresh) {
        await onRefresh();
      }
      toast({
        title: "Успешно",
        description: "Запись удалена",
      });
    } catch (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось удалить запись",
        variant: "destructive",
      });
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleRetryUpload = async (id: string) => {
    if (!onRetryUpload) return;
    
    setUploadingIds(prev => new Set(prev).add(id));
    try {
      await onRetryUpload(id);
    } catch (error) {
      // Error handling is done in parent component
    } finally {
      setUploadingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  if (recordings.length === 0 && !open) {
    return null;
  }

  return (
    <Dialog open={open && recordings.length > 0} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-warning" />
            Не загруженные записи
          </DialogTitle>
          <DialogDescription>
            Найдено {recordings.length} {recordings.length === 1 ? 'запись' : recordings.length < 5 ? 'записи' : 'записей'}, которые не были загружены в облако.
            Вы можете скачать их локально или попробовать загрузить снова.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {recordings.map((recording) => (
            <div
              key={recording.id}
              className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{recording.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(recording.createdAt), "dd.MM.yyyy HH:mm", {
                    locale: ru,
                  })}{" "}
                  • {formatTime(recording.duration)}
                </p>
                {recording.uploadError && (
                  <p className="text-xs text-destructive mt-1 truncate" title={recording.uploadError}>
                    Ошибка: {recording.uploadError}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 ml-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload(recording.id, recording.fileName)}
                  disabled={deletingIds.has(recording.id) || uploadingIds.has(recording.id)}
                >
                  <Download className="w-4 h-4 mr-1" />
                  Скачать
                </Button>
                {onRetryUpload && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleRetryUpload(recording.id)}
                    disabled={deletingIds.has(recording.id) || uploadingIds.has(recording.id)}
                  >
                    {uploadingIds.has(recording.id) ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                        Загрузка...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-1" />
                        Загрузить
                      </>
                    )}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(recording.id)}
                  disabled={deletingIds.has(recording.id) || uploadingIds.has(recording.id)}
                  className="text-destructive hover:text-destructive"
                >
                  {deletingIds.has(recording.id) ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <X className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>

        {recordings.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p>Все записи загружены</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

