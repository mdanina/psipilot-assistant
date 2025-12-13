import { ScrollArea } from '@/components/ui/scroll-area';
import { SectionItem } from './SectionItem';
import type { GeneratedClinicalNote } from '@/types/ai.types';

interface SectionsListProps {
  clinicalNote: GeneratedClinicalNote;
  onUpdate: () => void;
}

/**
 * Список секций клинической заметки
 */
export function SectionsList({ clinicalNote, onUpdate }: SectionsListProps) {
  const sections = clinicalNote.sections || [];

  if (sections.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-sm text-muted-foreground">
          Нет секций в этой заметке
        </p>
      </div>
    );
  }

  // Сортируем секции по position
  const sortedSections = [...sections].sort((a, b) => a.position - b.position);

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-4">
        {sortedSections.map((section) => (
          <SectionItem
            key={section.id}
            section={section}
            onUpdate={onUpdate}
          />
        ))}
      </div>
    </ScrollArea>
  );
}




