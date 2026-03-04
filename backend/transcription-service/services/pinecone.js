import { Pinecone } from '@pinecone-database/pinecone';
import { generateEmbedding } from './openai.js';

/**
 * Сервис для работы с Pinecone Vector Store
 * Используется для RAG (knowledgeBase) в AI супервизоре
 */

// Singleton Pinecone index
let pineconeIndex = null;

/**
 * Получить Pinecone index (lazy init)
 */
function getPineconeIndex() {
  if (!pineconeIndex) {
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) {
      throw new Error('PINECONE_API_KEY is required for supervisor knowledgeBase');
    }

    const indexName = process.env.PINECONE_INDEX || 'aisupervision';
    const client = new Pinecone({ apiKey });
    pineconeIndex = client.index(indexName);
  }
  return pineconeIndex;
}

/**
 * Запрос к базе знаний через Pinecone
 *
 * @param {string} query - Текст запроса
 * @param {number} [topK=5] - Количество результатов
 * @returns {Promise<Array<{text: string, score: number}>>} Найденные документы
 */
export async function queryKnowledgeBase(query, topK = 5) {
  const namespace = process.env.PINECONE_NAMESPACE || 'SUPER';
  const index = getPineconeIndex();

  // Генерируем эмбеддинг для запроса
  const queryEmbedding = await generateEmbedding(query);

  // Запрос к Pinecone
  const results = await index.namespace(namespace).query({
    vector: queryEmbedding,
    topK,
    includeMetadata: true,
  });

  // Извлекаем текст из метаданных
  return (results.matches || []).map(match => ({
    text: match.metadata?.text || match.metadata?.content || match.metadata?.pageContent || '',
    score: match.score || 0,
  }));
}

/**
 * Проверяет, настроен ли Pinecone
 */
export function isPineconeConfigured() {
  return !!process.env.PINECONE_API_KEY;
}
