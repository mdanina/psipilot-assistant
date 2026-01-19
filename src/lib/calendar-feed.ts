/**
 * API client for calendar feed functionality
 * Provides iCal subscription for sessions/appointments
 */

import { supabase } from './supabase';

// Use the same API URL as other services
const API_URL = import.meta.env.VITE_AI_API_URL || import.meta.env.VITE_TRANSCRIPTION_API_URL || 'http://localhost:3001';

export interface CalendarFeedToken {
  token: string;
  feedUrl: string;
}

/**
 * Get authentication headers for API requests
 */
async function getAuthHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Необходима авторизация');
  }
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
  };
}

/**
 * Generate or retrieve existing calendar feed token
 */
export async function generateCalendarFeedToken(): Promise<CalendarFeedToken> {
  const response = await fetch(`${API_URL}/api/calendar/generate-token`, {
    method: 'POST',
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Ошибка генерации токена');
  }

  const data = await response.json();

  if (!data.success || !data.token || !data.feedUrl) {
    throw new Error('Сервер не вернул данные токена');
  }

  return {
    token: data.token,
    feedUrl: data.feedUrl,
  };
}

/**
 * Revoke current user's calendar feed token
 */
export async function revokeCalendarFeedToken(): Promise<void> {
  const response = await fetch(`${API_URL}/api/calendar/revoke-token`, {
    method: 'DELETE',
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Ошибка отзыва токена');
  }
}
