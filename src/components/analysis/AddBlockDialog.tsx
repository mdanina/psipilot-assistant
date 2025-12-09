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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { getBlockTemplates, addBlockToTemplate } from '@/lib/supabase-ai';
import { useToast } from '@/hooks/use-toast';
import type { NoteBlockTemplate } from '@/types/ai.types';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AddBlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string;
  existingBlockIds: string[];
  onBlockAdded: () => void;
}

export function AddBlockDialog({
  open,
  onOpenChange,
  templateId,
  existingBlockIds,
  onBlockAdded,
}: AddBlockDialogProps) {
  const [blocks, setBlocks] = useState<NoteBlockTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const { toast } = useToast();

  // Загружаем доступные блоки
  useEffect(() => {
    if (open) {
      loadBlocks();
    }
  }, [open]);

  const loadBlocks = async () => {
    try {
      setIsLoading(true);
      const allBlocks = await getBlockTemplates();
      // Фильтруем блоки, которые еще не добавлены в шаблон
      const availableBlocks = allBlocks.filter(
        (block) => !existingBlockIds.includes(block.id)
      );
      setBlocks(availableBlocks);
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

  const handleAdd = async () => {
    if (!selectedBlockId) {
      toast({
        title: 'Ошибка',
        description: 'Выберите блок для добавления',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsAdding(true);
      await addBlockToTemplate(templateId, selectedBlockId);
      toast({
        title: 'Успешно',
        description: 'Блок добавлен в шаблон',
      });
      onBlockAdded();
      onOpenChange(false);
      setSelectedBlockId(null);
    } catch (error) {
      console.error('Error adding block:', error);
      toast({
        title: 'Ошибка',
        description: error instanceof Error ? error.message : 'Не удалось добавить блок',
        variant: 'destructive',
      });
    } finally {
      setIsAdding(false);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Добавить блок в шаблон</DialogTitle>
          <DialogDescription>
            Выберите блок из библиотеки для добавления в текущий шаблон
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Command className="rounded-lg border">
            <CommandInput placeholder="Поиск блоков..." />
            <CommandList>
              {isLoading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Загрузка...
                </div>
              ) : blocks.length === 0 ? (
                <CommandEmpty>Нет доступных блоков для добавления</CommandEmpty>
              ) : (
                Object.entries(blocksByCategory).map(([category, categoryBlocks]) => (
                  <CommandGroup key={category} heading={categoryLabels[category] || category}>
                    {categoryBlocks.map((block) => (
                      <CommandItem
                        key={block.id}
                        value={`${block.name} ${block.description || ''}`}
                        onSelect={() => setSelectedBlockId(block.id)}
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
                            selectedBlockId === block.id ? 'opacity-100' : 'opacity-0'
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleAdd} disabled={!selectedBlockId || isAdding}>
            {isAdding ? 'Добавление...' : 'Добавить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

