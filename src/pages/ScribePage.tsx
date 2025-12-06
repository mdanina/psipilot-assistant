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
  
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentRecordingId, setCurrentRecordingId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcriptionStatus, setTranscriptionStatus] = useState<'pending' | 'processing' | 'completed' | 'failed'>('pending');

  const transcriptionApiUrl = import.meta.env.VITE_TRANSCRIPTION_API_URL || 'http://localhost:3001';

  const handleStartRecording = async () => {
    if (!user || !profile || !profile.clinic_id) {
      toast({
        title: "Ошибка",
        description: "Необходима авторизация и привязка к клинике",
        variant: "destructive",
      });
      return;
    }

    try {
      // Create session without patient (patient will be linked later)
      const session = await createSession({
        userId: user.id,
        clinicId: profile.clinic_id,
        patientId: null, // Will be linked later on Sessions page
        title: `Запись ${new Date().toLocaleString('ru-RU')}`,
      });

      setCurrentSessionId(session.id);
    } catch (error) {
      console.error('Error creating session:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось создать сессию",
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleStopRecording = async (audioBlob: Blob, duration: number) => {
    if (!user || !currentSessionId) {
      toast({
        title: "Ошибка",
        description: "Отсутствует сессия для записи",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setTranscriptionStatus('pending');

    try {
      // Create recording record
      const recording = await createRecording({
        sessionId: currentSessionId,
        userId: user.id,
        fileName: `recording-${Date.now()}.webm`,
      });

      setCurrentRecordingId(recording.id);

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
              // Optionally redirect to sessions page with session ID
              setTimeout(() => {
                navigate('/sessions', { state: { sessionId: currentSessionId } });
              }, 2000);
            } else if (status.status === 'failed') {
              toast({
                title: "Ошибка транскрипции",
                description: status.error || "Не удалось выполнить транскрипцию",
                variant: "destructive",
              });
            } else if (status.status === 'processing') {
              // Continue polling
              setTimeout(checkStatus, 2000);
            }
          } catch (error) {
            console.error('Error checking transcription status:', error);
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
      }

      toast({
        title: "Успешно",
        description: "Запись сохранена",
      });
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
    } finally {
      setIsProcessing(false);
      // Reset state after a delay to allow UI to update
      setTimeout(() => {
        setCurrentSessionId(null);
        setCurrentRecordingId(null);
        setTranscriptionStatus('pending');
      }, 1000);
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
          onStartRecording={handleStartRecording}
          onStopRecording={handleStopRecording}
          onGenerateNote={handleGenerateNote}
          isProcessing={isProcessing}
          transcriptionStatus={transcriptionStatus}
        />
      </div>
    </>
  );
};

export default ScribePage;
