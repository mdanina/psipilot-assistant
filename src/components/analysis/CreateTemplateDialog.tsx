import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getBlockTemplates, createNoteTemplate } from '@/lib/supabase-ai';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { NoteBlockTemplate } from '@/types/ai.types';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CreateTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTemplateCreated: () => void;
}

export function CreateTemplateDialog({
  open,
  onOpenChange,
  onTemplateCreated,
}: CreateTemplateDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [isClinicTemplate, setIsClinicTemplate] = useState(false);
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [blocks, setBlocks] = useState<NoteBlockTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();
  const { profile } = useAuth();
  
  const isAdmin = profile?.role === 'admin';

  // Загружаем доступные блоки
  useEffect(() => {
    if (open) {
      loadBlocks();
    }
  }, [open]);

  // Сбрасываем форму при открытии
  useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
      setIsDefault(false);
      setIsClinicTemplate(false);
      setSelectedBlockIds([]);
    }
  }, [open]);

  const loadBlocks = async () => {
    try {
      setIsLoading(true);
      const allBlocks = await getBlockTemplates();
      setBlocks(allBlocks);
    } catch (error) {
      console.error('Error loading blocks:', error);
      toast({
        title: 'Ошибка',
        description: 'Не удалось загрузить список блоков',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleBlock = (blockId: string) => {
    setSelectedBlockIds((prev) =>
      prev.includes(blockId)
        ? prev.filter((id) => id !== blockId)
        : [...prev, blockId]
    );
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({
        title: 'Ошибка',
        description: 'Введите название шаблона',
        variant: 'destructive',
      });
      return;
    }

    if (selectedBlockIds.length === 0) {
      toast({
        title: 'Ошибка',
        description: 'Выберите хотя бы один блок',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsCreating(true);
      await createNoteTemplate(
        name.trim(),
        null, // name_en больше не используется
        description.trim() || null,
        selectedBlockIds,
        isDefault,
        isClinicTemplate
      );
      toast({
        title: 'Успешно',
        description: 'Шаблон создан',
      });
      onTemplateCreated();
      onOpenChange(false);
    } catch (error) {
      console.error('Error creating template:', error);
      toast({
        title: 'Ошибка',
        description: error instanceof Error ? error.message : 'Не удалось создать шаблон',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  // Группируем блоки по категориям
  const blocksByCategory = blocks.reduce((acc, block) => {
    const category = block.category || 'other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(block);
    return acc;
  }, {} as Record<string, NoteBlockTemplate[]>);

  const categoryLabels: Record<string, string> = {
    assessment: 'Оценка',
    history: 'История',
    treatment: 'Лечение',
    status: 'Статус',
    conclusion: 'Заключение',
    other: 'Прочее',
  };

  const selectedBlocks = blocks.filter((b) => selectedBlockIds.includes(b.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Создать новый шаблон</DialogTitle>
          <DialogDescription>
            Создайте шаблон клинической заметки, выбрав блоки из библиотеки
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Форма с названием и описанием */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Название *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например: Первичная психиатрическая оценка"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Описание</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Описание шаблона и когда его использовать"
                rows={2}
              />
            </div>
            {isAdmin && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isClinicTemplate"
                  checked={isClinicTemplate}
                  onCheckedChange={(checked) => setIsClinicTemplate(checked === true)}
                />
                <Label htmlFor="isClinicTemplate" className="cursor-pointer">
                  Шаблон клиники (доступен всем пользователям клиники)
                </Label>
              </div>
            )}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isDefault"
                checked={isDefault}
                onCheckedChange={(checked) => setIsDefault(checked === true)}
              />
              <Label htmlFor="isDefault" className="cursor-pointer">
                Установить как шаблон по умолчанию
              </Label>
            </div>
          </div>

          {/* Выбор блоков */}
          <div className="flex-1 flex gap-4 min-h-0">
            {/* Список доступных блоков с поиском */}
            <div className="flex-1 flex flex-col">
              <Label className="mb-2">Выберите блоки для шаблона</Label>
              <Command className="rounded-lg border flex-1 flex flex-col">
                <CommandInput placeholder="Поиск блоков..." />
                <CommandList className="flex-1">
                  {isLoading ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      Загрузка...
                    </div>
                  ) : blocks.length === 0 ? (
                    <CommandEmpty>Нет доступных блоков</CommandEmpty>
                  ) : (
                    Object.entries(blocksByCategory).map(([category, categoryBlocks]) => (
                      <CommandGroup key={category} heading={categoryLabels[category] || category}>
                        {categoryBlocks.map((block) => (
                          <CommandItem
                            key={block.id}
                            value={`${block.name} ${block.description || ''}`}
                            onSelect={() => toggleBlock(block.id)}
                            className="flex items-center justify-between"
                          >
                            <div className="flex flex-col">
                              <span className="font-medium">{block.name}</span>
                              {block.description && (
                                <span className="text-xs text-muted-foreground">
                                  {block.description}
                                </span>
                              )}
                            </div>
                            <Check
                              className={cn(
                                'h-4 w-4',
                                selectedBlockIds.includes(block.id) ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ))
                  )}
                </CommandList>
              </Command>
            </div>

            {/* Список выбранных блоков */}
            <div className="w-64 flex flex-col">
              <Label className="mb-2">
                Выбранные блоки ({selectedBlockIds.length})
              </Label>
              <ScrollArea className="flex-1 border rounded-lg p-2">
                {selectedBlocks.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-4">
                    Нет выбранных блоков
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedBlocks.map((block) => (
                      <div
                        key={block.id}
                        className="flex items-center justify-between p-2 bg-muted rounded-md"
                      >
                        <span className="text-sm font-medium flex-1">{block.name}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => toggleBlock(block.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleCreate} disabled={isCreating || !name.trim() || selectedBlockIds.length === 0}>
            {isCreating ? 'Создание...' : 'Создать'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

