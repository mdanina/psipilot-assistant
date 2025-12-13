import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { SourcePanel } from './source-panel/SourcePanel';
import { OutputPanel } from './output-panel/OutputPanel';
import type { Database } from '@/types/database.types';
import type { GeneratedClinicalNote } from '@/types/ai.types';

type Session = Database['public']['Tables']['sessions']['Row'];

interface AnalysisLayoutProps {
  sessionId: string;
  session: Session;
  clinicalNotes: GeneratedClinicalNote[];
  onNotesUpdate: () => void;
}

/**
 * 2-колоночный layout для AI-анализа сессии
 * Левая колонка: источники (транскрипт, заметки)
 * Правая колонка: результат (секции, редактор)
 */
export function AnalysisLayout({
  sessionId,
  session,
  clinicalNotes,
  onNotesUpdate,
}: AnalysisLayoutProps) {
  return (
    <div className="flex-1 overflow-hidden">
      <ResizablePanelGroup direction="horizontal" className="h-full">
        {/* Левая колонка - Источники */}
        <ResizablePanel defaultSize={40} minSize={30} maxSize={60}>
          <SourcePanel sessionId={sessionId} session={session} />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Правая колонка - Результат */}
        <ResizablePanel defaultSize={60} minSize={40}>
          <OutputPanel
            sessionId={sessionId}
            session={session}
            clinicalNotes={clinicalNotes}
            onNotesUpdate={onNotesUpdate}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}




