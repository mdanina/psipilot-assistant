/**
 * API клиент для взаимодействия с AI супервизором через n8n webhook
 */

export interface SupervisorRequest {
  message: string;
  patientId?: string;
  patientName?: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  context?: Record<string, unknown>;
}

export interface SupervisorResponse {
  message: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Получить заголовки для аутентификации
 */
async function getAuthHeaders(): Promise<HeadersInit> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  // Получаем токен из Supabase
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseAnonKey) {
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
    }
  } catch (error) {
    console.warn('Failed to get auth token:', error);
  }

  return headers;
}

/**
 * Проверить доступность супервизора
 */
export async function checkSupervisorAvailability(): Promise<boolean> {
  const webhookUrl = import.meta.env.VITE_N8N_SUPERVISOR_WEBHOOK_URL;
  
  // Диагностика для production
  if (import.meta.env.PROD) {
    console.log('[Supervisor] Проверка доступности:', {
      hasWebhookUrl: !!webhookUrl,
      webhookUrlType: typeof webhookUrl,
      webhookUrlLength: webhookUrl?.length || 0,
      webhookUrlPreview: webhookUrl ? `${webhookUrl.substring(0, 50)}...` : 'undefined',
    });
  }
  
  if (!webhookUrl || webhookUrl.trim() === '' || webhookUrl === 'your-n8n-webhook-url-here') {
    if (import.meta.env.DEV) {
      console.warn('[Supervisor] VITE_N8N_SUPERVISOR_WEBHOOK_URL не настроен. Установите его в .env.local');
    } else {
      console.warn('[Supervisor] VITE_N8N_SUPERVISOR_WEBHOOK_URL не настроен в production build. Переменная должна быть указана при сборке приложения.');
    }
    return false;
  }

  // Проверяем формат URL
  try {
    const url = new URL(webhookUrl);
    if (import.meta.env.PROD) {
      console.log('[Supervisor] URL валиден:', url.hostname);
    }
    return true;
  } catch (error) {
    console.error('[Supervisor] Неверный формат VITE_N8N_SUPERVISOR_WEBHOOK_URL:', error, 'URL:', webhookUrl);
    return false;
  }
}

/**
 * Отправить сообщение супервизору через n8n webhook
 */
export async function sendMessageToSupervisor(
  request: SupervisorRequest
): Promise<SupervisorResponse> {
  const webhookUrl = import.meta.env.VITE_N8N_SUPERVISOR_WEBHOOK_URL;
  
  if (!webhookUrl) {
    throw new Error(
      'n8n webhook URL не настроен. Установите VITE_N8N_SUPERVISOR_WEBHOOK_URL в .env.local'
    );
  }

  try {
    // Добавляем таймаут для запроса (5 минут для AI запросов)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 300 секунд (5 минут) таймаут

    // SECURITY: Do NOT send patient_name or patient_id to external n8n webhook.
    // These are PHI and should not leave the system boundary without encryption.
    // Only send the message content and conversation history.
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({
        message: request.message,
        conversation_history: request.conversationHistory || [],
        context: request.context || {},
        timestamp: new Date().toISOString(),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `HTTP ${response.status}: ${errorText || response.statusText}`
      );
    }

    const responseText = await response.text();
    if (!responseText || responseText.trim() === '') {
      throw new Error('Пустой ответ от супервизора. Проверьте настройки n8n workflow.');
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse JSON response:', responseText);
      throw new Error(`Некорректный формат ответа от супервизора. Ответ: ${responseText.substring(0, 100)}`);
    }

    // Обрабатываем различные форматы ответа от n8n
    if (data.data) {
      return {
        message: data.data.message || data.data.text || data.data.response || String(data.data),
        timestamp: data.data.timestamp || new Date().toISOString(),
        metadata: data.data.metadata,
      };
    }

    return {
      message: data.message || data.text || data.response || String(data),
      timestamp: data.timestamp || new Date().toISOString(),
      metadata: data.metadata,
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
