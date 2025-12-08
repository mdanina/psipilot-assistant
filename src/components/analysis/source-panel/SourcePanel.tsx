import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TranscriptView } from './TranscriptView';
import { NotesView } from './NotesView';
import { FilesView } from './FilesView';
import type { Database } from '@/types/database.types';

type Session = Database['public']['Tables']['sessions']['Row'];

interface SourcePanelProps {
  sessionId: string;
  session: Session;
}

/**
 * Панель источников данных для анализа
 * Содержит вкладки: Транскрипт, Заметки, Файлы
 */
export function SourcePanel({ sessionId, session }: SourcePanelProps) {
  const [activeTab, setActiveTab] = useState('transcript');

  return (
    <div className="h-full flex flex-col border-r bg-muted/30">
      <div className="border-b px-4 py-3">
        <h2 className="text-lg font-semibold">Источники данных</h2>
        <p className="text-sm text-muted-foreground">
          Выберите источник для анализа
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-4 mt-4">
          <TabsTrigger value="transcript">Транскрипт</TabsTrigger>
          <TabsTrigger value="notes">Заметки</TabsTrigger>
          <TabsTrigger value="files">Файлы</TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-hidden">
          <TabsContent value="transcript" className="h-full m-0 mt-4">
            <TranscriptView sessionId={sessionId} />
          </TabsContent>

          <TabsContent value="notes" className="h-full m-0 mt-4">
            <NotesView sessionId={sessionId} />
          </TabsContent>

          <TabsContent value="files" className="h-full m-0 mt-4">
            <FilesView sessionId={sessionId} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
