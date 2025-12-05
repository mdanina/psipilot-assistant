import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

const SESSION_TIMEOUT = 15 * 60 * 1000; // 15 minutes
const WARNING_TIME = 2 * 60 * 1000; // 2 minutes before timeout

export function SessionTimeoutWarning() {
  const { isAuthenticated, lastActivity, updateActivity, signOut } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);

  useEffect(() => {
    // Early return if not authenticated - no need to set up any intervals
    if (!isAuthenticated) {
      if (showWarning) setShowWarning(false);
      return;
    }

    const checkTimeout = () => {
      const now = Date.now();
      const timeSinceActivity = now - lastActivity;
      const timeUntilTimeout = SESSION_TIMEOUT - timeSinceActivity;

      if (timeUntilTimeout <= WARNING_TIME && timeUntilTimeout > 0) {
        setShowWarning(true);
        setTimeRemaining(Math.ceil(timeUntilTimeout / 1000)); // Convert to seconds
      } else if (timeUntilTimeout <= 0) {
        // Timeout reached, will be handled by AuthContext
        setShowWarning(false);
      } else {
        setShowWarning(false);
      }
    };

    // Check immediately
    checkTimeout();

    // Check every second when warning is shown, otherwise every 10 seconds
    const interval = setInterval(checkTimeout, showWarning ? 1000 : 10000);

    return () => clearInterval(interval);
  }, [isAuthenticated, lastActivity, showWarning]);

  const handleContinue = () => {
    updateActivity();
    setShowWarning(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!showWarning || !isAuthenticated) {
    return null;
  }

  return (
    <Dialog open={showWarning} onOpenChange={setShowWarning}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <DialogTitle>Сессия скоро истечет</DialogTitle>
          </div>
          <DialogDescription>
            Вы неактивны уже некоторое время. Ваша сессия будет автоматически завершена через{' '}
            <strong>{formatTime(timeRemaining)}</strong> для безопасности.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => signOut()}>
            Выйти сейчас
          </Button>
          <Button onClick={handleContinue}>Продолжить работу</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

