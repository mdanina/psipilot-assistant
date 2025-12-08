import { useState, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';
import { getGenerationStatus } from '@/lib/supabase-ai';
import type { GenerationProgress as GenerationProgressType } from '@/types/ai.types';

interface GenerationProgressProps {
  clinicalNoteId: string;
  onComplete?: () => void;
}

/**
 * Компонент для отображения прогресса генерации клинической заметки
 */
export function GenerationProgress({
  clinicalNoteId,
  onComplete,
}: GenerationProgressProps) {
  const [progress, setProgress] = useState<GenerationProgressType | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  useEffect(() => {
    if (!clinicalNoteId) return;

    // Начинаем polling, если статус "generating"
    const pollStatus = async () => {
      try {
        const status = await getGenerationStatus(clinicalNoteId);
        setProgress(status);

        // Если генерация завершена, останавливаем polling
        if (status.status === 'completed' || status.status === 'failed') {
          setIsPolling(false);
          if (status.status === 'completed' && onComplete) {
            onComplete();
          }
        } else {
          // Продолжаем polling
          setIsPolling(true);
        }
      } catch (error) {
        console.error('Error fetching generation status:', error);
        // Не останавливаем polling при временных ошибках сети
        const errorMessage = error instanceof Error ? error.message : '';
        if (!errorMessage.includes('network') && !errorMessage.includes('fetch')) {
          setIsPolling(false);
        }
      }
    };

    // Первоначальная загрузка
    pollStatus();

    // Polling каждые 2 секунды, если генерация в процессе
    const interval = setInterval(() => {
      if (isPolling || progress?.status === 'generating') {
        pollStatus();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [clinicalNoteId, isPolling, progress?.status, onComplete]);

  if (!progress || progress.status === 'draft') {
    return null;
  }

  const progressPercent =
    progress.progress.total > 0
      ? (progress.progress.completed / progress.progress.total) * 100
      : 0;

  const getStatusBadge = () => {
    switch (progress.status) {
      case 'generating':
        return (
          <Badge variant="secondary" className="gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Генерация...
          </Badge>
        );
      case 'completed':
        return (
          <Badge variant="default" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Завершено
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            Ошибка
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            Ожидание
          </Badge>
        );
    }
  };

  return (
    <div className="border-b px-6 py-4 bg-muted/30 animate-in slide-in-from-top duration-300">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {getStatusBadge()}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {progress.progress.completed} / {progress.progress.total}
            </span>
            <span className="text-sm text-muted-foreground">секций</span>
          </div>
        </div>
        {progress.progress.failed > 0 && (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            Ошибок: {progress.progress.failed}
          </Badge>
        )}
      </div>
      <div className="space-y-1">
        <Progress 
          value={progressPercent} 
          className="h-2 transition-all duration-500 ease-out" 
        />
        {progress.status === 'generating' && (
          <p className="text-xs text-muted-foreground animate-pulse">
            Генерация секций в процессе...
          </p>
        )}
      </div>
      
      {/* Детали по секциям (если есть ошибки) */}
      {progress.progress.failed > 0 && progress.sections && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs font-medium text-destructive mb-2">Секции с ошибками:</p>
          <div className="space-y-1">
            {progress.sections
              .filter(s => s.status === 'failed')
              .map((section) => (
                <div key={section.id} className="text-xs text-destructive/80">
                  • {section.name}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
