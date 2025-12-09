import { FileText } from 'lucide-react';
import type { GeneratedClinicalNote } from '@/types/ai.types';

interface ClinicalNoteViewProps {
  clinicalNote: GeneratedClinicalNote;
}

/**
 * Компонент для просмотра полной клинической заметки
 * Показывает все секции как единый документ
 */
export function ClinicalNoteView({ clinicalNote }: ClinicalNoteViewProps) {
  const sections = clinicalNote.sections || [];
  const sortedSections = [...sections].sort((a, b) => a.position - b.position);

  // Filter out sections with no content
  const sectionsWithContent = sortedSections.filter(
    section => section.content || section.ai_content
  );

  if (sectionsWithContent.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <FileText className="w-8 h-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">
          Нет содержимого в этой заметке
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Template name as subtitle if available */}
      {clinicalNote.template && (
        <p className="text-xs text-muted-foreground">
          Шаблон: {clinicalNote.template.name}
        </p>
      )}

      {/* All sections as unified document */}
      <div className="space-y-4">
        {sectionsWithContent.map((section) => (
          <div key={section.id}>
            {/* Section title */}
            <h4 className="font-medium text-sm text-foreground mb-1">
              {section.name}
            </h4>
            {/* Section content */}
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {section.content || section.ai_content}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
