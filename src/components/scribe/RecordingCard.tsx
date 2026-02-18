import { useState, useEffect, useRef } from "react";
import { Mic, FileText, X, Pause, Play, Square, Sparkles, Loader2, Music, ChevronDown, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useTabAudioCapture } from "@/hooks/useTabAudioCapture";
import { useToast } from "@/hooks/use-toast";
import { useBackgroundUpload } from "@/contexts/BackgroundUploadContext";
import { useAuth } from "@/contexts/AuthContext";

type RecordingSource = 'microphone' | 'tab';

interface RecordingCardProps {
  /** Called when user clicks "Транскрибировать" - typically navigates to sessions */
  onGenerateNote: () => void;
  /** Called when recording starts or stops. Used for navigation blocking. */
  onRecordingStateChange?: (isRecording: boolean) => void;
  /** Session ID for SessionsPage flow (upload to existing session) */
  sessionId?: string;
  /** Patient ID for ScribePage flow (create new session) */
  patientId?: string;
}

export const RecordingCard = ({
  onGenerateNote,
  onRecordingStateChange,
  sessionId,
  patientId,
}: RecordingCardProps) => {
  // Microphone recording hook
  const {
    status: micStatus,
    recordingTime: micRecordingTime,
    error: micError,
    wasPartialSave: micWasPartialSave,
    startRecording: startMicRecording,
    pauseRecording,
    resumeRecording,
    stopRecording: stopMicRecording,
    cancelRecording: cancelMicRecording,
    reset: resetMic,
  } = useAudioRecorder();

  // Tab audio capture hook
  const {
    status: tabStatus,
    recordingTime: tabRecordingTime,
    error: tabError,
    isSupported: tabCaptureSupported,
    startCapture: startTabCapture,
    stopCapture: stopTabCapture,
    cancelCapture: cancelTabCapture,
    reset: resetTab,
  } = useTabAudioCapture();

  const { toast } = useToast();
  const { queueUpload } = useBackgroundUpload();
  const { startProtectedActivity } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recordingSource, setRecordingSource] = useState<RecordingSource | null>(null);

  // Unified state based on active recording source
  const isActiveMicRecording = micStatus === 'recording' || micStatus === 'paused';
  const isActiveTabRecording = tabStatus === 'recording';
  const isActiveRecording = isActiveMicRecording || isActiveTabRecording;
  const isPaused = micStatus === 'paused';
  const isStopping = micStatus === 'stopping' || tabStatus === 'stopping';
  const isSelecting = tabStatus === 'selecting';

  // Use appropriate recording time based on source
  const recordingTime = recordingSource === 'tab' ? tabRecordingTime : micRecordingTime;
  const currentError = recordingSource === 'tab' ? tabError : micError;

  const [completedRecording, setCompletedRecording] = useState<{
    blob: Blob;
    duration: number;
    fileName: string;
  } | null>(null);

  const shownErrorRef = useRef<string | null>(null);

  // Notify parent about recording state changes
  useEffect(() => {
    onRecordingStateChange?.(isActiveRecording);
  }, [isActiveRecording, onRecordingStateChange]);

  // Prevent session timeout while recording/capture is active.
  useEffect(() => {
    if (!isActiveRecording && !isStopping) {
      return;
    }

    const release = startProtectedActivity();
    return () => release();
  }, [isActiveRecording, isStopping, startProtectedActivity]);

  // Show errors via toast
  useEffect(() => {
    if (currentError && currentError !== shownErrorRef.current) {
      toast({
        title: "Ошибка записи",
        description: currentError,
        variant: "destructive",
      });
      shownErrorRef.current = currentError;
    }
  }, [currentError, toast]);

  // Reset error tracking on successful recording start
  useEffect(() => {
    if (micStatus === 'recording' || tabStatus === 'recording') {
      shownErrorRef.current = null;
    }
  }, [micStatus, tabStatus]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleStartMicRecording = async () => {
    try {
      setCompletedRecording(null);
      setRecordingSource('microphone');
      await startMicRecording();
    } catch (error) {
      console.error('Error starting mic recording:', error);
      setRecordingSource(null);
      toast({
        title: "Ошибка",
        description: "Не удалось начать запись с микрофона",
        variant: "destructive",
      });
    }
  };

  const handleStartTabCapture = async () => {
    if (!tabCaptureSupported) {
      toast({
        title: "Не поддерживается",
        description: "Ваш браузер не поддерживает захват звука вкладки. Используйте Chrome или Edge.",
        variant: "destructive",
      });
      return;
    }

    try {
      setCompletedRecording(null);
      setRecordingSource('tab');
      await startTabCapture();
    } catch (error) {
      console.error('Error starting tab capture:', error);
      setRecordingSource(null);
      toast({
        title: "Ошибка",
        description: "Не удалось начать захват звука вкладки",
        variant: "destructive",
      });
    }
  };

  const handleStopRecording = async () => {
    try {
      let blob: Blob | null = null;

      if (recordingSource === 'tab') {
        blob = await stopTabCapture();
      } else {
        blob = await stopMicRecording();
      }

      if (blob) {
        // Determine file extension from actual MIME type (Safari uses audio/mp4, Firefox uses audio/ogg)
        const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
        const fileName = `recording-${Date.now()}.${ext}`;
        setCompletedRecording({
          blob,
          duration: recordingTime,
          fileName,
        });
      } else {
        console.error('[RecordingCard] stopRecording returned null blob');
        toast({
          title: "Ошибка записи",
          description: "Не удалось сохранить аудио. Попробуйте записать ещё раз.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось остановить запись",
        variant: "destructive",
      });
    }
  };

  // Show warning for partial save (microphone only)
  useEffect(() => {
    if (micWasPartialSave && completedRecording && recordingSource === 'microphone') {
      toast({
        title: "Предупреждение",
        description: "Запись сохранена. Возможна потеря последних секунд из-за медленной обработки браузером.",
        variant: "default",
      });
    }
  }, [micWasPartialSave, completedRecording, recordingSource, toast]);

  const handleCancelRecording = () => {
    if (recordingSource === 'tab') {
      cancelTabCapture();
    } else {
      cancelMicRecording();
    }
    setRecordingSource(null);
    setCompletedRecording(null);
  };

  const handleRemoveRecording = () => {
    resetMic();
    resetTab();
    setRecordingSource(null);
    setCompletedRecording(null);
  };

  const handleGenerateNote = async () => {
    if (!completedRecording) {
      console.error('[RecordingCard] handleGenerateNote called without completedRecording');
      toast({
        title: "Нет записи",
        description: "Сначала запишите аудио",
        variant: "destructive",
      });
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      await queueUpload({
        blob: completedRecording.blob,
        duration: completedRecording.duration,
        sessionId,
        patientId,
      });

      setCompletedRecording(null);
      setRecordingSource(null);
      resetMic();
      resetTab();

      onGenerateNote();
    } catch (error) {
      console.error('Error queuing upload:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось начать загрузку",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // State: Selecting tab for capture
  if (isSelecting) {
    return (
      <div className="bg-card rounded-2xl shadow-elevated p-5 sm:p-8 max-w-lg w-full relative">
        <button
          onClick={handleCancelRecording}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 text-destructive hover:text-destructive/80 p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-4">
          <h3 className="text-xl font-semibold text-primary">Выберите вкладку</h3>
          <p className="text-muted-foreground text-sm">
            В появившемся окне выберите вкладку с созвоном и обязательно включите "Поделиться звуком"
          </p>
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        </div>
      </div>
    );
  }

  // State: Recording in progress (microphone or tab)
  if (isActiveRecording || isStopping) {
    const isTabRecording = recordingSource === 'tab';

    return (
      <div className="bg-card rounded-2xl shadow-elevated p-5 sm:p-8 max-w-lg w-full relative">
        {/* Cancel button */}
        {isActiveRecording && !isStopping && (
          <button
            onClick={handleCancelRecording}
            className="absolute top-3 right-3 sm:top-4 sm:right-4 text-destructive hover:text-destructive/80 p-1"
            disabled={isStopping}
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Sparkle decoration */}
        <div className="absolute bottom-4 left-4 text-primary/30">
          <Sparkles className="w-5 h-5" />
        </div>

        <div className="text-center space-y-4">
          {isStopping ? (
            <>
              <h3 className="text-xl font-semibold text-primary">Завершение записи</h3>
              <p className="text-muted-foreground text-sm">Подождите...</p>
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            </>
          ) : (
            <>
              <h3 className="text-xl font-semibold text-primary">
                {isTabRecording ? 'Запись звука вкладки' : 'Идет сессия'}
              </h3>
              <p className="text-success text-sm">
                {isTabRecording
                  ? 'Записывается звук из выбранной вкладки'
                  : 'Захват вашего голоса с высокой точностью'}
              </p>

              {!isTabRecording && (
                <div className="py-4">
                  <p className="text-sm text-muted-foreground">
                    Помните о <span className="text-primary underline cursor-pointer">согласии пациента</span>
                  </p>
                </div>
              )}

              {/* Recording controls */}
              <div className="flex items-center justify-center gap-4 pt-4">
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-recording animate-pulse-recording" />
                  {isTabRecording ? (
                    <Monitor className="w-4 h-4 text-recording" />
                  ) : (
                    <Mic className="w-4 h-4 text-recording" />
                  )}
                  <span className="text-sm font-mono text-foreground">{formatTime(recordingTime)}</span>
                </div>

                {/* Waveform visualization — heights driven by CSS animation, not JS Math.random() */}
                <div className="flex items-center gap-0.5 h-6">
                  {[...Array(12)].map((_, i) => (
                    <div
                      key={i}
                      className={`w-0.5 bg-primary/60 rounded-full ${isPaused ? '' : 'waveform-bar'}`}
                      style={{
                        animationDelay: `${i * 0.1}s`,
                        height: isPaused ? '8px' : undefined,
                      }}
                    />
                  ))}
                </div>

                {/* Pause/Resume button (only for microphone) */}
                {!isTabRecording && (
                  isPaused ? (
                    <button
                      onClick={resumeRecording}
                      className="p-2.5 hover:bg-muted rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
                    >
                      <Play className="w-5 h-5 text-foreground" />
                    </button>
                  ) : (
                    <button
                      onClick={pauseRecording}
                      className="p-2.5 hover:bg-muted rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
                    >
                      <Pause className="w-5 h-5 text-foreground" />
                    </button>
                  )
                )}

                {/* Stop button */}
                <button
                  onClick={handleStopRecording}
                  disabled={isStopping}
                  className="p-2.5 bg-recording rounded-lg hover:bg-recording/90 disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
                >
                  <Square className="w-5 h-5 text-white fill-white" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // State: Initial state or with completed recording
  return (
    <div className="bg-card rounded-2xl shadow-elevated p-5 sm:p-8 max-w-lg w-full relative">
      {/* Sparkle decoration */}
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4 text-primary/30">
        <Sparkles className="w-5 h-5" />
      </div>
      <div className="absolute bottom-3 left-3 sm:bottom-4 sm:left-4 text-primary/30">
        <Sparkles className="w-5 h-5" />
      </div>

      <div className="text-center space-y-4 sm:space-y-6">
        {/* Microphone icon */}
        <div className="mx-auto w-16 h-16 bg-primary rounded-xl flex items-center justify-center shadow-lg">
          <Mic className="w-8 h-8 text-primary-foreground" />
        </div>

        <div>
          <h3 className="text-xl font-semibold text-foreground mb-2">Начать сессию</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Начните запись встречи с пациентом или создайте клинические заметки. Наш ИИ поможет интеллектуально структурировать вашу документацию.
          </p>
        </div>

        {/* Show completed recording if exists */}
        {completedRecording && (
          <div className="bg-muted/50 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <Music className="w-5 h-5 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-foreground">Транскрипт</p>
                <p className="text-xs text-muted-foreground">
                  {formatTime(completedRecording.duration)} • {(completedRecording.blob.size / 1024).toFixed(0)} KB
                </p>
              </div>
            </div>
            <button
              onClick={handleRemoveRecording}
              className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-destructive"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 justify-center">
          {/* Split button: main action + dropdown */}
          <div className="flex">
            <Button
              onClick={handleStartMicRecording}
              className="gap-2 rounded-r-none"
              variant={completedRecording ? "outline" : "default"}
            >
              <Mic className="w-4 h-4" />
              {completedRecording ? "Записать ещё" : "Включить запись"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={completedRecording ? "outline" : "default"}
                  className="px-2 rounded-l-none border-l-0"
                >
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleStartMicRecording}>
                  <Mic className="w-4 h-4 mr-2" />
                  Микрофон
                  <span className="ml-2 text-xs text-muted-foreground">(ваш голос)</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleStartTabCapture}
                  disabled={!tabCaptureSupported}
                >
                  <Monitor className="w-4 h-4 mr-2" />
                  Звук вкладки
                  <span className="ml-2 text-xs text-muted-foreground">(созвон)</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {completedRecording ? (
            <Button
              variant="default"
              onClick={handleGenerateNote}
              className="gap-2"
              disabled={isSubmitting}
            >
              <FileText className="w-4 h-4" />
              Транскрибировать
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={onGenerateNote}
              className="gap-2"
            >
              <FileText className="w-4 h-4" />
              Перейти к сессиям
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
