/**
 * BackgroundUploadIndicator - shows status of background uploads
 *
 * Displays a small indicator when uploads are in progress.
 * Can be placed in the header or sidebar.
 */

import { Loader2, Upload, CheckCircle, XCircle } from "lucide-react";
import { useBackgroundUpload } from "@/contexts/BackgroundUploadContext";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

export function BackgroundUploadIndicator() {
  const { pendingUploads, hasActiveUploads } = useBackgroundUpload();

  if (pendingUploads.size === 0) {
    return null;
  }

  const uploads = Array.from(pendingUploads.values());
  const activeCount = uploads.filter(
    u => u.status === 'queued' || u.status === 'uploading' || u.status === 'transcribing'
  ).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative gap-2"
        >
          {hasActiveUploads ? (
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          ) : (
            <Upload className="w-4 h-4 text-muted-foreground" />
          )}
          {activeCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(320px,calc(100vw-2rem))]" align="end">
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Фоновые загрузки</h4>
          {uploads.map(upload => (
            <div key={upload.id} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground truncate max-w-[200px]">
                  Запись {new Date(upload.createdAt).toLocaleTimeString('ru-RU')}
                </span>
                <span className="flex items-center gap-1">
                  {upload.status === 'queued' && (
                    <span className="text-muted-foreground">В очереди</span>
                  )}
                  {upload.status === 'uploading' && (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span className="text-primary">Загрузка</span>
                    </>
                  )}
                  {upload.status === 'transcribing' && (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span className="text-primary">Транскрипция</span>
                    </>
                  )}
                  {upload.status === 'completed' && (
                    <>
                      <CheckCircle className="w-3 h-3 text-success" />
                      <span className="text-success">Готово</span>
                    </>
                  )}
                  {upload.status === 'failed' && (
                    <>
                      <XCircle className="w-3 h-3 text-destructive" />
                      <span className="text-destructive">Ошибка</span>
                    </>
                  )}
                </span>
              </div>
              {(upload.status === 'uploading' || upload.status === 'transcribing') && upload.progress !== undefined && (
                <Progress value={upload.progress} className="h-1" />
              )}
              {upload.status === 'failed' && upload.error && (
                <p className="text-xs text-destructive">{upload.error}</p>
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
