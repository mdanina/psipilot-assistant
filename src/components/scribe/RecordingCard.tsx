import { useState } from "react";
import { Mic, FileText, X, Pause, Play, Square, Sparkles, Loader2, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useToast } from "@/hooks/use-toast";

interface RecordingCardProps {
  onRecordingComplete: (audioBlob: Blob, duration: number) => Promise<void>;
  onGenerateNote: () => void;
  isProcessing?: boolean;
  transcriptionStatus?: 'pending' | 'processing' | 'completed' | 'failed';
}

export const RecordingCard = ({
  onRecordingComplete,
  onGenerateNote,
  isProcessing = false,
  transcriptionStatus = 'pending'
}: RecordingCardProps) => {
  const {
    isRecording,
    isPaused,
    isStopped,
    recordingTime,
    audioBlob,
    error: recorderError,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    cancelRecording,
    reset,
  } = useAudioRecorder();

  const { toast } = useToast();
  const [isStopping, setIsStopping] = useState(false);
  const [completedRecording, setCompletedRecording] = useState<{
    blob: Blob;
    duration: number;
    fileName: string;
  } | null>(null);

  // Show error toast if recorder has error
  if (recorderError) {
    toast({
      title: "Ошибка записи",
      description: recorderError,
      variant: "destructive",
    });
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleStartRecording = async () => {
    try {
      // Clear any previous completed recording
      setCompletedRecording(null);
      await startRecording();
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось начать сессию",
        variant: "destructive",
      });
    }
  };

  const handleStopRecording = async () => {
    setIsStopping(true);
    try {
      const blob = await stopRecording();
      if (blob) {
        const fileName = `recording-${Date.now()}.webm`;
        setCompletedRecording({
          blob,
          duration: recordingTime,
          fileName,
        });
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось остановить сессию",
        variant: "destructive",
      });
    } finally {
      setIsStopping(false);
    }
  };

  const handleCancelRecording = () => {
    cancelRecording();
    setCompletedRecording(null);
  };

  const handleRemoveRecording = () => {
    reset();
    setCompletedRecording(null);
  };

  const handleGenerateNote = async () => {
    if (completedRecording) {
      // If we have a completed recording, send it first
      try {
        await onRecordingComplete(completedRecording.blob, completedRecording.duration);
        // Clear completed recording after successful upload
        setCompletedRecording(null);
        reset();
      } catch (error) {
        console.error('Error processing recording:', error);
        toast({
          title: "Ошибка",
          description: "Не удалось обработать сессию",
          variant: "destructive",
        });
      }
    } else {
      // No recording, just navigate to sessions
      onGenerateNote();
    }
  };

  // State 1: Recording in progress
  if (isRecording || isStopping) {
    return (
      <div className="bg-card rounded-2xl shadow-elevated p-8 max-w-lg w-full relative">
        {/* Cancel button */}
        {isRecording && !isStopping && (
          <button
            onClick={handleCancelRecording}
            className="absolute top-4 right-4 text-destructive hover:text-destructive/80"
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
              <h3 className="text-xl font-semibold text-primary">Идет сессия</h3>
              <p className="text-success text-sm">Захват вашего голоса с высокой точностью</p>

              <div className="py-4">
                <p className="text-sm text-muted-foreground">
                  Помните о <span className="text-primary underline cursor-pointer">согласии пациента</span>
                </p>
              </div>

              {/* Recording controls */}
              <div className="flex items-center justify-center gap-4 pt-4">
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-recording animate-pulse-recording" />
                  <Mic className="w-4 h-4 text-recording" />
                  <span className="text-sm font-mono text-foreground">{formatTime(recordingTime)}</span>
                </div>

                {/* Waveform visualization */}
                <div className="flex items-center gap-0.5 h-6">
                  {[...Array(12)].map((_, i) => (
                    <div
                      key={i}
                      className={`w-0.5 bg-primary/60 rounded-full ${isPaused ? '' : 'waveform-bar'}`}
                      style={{
                        animationDelay: `${i * 0.1}s`,
                        height: isPaused ? '8px' : `${Math.random() * 16 + 4}px`
                      }}
                    />
                  ))}
                </div>

                {/* Pause/Resume button */}
                {isPaused ? (
                  <button
                    onClick={resumeRecording}
                    className="p-2 hover:bg-muted rounded-lg"
                  >
                    <Play className="w-5 h-5 text-foreground" />
                  </button>
                ) : (
                  <button
                    onClick={pauseRecording}
                    className="p-2 hover:bg-muted rounded-lg"
                  >
                    <Pause className="w-5 h-5 text-foreground" />
                  </button>
                )}

                {/* Stop button */}
                <button
                  onClick={handleStopRecording}
                  disabled={isStopping}
                  className="p-2 bg-recording rounded-lg hover:bg-recording/90 disabled:opacity-50"
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

  // State 2: Processing (uploading and transcribing)
  if (isProcessing) {
    return (
      <div className="bg-card rounded-2xl shadow-elevated p-8 max-w-lg w-full relative">
        <div className="absolute bottom-4 left-4 text-primary/30">
          <Sparkles className="w-5 h-5" />
        </div>

        <div className="text-center space-y-4">
          <h3 className="text-xl font-semibold text-primary">Обработка записи</h3>
          <p className="text-muted-foreground text-sm">
            {transcriptionStatus === 'processing'
              ? "Транскрипция в процессе..."
              : "Загрузка и сохранение..."}
          </p>
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        </div>
      </div>
    );
  }

  // State 3: Initial state or with completed recording
  return (
    <div className="bg-card rounded-2xl shadow-elevated p-8 max-w-lg w-full relative">
      {/* Sparkle decoration */}
      <div className="absolute top-4 right-4 text-primary/30">
        <Sparkles className="w-5 h-5" />
      </div>
      <div className="absolute bottom-4 left-4 text-primary/30">
        <Sparkles className="w-5 h-5" />
      </div>

      <div className="text-center space-y-6">
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
          <Button
            onClick={handleStartRecording}
            className="gap-2"
            disabled={isProcessing}
            variant={completedRecording ? "outline" : "default"}
          >
            <Mic className="w-4 h-4" />
            {completedRecording ? "Записать ещё" : "Включить запись"}
          </Button>
          <Button
            variant={completedRecording ? "default" : "outline"}
            onClick={handleGenerateNote}
            className="gap-2"
            disabled={isProcessing}
          >
            <FileText className="w-4 h-4" />
            Транскрибировать
          </Button>
        </div>

        {/* Transcription status indicator */}
        {transcriptionStatus === 'failed' && (
          <div className="mt-4 text-center">
            <p className="text-sm text-destructive">
              Ошибка транскрипции. Попробуйте еще раз.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
