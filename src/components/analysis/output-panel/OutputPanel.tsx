import { useState, useEffect } from 'react';
import { TemplateSelector } from './TemplateSelector';
import { SectionsList } from './SectionsList';
import { GenerateButton } from '../GenerateButton';
import { GenerationProgress } from '../GenerationProgress';
import { getNoteTemplates } from '@/lib/supabase-ai';
import { Loader2 } from 'lucide-react';
import type { Database } from '@/types/database.types';
import type { GeneratedClinicalNote, ClinicalNoteTemplate } from '@/types/ai.types';

type Session = Database['public']['Tables']['sessions']['Row'];

interface OutputPanelProps {
  sessionId: string;
  session: Session;
  clinicalNotes: GeneratedClinicalNote[];
  onNotesUpdate: () => void;
}

/**
 * Панель результата анализа
 * Содержит: выбор шаблона, список секций, кнопку генерации
 */
export function OutputPanel({
  sessionId,
  session,
  clinicalNotes,
  onNotesUpdate,
}: OutputPanelProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(
    clinicalNotes[0]?.id || null
  );
  const [templates, setTemplates] = useState<ClinicalNoteTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);

  // Загружаем шаблоны
  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setTemplatesLoading(true);
      const data = await getNoteTemplates();
      setTemplates(data);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setTemplatesLoading(false);
    }
  };

  // Обновляем активную заметку при изменении списка
  useEffect(() => {
    if (clinicalNotes.length > 0 && !activeNoteId) {
      setActiveNoteId(clinicalNotes[0].id);
    }
  }, [clinicalNotes, activeNoteId]);

  const activeNote = clinicalNotes.find((note) => note.id === activeNoteId);

  // Выбираем шаблон по умолчанию
  useEffect(() => {
    if (templates && templates.length > 0 && !selectedTemplateId) {
      const defaultTemplate = templates.find((t) => t.is_default) || templates[0];
      setSelectedTemplateId(defaultTemplate.id);
    }
  }, [templates, selectedTemplateId]);

  const selectedTemplate = templates?.find((t) => t.id === selectedTemplateId);

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Клиническая заметка</h2>
            <p className="text-sm text-muted-foreground">
              Выберите шаблон и сгенерируйте заметку
            </p>
          </div>
          {selectedTemplateId && (
            <GenerateButton
              sessionId={sessionId}
              templateId={selectedTemplateId}
              onSuccess={onNotesUpdate}
              disabled={!session.patient_id}
            />
          )}
        </div>

        {templatesLoading ? (
          <div className="text-sm text-muted-foreground">Загрузка шаблонов...</div>
        ) : (
          <TemplateSelector
            templates={templates || []}
            selectedTemplateId={selectedTemplateId}
            onSelect={setSelectedTemplateId}
          />
        )}
      </div>

      {activeNote && (
        <>
          <GenerationProgress
            clinicalNoteId={activeNote.id}
            onComplete={onNotesUpdate}
          />
          <div className="flex-1 overflow-hidden">
            <SectionsList
              clinicalNote={activeNote}
              onUpdate={onNotesUpdate}
            />
          </div>
        </>
      )}

      {!activeNote && selectedTemplate && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-4">
            <p className="text-muted-foreground">
              Нажмите "Сгенерировать заметку" для создания клинической заметки
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
