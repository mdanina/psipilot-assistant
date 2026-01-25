import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  Mic, MicOff, Square, Circle,
  ChevronDown, LogOut, Settings,
  Plus, Clock
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';

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

interface OverlayPanelProps {
  user: User;
}

export function OverlayPanel({ user }: OverlayPanelProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState('');
  const [showPatientSelect, setShowPatientSelect] = useState(false);

  // Загрузка пациентов
  useEffect(() => {
    async function loadPatients() {
      const { data } = await supabase
        .from('patients')
        .select('id, name')
        .order('last_activity_at', { ascending: false })
        .limit(20);

      if (data) {
        setPatients(data);
      }
    }
    loadPatients();
  }, []);

  // Таймер записи
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleStartRecording = () => {
    setIsRecording(true);
    setRecordingTime(0);
    // TODO: Запуск аудио записи через Tauri
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    // TODO: Остановка записи и upload
  };

  const handleAddNote = () => {
    if (!newNote.trim()) return;

    const note: Note = {
      id: crypto.randomUUID(),
      content: newNote.trim(),
      timestamp: recordingTime,
      createdAt: new Date(),
    };

    setNotes([...notes, note]);
    setNewNote('');

    // TODO: Синхронизация с сервером
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
          <button className="p-1.5 hover:bg-muted rounded" title="Настройки">
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={handleLogout}
            className="p-1.5 hover:bg-muted rounded"
            title="Выйти"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Patient Select */}
      <div className="p-3 border-b">
        <button
          onClick={() => setShowPatientSelect(!showPatientSelect)}
          className="w-full px-3 py-2 text-left text-sm border rounded-md flex items-center justify-between hover:bg-muted"
        >
          <span className={selectedPatient ? '' : 'text-muted-foreground'}>
            {selectedPatient?.name || 'Выберите пациента'}
          </span>
          <ChevronDown className="w-4 h-4" />
        </button>

        {showPatientSelect && (
          <div className="mt-2 border rounded-md max-h-40 overflow-y-auto">
            {patients.map((patient) => (
              <button
                key={patient.id}
                onClick={() => {
                  setSelectedPatient(patient);
                  setShowPatientSelect(false);
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
              >
                {patient.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Recording Controls */}
      <div className="p-3 border-b flex items-center justify-center gap-2">
        {!isRecording ? (
          <button
            onClick={handleStartRecording}
            disabled={!selectedPatient}
            className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-full text-sm font-medium hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Mic className="w-4 h-4" />
            Начать запись
          </button>
        ) : (
          <button
            onClick={handleStopRecording}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-full text-sm font-medium hover:bg-gray-800"
          >
            <Square className="w-4 h-4" />
            Остановить
          </button>
        )}
      </div>

      {/* Notes */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {notes.map((note) => (
          <div key={note.id} className="p-2 bg-muted rounded text-sm">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <Clock className="w-3 h-3" />
              {formatTime(note.timestamp)}
            </div>
            <p>{note.content}</p>
          </div>
        ))}
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
            className="flex-1 px-3 py-2 text-sm border rounded-md bg-background"
          />
          <button
            onClick={handleAddNote}
            disabled={!newNote.trim()}
            className="p-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
