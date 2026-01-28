import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { decryptPHIBatch } from '../lib/encryption';
import { getOrCreateActiveSession, createSessionNote, getUserClinicId } from '../lib/supabase-sessions';
import { createRecording, uploadAudioFile, startTranscription } from '../lib/supabase-recordings';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useTabAudioCapture } from '../hooks/useTabAudioCapture';
import { useSystemAudioCapture } from '../hooks/useSystemAudioCapture';
import { useAudioInputDevices } from '../hooks/useAudioInputDevices';
import {
  Mic, Square, Circle,
  ChevronDown, LogOut, Settings,
  Plus, Clock, Monitor, Volume2, RefreshCw
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
  const [saveError, setSaveError] = useState<string | null>(null);
  const [recordingSource, setRecordingSource] = useState<'microphone' | 'tab' | 'system' | null>(null);
  const [selectedMicDeviceId, setSelectedMicDeviceId] = useState<string>('');

  const MIN_BLOB_BYTES_TAB_SYSTEM = 20_000;

  const { devices: micDevices, loading: micDevicesLoading, refresh: refreshMicDevices } = useAudioInputDevices();

  // Audio recorder (microphone)
  const {
    status: micStatus,
    recordingTime: micTime,
    audioBlob: micBlob,
    error: micError,
    startRecording: startMicRecording,
    stopRecording: stopMicRecording,
    reset: resetMic,
  } = useAudioRecorder();

  // Tab audio capture
  const {
    status: tabStatus,
    recordingTime: tabTime,
    audioBlob: tabBlob,
    error: tabError,
    isSupported: tabSupported,
    startCapture: startTabCapture,
    stopCapture: stopTabCapture,
    reset: resetTab,
  } = useTabAudioCapture();

  // System audio capture
  const {
    status: systemStatus,
    recordingTime: systemTime,
    audioBlob: systemBlob,
    error: systemError,
    isSupported: systemSupported,
    startCapture: startSystemCapture,
    stopCapture: stopSystemCapture,
    reset: resetSystem,
  } = useSystemAudioCapture();

  // Unified recording state
  const isActiveMicRecording = micStatus === 'recording' || micStatus === 'starting';
  const isActiveTabRecording = tabStatus === 'recording';
  const isActiveSystemRecording = systemStatus === 'recording';
  const isActiveRecording = isActiveMicRecording || isActiveTabRecording || isActiveSystemRecording;
  const isSelecting = tabStatus === 'selecting' || systemStatus === 'selecting';
  const isStopping = micStatus === 'stopping' || tabStatus === 'stopping' || systemStatus === 'stopping';
  
  const currentRecordingTime = recordingSource === 'tab' ? tabTime : recordingSource === 'system' ? systemTime : micTime;
  const currentError = recordingSource === 'tab' ? tabError : recordingSource === 'system' ? systemError : micError;
  const currentBlob = recordingSource === 'tab' ? tabBlob : recordingSource === 'system' ? systemBlob : micBlob;

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

  // Синхронизация состояния записи
  useEffect(() => {
    setIsRecording(isActiveRecording);
    setRecordingTime(currentRecordingTime);
  }, [isActiveRecording, currentRecordingTime]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const clearSaveError = () => setSaveError(null);

  const handleStartMicRecording = async () => {
    if (!selectedPatient || !currentSessionId) return;
    clearSaveError();
    try {
      setRecordingSource('microphone');
      await startMicRecording(selectedMicDeviceId || undefined);
    } catch (error) {
      console.error('Failed to start mic recording:', error);
      setRecordingSource(null);
    }
  };

  const handleStartTabRecording = async () => {
    if (!selectedPatient || !currentSessionId) return;
    if (!tabSupported) return;
    clearSaveError();
    try {
      setRecordingSource('tab');
      await startTabCapture();
    } catch (error) {
      console.error('Failed to start tab recording:', error);
      setRecordingSource(null);
    }
  };

  const handleStartSystemRecording = async () => {
    if (!selectedPatient || !currentSessionId) return;
    if (!systemSupported) return;
    clearSaveError();
    try {
      setRecordingSource('system');
      await startSystemCapture();
    } catch (error) {
      console.error('Failed to start system recording:', error);
      setRecordingSource(null);
    }
  };

  const handleStopRecording = async () => {
    if (!currentSessionId || !userId || !selectedPatient) {
      console.error('Cannot save recording: missing session or patient');
      return;
    }

    setIsUploading(true);
    setSaveError(null);

    try {
      let audioBlob: Blob | null = null;

      if (recordingSource === 'tab') {
        audioBlob = await stopTabCapture();
      } else if (recordingSource === 'system') {
        audioBlob = await stopSystemCapture();
      } else {
        audioBlob = await stopMicRecording();
      }

      if (!audioBlob || audioBlob.size === 0) {
        throw new Error('Нет данных записи');
      }

      if ((recordingSource === 'tab' || recordingSource === 'system') && audioBlob.size < MIN_BLOB_BYTES_TAB_SYSTEM) {
        const src = recordingSource === 'tab' ? 'вкладки' : 'системного звука';
        setSaveError(
          `Запись ${src} слишком короткая или звук не захвачен (${(audioBlob.size / 1024).toFixed(1)} КБ). ` +
          `Запишите дольше, включите «Поделиться звуком» в диалоге браузера. Для созвонов в браузере используйте «Вкладка».`
        );
        if (recordingSource === 'tab') resetTab();
        else if (recordingSource === 'system') resetSystem();
        setRecordingSource(null);
        return;
      }

      console.log('[OverlayPanel] Audio blob ready:', { size: audioBlob.size, type: audioBlob.type, source: recordingSource });

      // Создаем запись в БД
      const fileName = `recording-${Date.now()}.webm`;
      const mimeType = audioBlob.type || 'audio/webm';

      console.log('[OverlayPanel] Creating recording in database...');
      const recording = await createRecording({
        sessionId: currentSessionId,
        userId,
        fileName,
      });
      console.log('[OverlayPanel] Recording created:', recording.id);

      console.log('[OverlayPanel] Uploading audio file...', {
        recordingId: recording.id,
        blobSize: audioBlob.size,
        fileName,
        mimeType,
      });
      const filePath = await uploadAudioFile({
        recordingId: recording.id,
        audioBlob,
        fileName,
        mimeType,
      });
      console.log('[OverlayPanel] Audio file uploaded:', filePath);

      console.log('[OverlayPanel] Starting transcription...');
      await startTranscription(recording.id);
      console.log('[OverlayPanel] Transcription started for recording:', recording.id);

      console.log('[OverlayPanel] Recording saved and transcription started:', recording.id);
      
      // Сбрасываем рекордеры
      if (recordingSource === 'tab') {
        resetTab();
      } else if (recordingSource === 'system') {
        resetSystem();
      } else {
        resetMic();
      }
      setRecordingSource(null);
    } catch (error) {
      console.error('Failed to save recording:', error);
      setSaveError(error instanceof Error ? error.message : 'Ошибка сохранения записи');
      if (recordingSource === 'tab') resetTab();
      else if (recordingSource === 'system') resetSystem();
      else resetMic();
      setRecordingSource(null);
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
      <div className="p-3 border-b space-y-2">
        {!isActiveRecording && !isSelecting ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1">
              <label className="text-xs text-muted-foreground shrink-0">Микрофон:</label>
              <select
                value={selectedMicDeviceId}
                onChange={(e) => setSelectedMicDeviceId(e.target.value)}
                disabled={micDevicesLoading}
                className="flex-1 min-w-0 text-xs bg-background border rounded px-2 py-1 text-foreground"
              >
                <option value="">По умолчанию</option>
                {micDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={refreshMicDevices}
                disabled={micDevicesLoading}
                className="p-1 rounded hover:bg-muted text-muted-foreground"
                title="Обновить список устройств"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${micDevicesLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Для системного звука: VB-Cable / BlackHole → выбрать как микрофон.
            </p>
            <button
              onClick={handleStartMicRecording}
              disabled={!selectedPatient || micStatus === 'starting'}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-red-500 text-white rounded-md text-sm font-medium hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Mic className="w-4 h-4" />
              {micStatus === 'starting' ? 'Запуск...' : 'Микрофон'}
            </button>
            {tabSupported && (
              <button
                onClick={handleStartTabRecording}
                disabled={!selectedPatient}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-md text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Monitor className="w-4 h-4" />
                Вкладка (весь созвон)
              </button>
            )}
            {systemSupported && (
              <button
                onClick={handleStartSystemRecording}
                disabled={!selectedPatient}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-md text-sm font-medium hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Volume2 className="w-4 h-4" />
                Системный звук (весь ПК)
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={handleStopRecording}
              disabled={isStopping || isUploading}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50 w-full justify-center"
            >
              <Square className="w-4 h-4" />
              {isStopping || isUploading ? 'Сохранение...' : 'Остановить'}
            </button>
            {recordingSource && (
              <div className="text-xs text-muted-foreground">
                {recordingSource === 'tab' 
                  ? 'Запись вкладки' 
                  : recordingSource === 'system'
                  ? 'Запись системного звука'
                  : 'Запись микрофона'}
              </div>
            )}
          </div>
        )}
        {isSelecting && (
          <div className="text-xs text-center text-muted-foreground">
            {recordingSource === 'system' 
              ? 'Выберите экран/окно и включите "Поделиться звуком системы"'
              : 'Выберите вкладку в диалоге браузера'}
          </div>
        )}
        {currentError && (
          <div className="text-xs text-red-500 text-center">{currentError}</div>
        )}
        {saveError && (
          <div className="text-xs text-red-500 text-center">{saveError}</div>
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
