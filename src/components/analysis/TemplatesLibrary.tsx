import { useState, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, GripVertical, Plus, X } from 'lucide-react';
import { getBlockTemplates, getNoteTemplates, updateNoteTemplateBlockOrder, removeBlockFromTemplate } from '@/lib/supabase-ai';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { AddBlockDialog } from './AddBlockDialog';
import { CreateTemplateDialog } from './CreateTemplateDialog';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { NoteBlockTemplate, ClinicalNoteTemplate } from '@/types/ai.types';

interface TemplatesLibraryProps {
  selectedTemplateId: string | null;
  onTemplateSelect: (templateId: string) => void;
}

/**
 * Сортируемый элемент блока шаблона
 */
function SortableBlockItem({
  block,
  getStatusBadge,
  onRemove,
  templateId,
  onError,
  canEdit,
}: {
  block: NoteBlockTemplate;
  getStatusBadge?: (block: NoteBlockTemplate) => React.ReactNode;
  onRemove?: (blockId: string) => void;
  templateId?: string;
  onError?: (error: Error) => void;
  canEdit?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleRemove = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Предотвращаем срабатывание drag
    if (!templateId || !onRemove) return;
    
    try {
      await removeBlockFromTemplate(templateId, block.id);
      onRemove(block.id);
    } catch (error) {
      console.error('Error removing block:', error);
      if (onError) {
        onError(error instanceof Error ? error : new Error('Не удалось удалить блок'));
      }
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted/50 transition-all duration-200 ${
        isDragging ? 'shadow-lg scale-105 bg-background border border-primary/30 z-50' : ''
      } ${canEdit ? 'cursor-pointer' : ''}`}
    >
      {canEdit && (
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none"
          title="Перетащите для изменения порядка"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
        </div>
      )}
      {!canEdit && (
        <div className="w-4 h-4" /> // Spacer для выравнивания
      )}
      <span className="text-sm flex-1 truncate">{block.name}</span>
      {getStatusBadge && getStatusBadge(block)}
      {canEdit && onRemove && (
        <button
          onClick={handleRemove}
          className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive p-1"
          title="Удалить блок из шаблона"
          type="button"
        >
          <X className="h-4 w-4 text-muted-foreground hover:text-destructive transition-colors" />
        </button>
      )}
    </div>
  );
}

/**
 * Библиотека секций (блоков) выбранного шаблона
 * Средняя колонка в 3-колоночном layout
 * Показывает список секций выбранного шаблона заметки
 */
export function TemplatesLibrary({
  selectedTemplateId,
  onTemplateSelect,
}: TemplatesLibraryProps) {
  const [noteTemplates, setNoteTemplates] = useState<ClinicalNoteTemplate[]>([]);
  const [blockTemplates, setBlockTemplates] = useState<NoteBlockTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isReordering, setIsReordering] = useState(false);
  const [isAddBlockDialogOpen, setIsAddBlockDialogOpen] = useState(false);
  const [isCreateTemplateDialogOpen, setIsCreateTemplateDialogOpen] = useState(false);
  const { toast } = useToast();
  const { profile } = useAuth();
  
  const isAdmin = profile?.role === 'admin';

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setIsLoading(true);
      const [notes, blocks] = await Promise.all([
        getNoteTemplates(),
        getBlockTemplates(),
      ]);
      setNoteTemplates(notes);
      setBlockTemplates(blocks);

      // Выбираем шаблон по умолчанию только если он еще не выбран
      if (notes.length > 0 && !selectedTemplateId) {
        const defaultTemplate = notes.find((t) => t.is_default) || notes[0];
        onTemplateSelect(defaultTemplate.id);
      }
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedTemplate = noteTemplates.find((t) => t.id === selectedTemplateId);
  const selectedTemplateBlocks = selectedTemplate
    ? blockTemplates
        .filter((b) => selectedTemplate.block_template_ids.includes(b.id))
        .sort((a, b) => {
          // Сортируем по порядку в block_template_ids массиве
          const indexA = selectedTemplate.block_template_ids.indexOf(a.id);
          const indexB = selectedTemplate.block_template_ids.indexOf(b.id);
          return indexA - indexB;
        })
    : [];

  // Проверяем, можно ли редактировать выбранный шаблон
  const canEditTemplate = selectedTemplate && (
    !selectedTemplate.is_system && (
      // Личный шаблон - только владелец
      (selectedTemplate.user_id && selectedTemplate.user_id === profile?.id) ||
      // Шаблон клиники - только админы
      (selectedTemplate.user_id === null && isAdmin)
    )
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id || !selectedTemplate || !canEditTemplate) {
      return;
    }

    const oldIndex = selectedTemplateBlocks.findIndex((b) => b.id === active.id);
    const newIndex = selectedTemplateBlocks.findIndex((b) => b.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    // Обновляем порядок в массиве block_template_ids
    const currentIds = [...selectedTemplate.block_template_ids];
    const [movedId] = currentIds.splice(oldIndex, 1);
    currentIds.splice(newIndex, 0, movedId);
    const newBlockIds = currentIds;

    // Обновляем локальное состояние шаблонов
    setNoteTemplates((prev) =>
      prev.map((t) =>
        t.id === selectedTemplate.id ? { ...t, block_template_ids: newBlockIds } : t
      )
    );

    // Обновляем порядок в базе данных
    try {
      setIsReordering(true);
      await updateNoteTemplateBlockOrder(selectedTemplate.id, newBlockIds);

      toast({
        title: 'Порядок обновлён',
        description: 'Блоки шаблона успешно переупорядочены',
      });
    } catch (error) {
      console.error('Error updating block order:', error);
      // Откатываем изменения при ошибке
      setNoteTemplates((prev) =>
        prev.map((t) =>
          t.id === selectedTemplate.id ? { ...t, block_template_ids: selectedTemplate.block_template_ids } : t
        )
      );
      toast({
        title: 'Ошибка',
        description: 'Не удалось обновить порядок блоков',
        variant: 'destructive',
      });
    } finally {
      setIsReordering(false);
    }
  };

  const handleBlockAdded = async () => {
    // Перезагружаем шаблоны и блоки
    await loadTemplates();
  };

  const handleTemplateCreated = async () => {
    // Перезагружаем шаблоны
    await loadTemplates();
  };

  const handleBlockRemoved = async (removedBlockId: string) => {
    if (!selectedTemplate) return;
    
    // Оптимистичное обновление - сразу обновляем локальное состояние
    const updatedBlockIds = selectedTemplate.block_template_ids.filter(
      (id: string) => id !== removedBlockId
    );
    
    setNoteTemplates((prev) =>
      prev.map((t) =>
        t.id === selectedTemplate.id 
          ? { ...t, block_template_ids: updatedBlockIds }
          : t
      )
    );

    toast({
      title: 'Блок удалён',
      description: 'Блок успешно удалён из шаблона',
    });

    // Перезагружаем шаблоны для синхронизации с БД
    await loadTemplates();
  };

  const handleBlockRemoveError = (error: Error) => {
    toast({
      title: 'Ошибка',
      description: error.message || 'Не удалось удалить блок из шаблона',
      variant: 'destructive',
    });
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col border-r bg-muted/30">
      {/* Header with template selector */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Select value={selectedTemplateId || ''} onValueChange={onTemplateSelect}>
            <SelectTrigger className="flex-1 justify-start">
              <SelectValue placeholder="Выберите шаблон" className="text-left">
                {selectedTemplate ? (
                  <div className="flex items-center gap-2 text-left w-full">
                    <span className="text-left">{selectedTemplate.name}</span>
                    {selectedTemplate.is_default && (
                      <span className="text-xs text-muted-foreground">(По умолчанию)</span>
                    )}
                  </div>
                ) : (
                  'Выберите шаблон'
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {noteTemplates.map((template) => (
                <SelectItem key={template.id} value={template.id} className="text-left">
                  <div className="flex flex-col text-left w-full">
                    <div className="flex items-center gap-2 text-left">
                      <span className="text-left">{template.name}</span>
                      {template.is_default && (
                        <span className="text-xs text-muted-foreground">(По умолчанию)</span>
                      )}
                    </div>
                    {template.description && (
                      <span className="text-xs text-muted-foreground mt-0.5 text-left">
                        {template.description}
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button 
            size="sm" 
            variant="outline" 
            className="h-8 w-8 p-0"
            onClick={() => setIsCreateTemplateDialogOpen(true)}
            title="Создать новый шаблон"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Sections list */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="flex-1">
          <div className="p-2">
            {selectedTemplate ? (
              <>
                {selectedTemplateBlocks.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Нет секций в выбранном шаблоне
                  </p>
                ) : (
                  <>
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={selectedTemplateBlocks.map((b) => b.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-1">
                          {selectedTemplateBlocks.map((block) => (
                            <SortableBlockItem 
                              key={block.id} 
                              block={block}
                              onRemove={canEditTemplate ? handleBlockRemoved : undefined}
                              onError={handleBlockRemoveError}
                              templateId={selectedTemplate?.id}
                              canEdit={canEditTemplate}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                    {canEditTemplate && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full mt-2 justify-start text-muted-foreground hover:text-foreground"
                        disabled={isReordering}
                        onClick={() => setIsAddBlockDialogOpen(true)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        New section
                      </Button>
                    )}
                  </>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  Выберите шаблон заметки, чтобы увидеть секции
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Диалоги */}
      {selectedTemplate && (
        <AddBlockDialog
          open={isAddBlockDialogOpen}
          onOpenChange={setIsAddBlockDialogOpen}
          templateId={selectedTemplate.id}
          existingBlockIds={selectedTemplate.block_template_ids}
          onBlockAdded={handleBlockAdded}
        />
      )}

      <CreateTemplateDialog
        open={isCreateTemplateDialogOpen}
        onOpenChange={setIsCreateTemplateDialogOpen}
        onTemplateCreated={handleTemplateCreated}
      />
    </div>
  );
}

