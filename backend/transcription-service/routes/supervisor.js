import express from 'express';
import { getOpenAIClient, executeWithRetry } from '../services/openai.js';
import { queryKnowledgeBase, isPineconeConfigured } from '../services/pinecone.js';

const router = express.Router();

// Максимальное количество итераций аgenтного цикла
const MAX_TOOL_ITERATIONS = 5;

// Максимальное количество сообщений в истории (matching n8n buffer window)
const MAX_HISTORY_MESSAGES = 30;

// Ограничение символов на контекст пациента в системном промпте
const MAX_CONTEXT_CHARS = 30000;

function truncateText(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '…';
}

/**
 * Построить системный промпт супервизора
 */
function buildSystemPrompt(context) {
  let contextBlock = '';

  // Демографические данные пациента
  if (context?.patient) {
    const p = context.patient;
    const parts = [];
    if (p.fullName) parts.push(`Имя: ${p.fullName}`);
    if (p.dateOfBirth) parts.push(`Дата рождения: ${p.dateOfBirth}`);
    if (p.gender) parts.push(`Пол: ${p.gender}`);
    if (p.notes) parts.push(`Заметки: ${truncateText(p.notes, 500)}`);
    if (parts.length > 0) {
      contextBlock += `<пациент>\n${parts.join('\n')}\n</пациент>\n\n`;
    }
  }

  // Сводка по случаю
  if (context?.caseSummary) {
    contextBlock += `<сводка_по_случаю>\n${truncateText(context.caseSummary, 5000)}\n</сводка_по_случаю>\n\n`;
  }

  // История сессий
  if (context?.sessions?.length > 0) {
    const sessionsText = context.sessions.map((s, i) => {
      const parts = [`Сессия ${i + 1}: ${s.date}, статус: ${s.status}`];
      if (s.durationMinutes) parts.push(`длительность: ${s.durationMinutes} мин`);
      if (s.summary) parts.push(`резюме: ${truncateText(s.summary, 500)}`);
      if (s.notes) parts.push(`заметки: ${truncateText(s.notes, 500)}`);
      if (s.transcripts?.length > 0) {
        const transcriptText = s.transcripts.map((t, j) =>
          `Транскрипт ${j + 1}: ${truncateText(t, 3000)}`
        ).join('\n');
        parts.push(`\n${transcriptText}`);
      }
      return parts.join(', ');
    }).join('\n');
    contextBlock += `<история_сессий>\n${sessionsText}\n</история_сессий>\n\n`;
  }

  // Клинические заметки
  if (context?.clinicalNotes?.length > 0) {
    const notesText = context.clinicalNotes.map((n, i) => {
      const parts = [`Заметка ${i + 1}: "${n.title}", статус: ${n.status}, дата: ${n.createdAt}`];
      if (n.summary) parts.push(`резюме: ${truncateText(n.summary, 500)}`);
      return parts.join(', ');
    }).join('\n');
    contextBlock += `<клинические_заметки>\n${notesText}\n</клинические_заметки>\n\n`;
  }

  // Обрезаем общий контекст если он слишком большой
  if (contextBlock.length > MAX_CONTEXT_CHARS) {
    contextBlock = contextBlock.slice(0, MAX_CONTEXT_CHARS) + '\n…(контекст обрезан)\n';
  }

  return `ТЫ — ЖЕНЩИНА, ВСЕМИРНО ИЗВЕСТНЫЙ ПСИХОЛОГ И СУПЕРВИЗОР С 30-ЛЕТНИМ СТАЖЕМ В ОБЛАСТИ ПСИХОТЕРАПИИ И ОБУЧЕНИЯ ПСИХОЛОГОВ. ПРИЗНАНА ЭКСПЕРТОМ В СООБЩЕСТВАХ, ВКЛЮЧАЯ APA, ПРЕПОДАВАЛА НА МЕЖДУНАРОДНЫХ ПРОГРАММАХ, СУПЕРВИЗИРОВАЛА БОЛЕЕ 1000 ПРАКТИКУЮЩИХ. ТЫ ПРОЧИТАЛА БОЛЕЕ 1000 КНИГ И УЧЕБНИКОВ ПО ПСИХОЛОГИЧЕСКОМУ КОНСУЛЬТИРОВАНИЮ, ПСИХОТЕРАПИИ, ПСИХИАТРИИ, ПСИХОДИАГНОСТИКЕ, И ОБЛАДАЕШЬ ЭНЦИКЛОПЕДИЧЕСКИМ ЗНАНИЕМ ОСНОВНЫХ ПОДХОДОВ К ПСИХОТЕРАПИИ

${contextBlock ? `<контекст_пациента>\n${contextBlock}</контекст_пациента>\n` : ''}
<instructions>
- ВСЕГДА ОТВЕЧАЙ НА РУССКОМ ЯЗЫКЕ
- ЕСЛИ ПРЕДОСТАВЛЕН КОНТЕКСТ ПАЦИЕНТА — УЧИТЫВАЙ ЕГО ПРИ ОТВЕТЕ. ОПИРАЙСЯ НА ИСТОРИЮ СЕССИЙ, КЛИНИЧЕСКИЕ ЗАМЕТКИ И СВОДКУ ПО СЛУЧАЮ ДЛЯ БОЛЕЕ ТОЧНЫХ РЕКОМЕНДАЦИЙ.
- При каждом вопросе ПЕРЕД генерацией ответа используй инструмент knowledgeBase. Используй его даже если считаешь, что знаешь ответ. Только после этого — формируй ответ.
- НЕ ПРИДУМЫВАЙ ОТВЕТЫ, КОТОРЫХ НЕТ В KnowledgeBase
- ОБРАЩАЙСЯ К ПСИХОЛОГУ МЯГКО И ПОДДЕРЖИВАЮЩЕ, НО ПРИ ЭТОМ УВАЖИТЕЛЬНО, ПРОФЕССИОНАЛЬНО.
- ПРИ ОТВЕТЕ В ПЕРВУЮ ОЧЕРЕДЬ ОБРАЩАЙСЯ К KNOWLEDGEBASE, ТОЛЬКО ЕСЛИ ТАМ НЕТ НУЖНОГО ОТВЕТА - ПЕРЕКЛЮЧАЙСЯ В СУПЕРВИЗОРСКУЮ ПОЗИЦИЮ С ФОКУСОМ НА ПОДДЕРЖКУ И РАЗВИТИЕ ОСОЗНАННОСТИ СПЕЦИАЛИСТА.
- ПРИ НЕОБХОДИМОСТИ РАБОТАЙ С ПРОТИВОПЕРЕНОСОМ, ЭТИКОЙ, ПРОФГРАНИЦАМИ, ВТОРИЧНОЙ ТРАВМАТИЗАЦИЕЙ И САМОЗАБОТОЙ СПЕЦИАЛИСТА.
- ДОПУСКАЙ ЮМОР, ЕСЛИ УМЕСТНО.

КАЛИБРОВКА ДЛИНЫ И ГЛУБИНЫ ОТВЕТА:
Перед каждым ответом определи тип запроса:

1. КОНКРЕТНЫЙ КОРОТКИЙ ВОПРОС (например: "подскажи 3 интервенции", "что думаешь про эту технику?", "как лучше завершить сессию?"):
   → Отвечай коротко и по делу: 3-7 предложений, чёткие пункты без длинных преамбул.
   → Предлагай конкретные примеры применения на практике.
   → В конце можешь спросить: «Хочешь раскрою какой-то из пунктов подробнее?»

2. ЗАПРОС НА РАЗВЁРНУТЫЙ АНАЛИЗ (например: "проведи подробный анализ сессии", "разбери динамику случая"):
   → Давай структурированный ответ с подзаголовками/пунктами.
   → Разбивай на смысловые блоки, не выдавай всё одной стеной текста.
   → Укажи, на чём основаны рекомендации и какие теоретические позиции лежат в основе.
   → Даже развёрнутый ответ не должен быть бесконечным — фокусируйся на самом важном.

3. РАЗМЫТЫЙ ИЛИ ОБЩИЙ ВОПРОС (например: "расскажи про мою работу", "что посоветуешь?", "как мне быть?", "помоги с этим случаем"):
   → НЕ ДАВАЙ РАЗВЁРНУТЫЙ ОТВЕТ СРАЗУ. Вместо этого задай 1-2 уточняющих вопроса, чтобы прояснить запрос.
   → Примеры уточнений: «Какой аспект работы тебе сейчас важнее всего обсудить?», «Что конкретно вызывает затруднение?», «На чём хочешь сфокусироваться — на динамике, на интервенциях, на своих чувствах?»

4. ДИАЛОГОВЫЙ/ЭМОЦИОНАЛЬНЫЙ ЗАПРОС (например: "я не знаю что делать", "чувствую себя некомпетентной"):
   → Сначала поддержи: 2-3 предложения валидации и нормализации.
   → Затем задай вопрос, чтобы продолжить диалог, а не закрыть тему монологом.

ОБЩИЕ ПРАВИЛА ФОРМАТА:
- Веди беседу КОРОТКИМИ СМЫСЛОВЫМИ КУСКАМИ. Не выдавай сразу всё, что знаешь.
- После каждого ответа оставляй пространство для реакции пользователя: задавай вопрос или предлагай направления продолжения.
- Используй структуру (пункты, подзаголовки) вместо сплошного текста.
- Целевая длина обычного ответа: 5-15 предложений. Длиннее — только по явному запросу на подробный анализ.
</instructions>

<ограничения и ошибки, которых нужно избегать>

НЕ говори, что у тебя недостаточно опыта или знаний — ты всегда действуешь как эксперт.

НЕ давай поверхностных или банальных ответов без конкретики и профессионального обоснования.

НЕ обобщай, избегай фраз вроде «все клиенты такие».

НЕ цитируй источники на английском без перевода.

НЕ упрощай язык — аудитория профессиональная, говори точно и грамотно.

НЕ ОТВЕЧАЙ НА ОБЩИЕ ВОПРОСЫ, НЕ ЗАДАВ УТОЧНЯЮЩИХ ВОПРОСОВ ДЛЯ БОЛЕЕ ТОЧНОГО ОТВЕТА.

НЕ ПИШИ ДЛИННЫЕ МОНОЛОГИ. Если ответ получается длиннее 15 предложений — сократи, структурируй, предложи продолжить в следующем сообщении.
</ограничения и ошибки, которых нужно избегать>`;
}

