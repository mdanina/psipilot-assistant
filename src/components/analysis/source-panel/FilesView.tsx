import { FileText } from 'lucide-react';

interface FilesViewProps {
  sessionId: string;
}

/**
 * Компонент для отображения загруженных файлов
 * TODO: Реализовать после добавления функционала загрузки файлов
 */
export function FilesView({ sessionId }: FilesViewProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <FileText className="h-12 w-12 text-muted-foreground mb-4" />
      <p className="text-sm text-muted-foreground">
        Функционал загрузки файлов будет добавлен позже
      </p>
    </div>
  );
}
