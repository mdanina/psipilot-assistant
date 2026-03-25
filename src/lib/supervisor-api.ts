/**
 * API клиент для взаимодействия с AI супервизором через backend route
 */

import { supabase } from './supabase';

export interface SupervisorPatientContext {
  patient?: {
    fullName?: string;
    dateOfBirth?: string;
    gender?: string;
    notes?: string;
  };
  caseSummary?: string;
  sessions?: Array<{
    date: string;
    status: string;
    durationMinutes?: number;
    summary?: string;
    notes?: string;
    transcripts?: string[];
  }>;
  clinicalNotes?: Array<{
    title: string;
    status: string;
    createdAt: string;
    summary?: string;
  }>;
}

export interface SupervisorRequest {
  message: string;
  patientId?: string;
  patientName?: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  context?: SupervisorPatientContext;
}

export interface SupervisorResponse {
  message: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

// URL backend сервиса (same pattern as supabase-ai.ts)
const SUPERVISOR_API_URL = import.meta.env.VITE_AI_API_URL || import.meta.env.VITE_TRANSCRIPTION_API_URL || '';

/**
 * Получить заголовки для аутентификации
 */
async function getAuthHeaders(): Promise<HeadersInit> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  } catch (error) {
    console.warn('Failed to get auth token:', error);
  }

  return headers;
}

/**
 * Проверить доступность супервизора
 * Backend всегда co-located, так что всегда доступен
 */
export async function checkSupervisorAvailability(): Promise<boolean> {
  return true;
}

/**
 * Отправить сообщение супервизору через backend API
 */
export async function sendMessageToSupervisor(
  request: SupervisorRequest
): Promise<SupervisorResponse> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 минут таймаут

    const response = await fetch(`${SUPERVISOR_API_URL}/api/supervisor/chat`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({
        message: request.message,
        conversation_history: request.conversationHistory || [],
        context: request.context || {},
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(
        errorData?.error || `HTTP ${response.status}: ${response.statusText}`
      );
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Неизвестная ошибка от супервизора');
    }

    return {
      message: data.data.message,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error sending message to supervisor:', error);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('Превышено время ожидания ответа от супервизора (5 минут). Попробуйте еще раз.');
      }
      throw error;
    }

    throw new Error('Неизвестная ошибка при отправке сообщения супервизору');
  }
}
