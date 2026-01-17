import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ClinicalNoteTemplate } from '@/types/ai.types';

interface TemplateSelectorProps {
  templates: ClinicalNoteTemplate[];
  selectedTemplateId: string | null;
  onSelect: (templateId: string) => void;
}

/**
 * Компонент выбора шаблона клинической заметки
 */
export function TemplateSelector({
  templates,
  selectedTemplateId,
  onSelect,
}: TemplateSelectorProps) {
  if (templates.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        Нет доступных шаблонов
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Шаблон заметки</label>
      <Select
        value={selectedTemplateId || undefined}
        onValueChange={onSelect}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Выберите шаблон" />
        </SelectTrigger>
        <SelectContent>
          {templates.map((template) => (
            <SelectItem key={template.id} value={template.id}>
              <div className="flex flex-col">
                <span>{template.name}</span>
                {template.description && (
                  <span className="text-xs text-muted-foreground">
                    {template.description}
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}






