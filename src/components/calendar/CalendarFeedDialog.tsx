import { useState } from 'react';
import { Calendar, Copy, RefreshCw, Trash2, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  generateCalendarFeedToken,
  revokeCalendarFeedToken,
  type CalendarFeedToken,
} from '@/lib/calendar-feed';

interface CalendarFeedDialogProps {
  triggerClassName?: string;
}

export function CalendarFeedDialog({ triggerClassName }: CalendarFeedDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedData, setFeedData] = useState<CalendarFeedToken | null>(null);
  const { toast } = useToast();

  const handleGenerateToken = async () => {
    setLoading(true);
    try {
      const data = await generateCalendarFeedToken();
      setFeedData(data);
      toast({
        title: 'Успешно',
        description: 'Ссылка на календарь создана',
      });
    } catch (error) {
      toast({
        title: 'Ошибка',
        description: error instanceof Error ? error.message : 'Не удалось создать ссылку',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyUrl = async () => {
    if (!feedData?.feedUrl) return;

    try {
      await navigator.clipboard.writeText(feedData.feedUrl);
      toast({
        title: 'Скопировано',
        description: 'Ссылка скопирована в буфер обмена',
      });
    } catch {
      toast({
        title: 'Ошибка',
        description: 'Не удалось скопировать ссылку',
        variant: 'destructive',
      });
    }
  };

  const handleRevokeToken = async () => {
    setLoading(true);
    try {
      await revokeCalendarFeedToken();
      setFeedData(null);
      toast({
        title: 'Успешно',
        description: 'Ссылка на календарь удалена',
      });
    } catch (error) {
      toast({
        title: 'Ошибка',
        description: error instanceof Error ? error.message : 'Не удалось удалить ссылку',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className={triggerClassName}>
          <Calendar className="w-4 h-4 mr-2" />
          Подписка на календарь
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Подписка на календарь</DialogTitle>
          <DialogDescription>
            Добавьте ваши сессии в Google Calendar, Apple Calendar или любое другое приложение календаря.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="text-sm">
                <p className="font-medium mb-1">Google Календарь</p>
                <p className="text-muted-foreground text-xs">
                  Другие календари &rarr; + &rarr; По URL
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="text-sm">
                <p className="font-medium mb-1">Apple Календарь</p>
                <p className="text-muted-foreground text-xs">
                  Файл &rarr; Новая подписка на календарь...
                </p>
              </div>
            </div>
          </div>

          {feedData ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={feedData.feedUrl}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyUrl}
                  title="Копировать ссылку"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleGenerateToken}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Обновить ссылку
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleRevokeToken}
                  disabled={loading}
                  title="Удалить ссылку"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <Button
              className="w-full"
              onClick={handleGenerateToken}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Calendar className="h-4 w-4 mr-2" />
              )}
              Создать ссылку для подписки
            </Button>
          )}

          <p className="text-xs text-muted-foreground">
            Календарь будет автоматически обновляться при изменении ваших сессий.
            Не передавайте эту ссылку третьим лицам.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
