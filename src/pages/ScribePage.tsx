import { useState } from "react";
import { FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { RecordingCard } from "@/components/scribe/RecordingCard";
import { useAuth } from "@/contexts/AuthContext";
import { createSession } from "@/lib/supabase-sessions";
import {
  createRecording,
  uploadAudioFile,
  startTranscription,
  getRecordingStatus,
  updateRecording
} from "@/lib/supabase-recordings";
import { useToast } from "@/hooks/use-toast";

const ScribePage = () => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [isProcessing, setIsProcessing] = useState(false);
  const [transcriptionStatus, setTranscriptionStatus] = useState<'pending' | 'processing' | 'completed' | 'failed'>('pending');

  const transcriptionApiUrl = import.meta.env.VITE_TRANSCRIPTION_API_URL || 'http://localhost:3001';

  const handleRecordingComplete = async (audioBlob: Blob, duration: number) => {
    if (!user || !profile || !profile.clinic_id) {
      toast({
        title: "Ошибка",
        description: "Необходима авторизация и привязка к клинике",
        variant: "destructive",
      });
      throw new Error("Unauthorized");
    }

    setIsProcessing(true);
    setTranscriptionStatus('pending');

    let currentSessionId: string | null = null;

    try {
      // Create session without patient (patient will be linked later)
      const session = await createSession({
        userId: user.id,
        clinicId: profile.clinic_id,
        patientId: null, // Will be linked later on Sessions page
        title: `Запись ${new Date().toLocaleString('ru-RU')}`,
      });

      currentSessionId = session.id;

      // Create recording record
      const recording = await createRecording({
        sessionId: session.id,
        userId: user.id,
        fileName: `recording-${Date.now()}.webm`,
      });

      // Determine MIME type from blob
      const mimeType = audioBlob.type || 'audio/webm';

      // Upload audio file
      await uploadAudioFile({
        recordingId: recording.id,
        audioBlob,
        fileName: recording.file_name || `recording-${recording.id}.webm`,
        mimeType,
      });

      // Update recording with duration
      await updateRecording(recording.id, {
        duration_seconds: duration,
      });

      toast({
        title: "Успешно",
        description: "Запись сохранена. Начинаем транскрипцию...",
      });

      // Start transcription
      try {
        await startTranscription(recording.id, transcriptionApiUrl);
        setTranscriptionStatus('processing');

        // Poll for transcription status
        const checkStatus = async () => {
          try {
            const status = await getRecordingStatus(recording.id);
            setTranscriptionStatus(status.status);

            if (status.status === 'completed') {
              toast({
                title: "Успешно",
                description: "Транскрипция завершена",
              });
              // Navigate to sessions page with session ID
              navigate('/sessions', { state: { sessionId: currentSessionId } });
            } else if (status.status === 'failed') {
              toast({
                title: "Ошибка транскрипции",
                description: status.error || "Не удалось выполнить транскрипцию",
                variant: "destructive",
              });
              // Still navigate to sessions so user can see the recording
              setTimeout(() => {
                navigate('/sessions', { state: { sessionId: currentSessionId } });
              }, 2000);
            } else if (status.status === 'processing') {
              // Continue polling
              setTimeout(checkStatus, 2000);
            }
          } catch (error) {
            console.error('Error checking transcription status:', error);
            // Continue polling even on error
            setTimeout(checkStatus, 3000);
          }
        };

        // Start polling after a short delay
        setTimeout(checkStatus, 2000);
      } catch (transcriptionError) {
        console.error('Error starting transcription:', transcriptionError);
        setTranscriptionStatus('failed');
        toast({
          title: "Предупреждение",
          description: "Запись сохранена, но транскрипция не запущена. Вы можете запустить её позже.",
          variant: "default",
        });
        // Navigate to sessions even if transcription failed
        setTimeout(() => {
          navigate('/sessions', { state: { sessionId: currentSessionId } });
        }, 2000);
      }
    } catch (error) {
      console.error('Error saving recording:', error);
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';

      // More detailed error messages
      let userFriendlyMessage = errorMessage;
      if (errorMessage.includes('Failed to create recording')) {
        userFriendlyMessage = 'Не удалось создать запись в базе данных. Проверьте подключение к Supabase.';
      } else if (errorMessage.includes('Failed to upload audio file')) {
        userFriendlyMessage = 'Не удалось загрузить аудио файл. Проверьте, что bucket "recordings" создан в Supabase Storage.';
      } else if (errorMessage.includes('row-level security')) {
        userFriendlyMessage = 'Ошибка прав доступа. Убедитесь, что вы авторизованы и имеете права на создание записей.';
      }

      toast({
        title: "Ошибка",
        description: userFriendlyMessage,
        variant: "destructive",
      });

      setIsProcessing(false);
      setTranscriptionStatus('pending');
      throw error;
    }
  };

  const handleGenerateNote = () => {
    // Navigate to sessions page where user can create a note
    navigate('/sessions');
  };

  return (
    <>
      <Header title="Скрайбер" icon={<FileText className="w-5 h-5" />} />
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-12">
        {/* Hero section */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-primary mb-3">
            Клиническая документация на основе ИИ
          </h1>
          <p className="text-muted-foreground max-w-xl">
            Преобразуйте ваши медицинские заметки с помощью интеллектуальной транскрипции и автоматической структуризации
          </p>
        </div>

        {/* Recording card */}
        <RecordingCard
          onRecordingComplete={handleRecordingComplete}
          onGenerateNote={handleGenerateNote}
          isProcessing={isProcessing}
          transcriptionStatus={transcriptionStatus}
        />
      </div>
    </>
  );
};

export default ScribePage;