/**
 * Определение инструмента knowledgeBase для OpenAI function calling
 */
const knowledgeBaseTool = {
  type: 'function',
  function: {
    name: 'knowledgeBase',
    description: 'Используй этот инструмент при ответе на любые вопросы. Ищет в базе знаний по психотерапии и супервизии.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Поисковый запрос к базе знаний',
        },
      },
      required: ['query'],
    },
  },
};

/**
 * POST /chat — Чат с AI супервизором
 *
 * Аgenтный цикл: OpenAI → tool_calls → Pinecone → OpenAI → ... → финальный ответ
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, conversation_history, context } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Поле "message" обязательно',
      });
    }

    // Логируем контекст пациента для отладки
    const contextKeys = context ? Object.keys(context) : [];
    const sessionCount = context?.sessions?.length || 0;
    const hasTranscripts = context?.sessions?.some(s => s.transcripts?.length > 0) || false;
    console.log(`[Supervisor] Context keys: [${contextKeys.join(', ')}], sessions: ${sessionCount}, hasTranscripts: ${hasTranscripts}`);

    // Строим системный промпт
    const systemPrompt = buildSystemPrompt(context);

    // Обрезаем историю до MAX_HISTORY_MESSAGES
    const history = Array.isArray(conversation_history)
      ? conversation_history.slice(-MAX_HISTORY_MESSAGES)
      : [];

    // Строим начальные сообщения
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ];

    // Определяем доступные инструменты
    const tools = isPineconeConfigured() ? [knowledgeBaseTool] : [];

    const openai = getOpenAIClient();
    let finalContent = null;

    // Аgenтный цикл
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const makeRequest = async () => {
        const params = {
          model: 'gpt-5',
          messages,
          temperature: 1,
        };

        if (tools.length > 0) {
          params.tools = tools;
        }

        return openai.chat.completions.create(params);
      };

      let completion;
      try {
        completion = await executeWithRetry(makeRequest, 'supervisor-chat');
      } catch (error) {
        // Fallback на gpt-4o при model_not_found
        if (error.code === 'model_not_found') {
          console.warn('[Supervisor] gpt-5 not available, falling back to gpt-4o');
          const fallbackRequest = async () => {
            const params = {
              model: 'gpt-4o',
              messages,
              temperature: 1,
            };
            if (tools.length > 0) {
              params.tools = tools;
            }
            return openai.chat.completions.create(params);
          };
          completion = await executeWithRetry(fallbackRequest, 'supervisor-chat-fallback');
        } else {
          throw error;
        }
      }

      const choice = completion.choices[0];
      const assistantMessage = choice.message;

      // Если нет tool_calls — это финальный ответ
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        finalContent = assistantMessage.content;
        break;
      }

      // Добавляем сообщение ассистента с tool_calls в историю
      messages.push(assistantMessage);

      // Обрабатываем каждый tool_call
      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.function.name === 'knowledgeBase') {
          let args;
          try {
            args = JSON.parse(toolCall.function.arguments);
          } catch {
            args = { query: message };
          }

          console.log(`[Supervisor] knowledgeBase query: "${args.query}"`);

          let toolResult;
          try {
            const results = await queryKnowledgeBase(args.query);
            if (results.length > 0) {
              toolResult = results.map(r => r.text).join('\n\n---\n\n');
            } else {
              toolResult = 'В базе знаний не найдено релевантных результатов по данному запросу.';
            }
          } catch (error) {
            console.error('[Supervisor] knowledgeBase error:', error.message);
            toolResult = 'Ошибка при обращении к базе знаний. Ответь на основе своих знаний.';
          }

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolResult,
          });
        }
      }
    }

    // Если цикл исчерпан без финального ответа
    if (finalContent === null) {
      console.warn('[Supervisor] Max tool iterations reached, requesting final answer');
      messages.push({
        role: 'user',
        content: 'Пожалуйста, дай финальный ответ на основе собранной информации.',
      });

      const finalRequest = async () => {
        return openai.chat.completions.create({
          model: 'gpt-5',
          messages,
          temperature: 1,
        });
      };

      try {
        const finalCompletion = await executeWithRetry(finalRequest, 'supervisor-chat-final');
        finalContent = finalCompletion.choices[0]?.message?.content;
      } catch (error) {
        if (error.code === 'model_not_found') {
          const fallback = await executeWithRetry(
            () => openai.chat.completions.create({ model: 'gpt-4o', messages, temperature: 0.7 }),
            'supervisor-chat-final-fallback'
          );
          finalContent = fallback.choices[0]?.message?.content;
        } else {
          throw error;
        }
      }
    }

    if (!finalContent) {
      throw new Error('AI супервизор не вернул ответ');
    }

    res.json({
      success: true,
      data: { message: finalContent },
    });
  } catch (error) {
    console.error('[Supervisor] Error:', error.message);

    if (error.status === 429) {
      return res.status(429).json({
        success: false,
        error: 'Превышен лимит запросов к OpenAI API. Попробуйте позже.',
      });
    }

    res.status(500).json({
      success: false,
      error: `Ошибка AI супервизора: ${error.message}`,
    });
  }
});

export { router as supervisorRoute };
