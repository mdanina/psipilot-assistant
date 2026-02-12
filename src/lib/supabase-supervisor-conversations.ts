/**
 * Функции для работы с беседами с AI супервизором
 */

import { supabase } from './supabase';
import type { Database, Json } from '@/types/database.types';

type SupervisorConversation = Database['public']['Tables']['supervisor_conversations']['Row'];
type SupervisorConversationInsert = Database['public']['Tables']['supervisor_conversations']['Insert'];
type SupervisorConversationUpdate = Database['public']['Tables']['supervisor_conversations']['Update'];

export interface SupervisorMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface SupervisorConversationWithMessages extends Omit<SupervisorConversation, 'messages'> {
  messages: SupervisorMessage[];
}

/**
 * Получить все беседы с супервизором для пациента
 */
export async function getSupervisorConversations(
  patientId: string
): Promise<{ data: SupervisorConversationWithMessages[] | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('supervisor_conversations')
      .select('*')
      .eq('patient_id', patientId)
      .is('deleted_at', null)
      .order('saved_at', { ascending: false });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    const conversations = (data || []).map((conv) => ({
      ...conv,
      messages: (conv.messages as unknown as SupervisorMessage[]) || [],
    }));

    return { data: conversations, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Неизвестная ошибка при получении бесед'),
    };
  }
}

/**
 * Сохранить беседу с супервизором
 */
export async function saveSupervisorConversation(
  patientId: string,
  messages: SupervisorMessage[],
  title?: string
): Promise<{ data: SupervisorConversationWithMessages | null; error: Error | null }> {
  try {
    // Получаем текущего пользователя и его клинику
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { data: null, error: new Error('Пользователь не авторизован') };
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('clinic_id')
      .eq('id', user.id)
      .single();

    if (!profile?.clinic_id) {
      return { data: null, error: new Error('Клиника не найдена') };
    }

    // Генерируем заголовок из первого сообщения, если не указан
    const conversationTitle =
      title ||
      (messages.length > 0
        ? messages[0].content.substring(0, 50).replace(/\n/g, ' ') + (messages[0].content.length > 50 ? '...' : '')
        : 'Беседа с супервизором');

    const insertData: SupervisorConversationInsert = {
      patient_id: patientId,
      user_id: user.id,
      clinic_id: profile.clinic_id,
      title: conversationTitle,
      messages: messages as unknown as Json,
      message_count: messages.length,
      started_at: messages.length > 0 ? messages[0].timestamp : new Date().toISOString(),
      saved_at: new Date().toISOString(),
      is_draft: false,
    };

    const { data, error } = await supabase
      .from('supervisor_conversations')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return {
      data: {
        ...data,
        messages: (data.messages as unknown as SupervisorMessage[]) || [],
      },
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Неизвестная ошибка при сохранении беседы'),
    };
  }
}

/**
 * Обновить беседу с супервизором
 */
export async function updateSupervisorConversation(
  conversationId: string,
  updates: Partial<Pick<SupervisorConversationUpdate, 'title' | 'messages'>>
): Promise<{ data: SupervisorConversationWithMessages | null; error: Error | null }> {
  try {
    const updateData: SupervisorConversationUpdate = {
      ...updates,
      saved_at: new Date().toISOString(),
    };

    if (updates.messages) {
      updateData.message_count = Array.isArray(updates.messages) ? updates.messages.length : 0;
    }

    const { data, error } = await supabase
      .from('supervisor_conversations')
      .update(updateData)
      .eq('id', conversationId)
      .select()
      .single();

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return {
      data: {
        ...data,
        messages: (data.messages as unknown as SupervisorMessage[]) || [],
      },
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Неизвестная ошибка при обновлении беседы'),
    };
  }
}

/**
 * Поиск бесед с супервизором по тексту (в заголовке и сообщениях)
 */
export async function searchSupervisorConversations(
  patientId: string,
  searchQuery: string
): Promise<{ data: SupervisorConversationWithMessages[] | null; error: Error | null }> {
  try {
    if (!searchQuery.trim()) {
      // Если поисковый запрос пустой, возвращаем все беседы
      return getSupervisorConversations(patientId);
    }

    const query = searchQuery.trim().toLowerCase();

    // Получаем все беседы для пациента
    const { data: allConversations, error } = await supabase
      .from('supervisor_conversations')
      .select('*')
      .eq('patient_id', patientId)
      .is('deleted_at', null)
      .order('saved_at', { ascending: false });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    // Фильтруем беседы по поисковому запросу
    const filtered = (allConversations || []).filter((conv) => {
      // Поиск в заголовке
      const titleMatch = conv.title?.toLowerCase().includes(query);
      
      // Поиск в сообщениях
      const messages = (conv.messages as unknown as SupervisorMessage[]) || [];
      const messagesMatch = messages.some((msg) => 
        msg.content?.toLowerCase().includes(query)
      );

      return titleMatch || messagesMatch;
    });

    const conversations = filtered.map((conv) => ({
      ...conv,
      messages: (conv.messages as unknown as SupervisorMessage[]) || [],
    }));

    return { data: conversations, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Неизвестная ошибка при поиске бесед'),
    };
  }
}

/**
 * Получить одну беседу по ID
 */
export async function getSupervisorConversationById(
  conversationId: string
): Promise<{ data: SupervisorConversationWithMessages | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('supervisor_conversations')
      .select('*')
      .eq('id', conversationId)
      .is('deleted_at', null)
      .single();

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return {
      data: {
        ...data,
        messages: (data.messages as unknown as SupervisorMessage[]) || [],
      },
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Неизвестная ошибка при получении беседы'),
    };
  }
}

/**
 * Удалить беседу с супервизором (soft delete)
 */
export async function deleteSupervisorConversation(
  conversationId: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { error } = await supabase
      .from('supervisor_conversations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', conversationId);

    if (error) {
      return { success: false, error: new Error(error.message) };
    }

    return { success: true, error: null };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err : new Error('Неизвестная ошибка при удалении беседы'),
    };
  }
}
