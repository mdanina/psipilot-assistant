import { useState, useEffect } from "react";
import { Mic, FileText, X, Pause, Play, Square, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useToast } from "@/hooks/use-toast";

interface RecordingCardProps {
  onStartRecording: () => Promise<void>;
  onStopRecording: (audioBlob: Blob, duration: number) => Promise<void>;
  onGenerateNote: () => void;
  isProcessing?: boolean;
  transcriptionStatus?: 'pending' | 'processing' | 'completed' | 'failed';
}

export const RecordingCard = ({ 
  onStartRecording, 
  onStopRecording,
  onGenerateNote,
  isProcessing = false,
  transcriptionStatus = 'pending'
}: RecordingCardProps) => {
  const {
    isRecording,
    isPaused,
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

  // Show error toast if recorder has error
  useEffect(() => {
    if (recorderError) {
      toast({
        title: "Ошибка записи",
        description: recorderError,
        variant: "destructive",
      });
    }
  }, [recorderError, toast]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")} : ${secs.toString().padStart(2, "0")}`;
  };

  const handleStartRecording = async () => {
    try {
      await startRecording();
      await onStartRecording();
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось начать запись",
        variant: "destructive",
      });
    }
  };

  const handleStopRecording = async () => {
    if (!audioBlob) {
      stopRecording();
      return;
    }

    setIsStopping(true);
    try {
      await onStopRecording(audioBlob, recordingTime);
      stopRecording();
    } catch (error) {
      console.error('Error stopping recording:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось сохранить запись",
        variant: "destructive",
      });
    } finally {
      setIsStopping(false);
    }
  };

  const handleCancelRecording = () => {
    cancelRecording();
    reset();
  };

  if (isRecording || isStopping || isProcessing) {
    return (
      <div className="bg-card rounded-2xl shadow-elevated p-8 max-w-lg w-full relative">
        {/* Cancel button - only show if recording, not when processing */}
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
          {isStopping || isProcessing ? (
            <>
              <h3 className="text-xl font-semibold text-primary">Обработка записи</h3>
              <p className="text-muted-foreground text-sm">
                {isStopping ? "Сохранение записи..." : "Загрузка и транскрипция..."}
              </p>
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            </>
          ) : (
            <>
              <h3 className="text-xl font-semibold text-primary">Идет запись</h3>
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
                      className="w-0.5 bg-primary/60 rounded-full waveform-bar"
                      style={{ 
                        animationDelay: `${i * 0.1}s`,
                        height: `${Math.random() * 16 + 4}px`
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
          <h3 className="text-xl font-semibold text-foreground mb-2">Создать с помощью ИИ</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Начните запись встречи с пациентом или создайте клинические заметки. Наш ИИ поможет интеллектуально структурировать вашу документацию.
          </p>
        </div>
        
        {/* Action buttons */}
        <div className="flex gap-3 justify-center">
          <Button
            onClick={handleStartRecording}
            className="gap-2"
            disabled={isProcessing}
          >
            <Mic className="w-4 h-4" />
            Начать запись
          </Button>
          <Button
            variant="outline"
            onClick={onGenerateNote}
            className="gap-2"
            disabled={isProcessing}
          >
            <FileText className="w-4 h-4" />
            Создать заметку ИИ
          </Button>
        </div>
        
        {/* Transcription status indicator */}
        {transcriptionStatus === 'processing' && (
          <div className="mt-4 text-center">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Транскрипция в процессе...</span>
            </div>
          </div>
        )}
        
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
