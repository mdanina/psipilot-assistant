import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { decryptPHIBatch } from '../lib/encryption';
import { getOrCreateActiveSession, createSessionNote, getUserClinicId } from '../lib/supabase-sessions';
import { createRecording, uploadAudioFile, startTranscription } from '../lib/supabase-recordings';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import {
  Mic, Square, Circle,
  ChevronDown, LogOut, Settings,
  Plus, Clock
} from 'lucide-react';

interface Patient {
  id: string;
  name: string;
}

interface Note {
  id: string;
  content: string;
  timestamp: number;
  createdAt: Date;
}

export function OverlayPanel() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState('');
  const [showPatientSelect, setShowPatientSelect] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Audio recorder
  const {
    status: recorderStatus,
    recordingTime: recorderTime,
    audioBlob,
    error: recorderError,
    startRecording: startAudioRecording,
    stopRecording: stopAudioRecording,
    reset: resetRecorder,
  } = useAudioRecorder();

  // Загрузка информации о пользователе
  useEffect(() => {
    async function loadUserInfo() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        setUserId(session.user.id);
        const clinic = await getUserClinicId(session.user.id);
        setClinicId(clinic);
      }
    }
    loadUserInfo();
  }, []);

  // Создание/получение сессии при выборе пациента
  useEffect(() => {
    async function setupSession() {
      if (!selectedPatient || !userId || !clinicId) {
        setCurrentSessionId(null);
        return;
      }

      try {
        const sessionId = await getOrCreateActiveSession({
          patientId: selectedPatient.id,
          userId,
          clinicId,
        });
        setCurrentSessionId(sessionId);
        console.log('Session created/retrieved:', sessionId);
      } catch (error) {
        console.error('Failed to setup session:', error);
      }
    }
    setupSession();
  }, [selectedPatient, userId, clinicId]);

  // Загрузка пациентов
  useEffect(() => {
    async function loadPatients() {
      try {
        // Загружаем пациентов с зашифрованными полями
        const { data, error } = await supabase
          .from('patients')
          .select('id, name, name_encrypted, pii_encryption_version')
          .order('last_activity_at', { ascending: false })
          .limit(20);

        if (error) {
          console.error('Error loading patients:', error);
          return;
        }

        if (data && data.length > 0) {
          console.log('Loaded patients:', data.length);
          
          // Проверяем, нужно ли расшифровывать
          const needsDecryption = data.some(p => (p as any).pii_encryption_version);
          
          if (needsDecryption) {
            // Расшифровываем имена пациентов
            const encryptedNames = data.map(p => {
              const patient = p as any;
              if (patient.name_encrypted) {
                // Конвертируем BYTEA (hex) в base64
                let valueToDecrypt: string;
                const encryptedValue = patient.name_encrypted;
                const valueStr = String(encryptedValue);
                
                if (valueStr.startsWith('\\x')) {
                  // Convert hex string to base64
                  const hexString = valueStr.substring(2);
                  const bytes = new Uint8Array(hexString.length / 2);
                  for (let i = 0; i < hexString.length; i += 2) {
                    bytes[i / 2] = parseInt(hexString.substr(i, 2), 16);
                  }
                  valueToDecrypt = btoa(String.fromCharCode(...bytes));
                } else {
                  valueToDecrypt = encryptedValue;
                }
                return valueToDecrypt;
              }
              return null;
            }).filter(Boolean) as string[];
            
            if (encryptedNames.length > 0) {
              try {
                const decryptedNames = await decryptPHIBatch(encryptedNames);
                console.log('Decrypted patient names:', decryptedNames.length);
                
                // Объединяем расшифрованные имена с данными пациентов
                const decryptedPatients = data.map((p, index) => {
                  const patient = p as any;
                  if (patient.name_encrypted && decryptedNames[index]) {
                    return {
                      id: patient.id,
                      name: decryptedNames[index] || patient.name || 'Unknown',
                    };
                  }
                  return {
                    id: patient.id,
                    name: patient.name || 'Unknown',
                  };
                });
                
                setPatients(decryptedPatients);
              } catch (decryptError) {
                console.error('Failed to decrypt patient names:', decryptError);
                // Fallback: используем зашифрованные данные как есть
                setPatients(data.map(p => ({
                  id: p.id,
                  name: (p as any).name || 'Encrypted',
                })));
              }
            } else {
              // Нет зашифрованных данных, используем как есть
              setPatients(data.map(p => ({
                id: p.id,
                name: (p as any).name || 'Unknown',
              })));
            }
          } else {
            // Данные не зашифрованы
            setPatients(data.map(p => ({
              id: p.id,
              name: (p as any).name || 'Unknown',
            })));
          }
        } else {
          console.log('No patients found');
          setPatients([]);
        }
      } catch (err) {
        console.error('Failed to load patients:', err);
        setPatients([]);
      }
    }
    loadPatients();
  }, []);

  // Синхронизация состояния записи с рекордером
  useEffect(() => {
    setIsRecording(recorderStatus === 'recording' || recorderStatus === 'starting');
    setRecordingTime(recorderTime);
  }, [recorderStatus, recorderTime]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleStartRecording = async () => {
    if (!selectedPatient || !currentSessionId) {
      console.error('Cannot start recording: no patient or session');
      return;
    }

    try {
      await startAudioRecording();
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  };

  const handleStopRecording = async () => {
    if (!currentSessionId || !userId || !selectedPatient) {
      console.error('Cannot save recording: missing session or patient');
      return;
    }

    setIsUploading(true);

    try {
      // Останавливаем запись и получаем blob
      const audioBlob = await stopAudioRecording();
      
      if (!audioBlob) {
        throw new Error('No audio data recorded');
      }

      // Создаем запись в БД
      const fileName = `recording-${Date.now()}.webm`;
      const mimeType = audioBlob.type || 'audio/webm';

      console.log('Creating recording in database...');
      const recording = await createRecording({
        sessionId: currentSessionId,
        userId,
        fileName,
      });

      console.log('Uploading audio file...');
      await uploadAudioFile({
        recordingId: recording.id,
        audioBlob,
        fileName,
        mimeType,
      });

      console.log('Starting transcription...');
      await startTranscription(recording.id);

      console.log('Recording saved and transcription started:', recording.id);
      
      // Сбрасываем рекордер
      resetRecorder();
    } catch (error) {
      console.error('Failed to save recording:', error);
      // Можно показать уведомление об ошибке
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    if (!currentSessionId || !userId) {
      console.error('Cannot save note: no session or user');
      return;
    }

    setIsSaving(true);
    const noteContent = newNote.trim();
    const noteTimestamp = recordingTime;

    // Добавляем заметку локально сразу для быстрого отклика
    const localNote: Note = {
      id: crypto.randomUUID(),
      content: noteContent,
      timestamp: noteTimestamp,
      createdAt: new Date(),
    };
    setNotes([...notes, localNote]);
    setNewNote('');

    try {
      // Сохраняем в БД
      await createSessionNote({
        sessionId: currentSessionId,
        userId,
        content: `[${formatTime(noteTimestamp)}] ${noteContent}`,
        source: 'manual',
      });
      console.log('Note saved to database');
    } catch (error) {
      console.error('Failed to save note to database:', error);
      // Можно показать уведомление об ошибке
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="h-screen w-80 bg-background/95 backdrop-blur border-l flex flex-col">
      {/* Header */}
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isRecording && (
            <span className="flex items-center gap-1 text-red-500">
              <Circle className="w-3 h-3 fill-current animate-pulse" />
              <span className="text-xs font-mono">{formatTime(recordingTime)}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1.5 hover:bg-muted rounded text-foreground" title="Настройки">
            <Settings className="w-4 h-4 text-foreground" />
          </button>
          <button
            onClick={handleLogout}
            className="p-1.5 hover:bg-muted rounded text-foreground"
            title="Выйти"
          >
            <LogOut className="w-4 h-4 text-foreground" />
          </button>
        </div>
      </div>

      {/* Patient Select */}
      <div className="p-3 border-b">
        <button
          onClick={() => setShowPatientSelect(!showPatientSelect)}
          className="w-full px-3 py-2 text-left text-sm border rounded-md flex items-center justify-between hover:bg-muted bg-background"
        >
          <span className={selectedPatient ? 'text-foreground font-medium' : 'text-muted-foreground'}>
            {selectedPatient?.name || 'Выберите пациента'}
          </span>
          <ChevronDown className={`w-4 h-4 ${selectedPatient ? 'text-foreground' : 'text-muted-foreground'}`} />
        </button>

        {showPatientSelect && (
          <div className="mt-2 border rounded-md max-h-40 overflow-y-auto bg-background">
            {patients.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">Нет пациентов</div>
            ) : (
              patients.map((patient) => (
                <button
                  key={patient.id}
                  onClick={() => {
                    setSelectedPatient(patient);
                    setShowPatientSelect(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                >
                  {patient.name}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Recording Controls */}
      <div className="p-3 border-b flex items-center justify-center gap-2">
        {recorderStatus === 'idle' || recorderStatus === 'stopped' ? (
          <button
            onClick={handleStartRecording}
            disabled={!selectedPatient || recorderStatus === 'starting'}
            className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-full text-sm font-medium hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Mic className="w-4 h-4" />
            {recorderStatus === 'starting' ? 'Запуск...' : 'Начать запись'}
          </button>
        ) : recorderStatus === 'recording' || recorderStatus === 'starting' ? (
          <button
            onClick={handleStopRecording}
            disabled={recorderStatus === 'stopping' || isUploading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-full text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            <Square className="w-4 h-4" />
            {recorderStatus === 'stopping' || isUploading ? 'Сохранение...' : 'Остановить'}
          </button>
        ) : null}
        {recorderError && (
          <div className="text-xs text-red-500 mt-1">{recorderError}</div>
        )}
      </div>

      {/* Notes */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {notes.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">
            {selectedPatient ? 'Добавьте заметку' : 'Выберите пациента для добавления заметок'}
          </div>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="p-2 bg-muted rounded text-sm">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                <Clock className="w-3 h-3" />
                {formatTime(note.timestamp)}
              </div>
              <p className="text-foreground">{note.content}</p>
            </div>
          ))
        )}
      </div>

      {/* Note Input */}
      <div className="p-3 border-t">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Добавить заметку..."
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
            className="flex-1 px-3 py-2 text-sm border rounded-md bg-background text-foreground placeholder:text-muted-foreground"
          />
          <button
            onClick={handleAddNote}
            disabled={!newNote.trim() || isSaving || !currentSessionId}
            className="p-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            title={!currentSessionId ? 'Выберите пациента для сохранения заметок' : ''}
          >
            {isSaving ? (
              <Clock className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
