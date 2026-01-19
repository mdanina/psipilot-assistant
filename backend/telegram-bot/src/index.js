import { Bot, session, InlineKeyboard } from 'grammy';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Конфигурация
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID; // ID группы/канала для уведомлений

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN не установлен');
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_URL или SUPABASE_SERVICE_KEY не установлены');
  process.exit(1);
}

// Инициализация Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Инициализация бота
const bot = new Bot(BOT_TOKEN);

// Категории обращений
const CATEGORIES = {
  bug: { label: '🐛 Техническая ошибка', value: 'bug' },
  feature: { label: '💡 Предложение', value: 'feature' },
  complaint: { label: '😞 Жалоба', value: 'complaint' },
  question: { label: '❓ Вопрос', value: 'question' },
  other: { label: '📝 Другое', value: 'other' },
};

// Состояния диалога
const STATES = {
  IDLE: 'idle',
  WAITING_CATEGORY: 'waiting_category',
  WAITING_MESSAGE: 'waiting_message',
  WAITING_CONTACT: 'waiting_contact',
  WAITING_ATTACHMENT: 'waiting_attachment',
  CONFIRM: 'confirm',
};

// Session middleware
bot.use(
  session({
    initial: () => ({
      state: STATES.IDLE,
      category: null,
      message: null,
      contact: null,
      attachments: [],
    }),
  })
);

// Команда /start
bot.command('start', async (ctx) => {
  ctx.session = {
    state: STATES.IDLE,
    category: null,
    message: null,
    contact: null,
    attachments: [],
  };

  await ctx.reply(
    `👋 Добро пожаловать в службу поддержки PsiPilot!\n\n` +
      `Здесь вы можете:\n` +
      `• Сообщить о технической ошибке\n` +
      `• Предложить улучшение\n` +
      `• Задать вопрос\n` +
      `• Оставить жалобу или отзыв\n\n` +
      `Нажмите /new чтобы создать новое обращение.`
  );
});

// Команда /new - начало нового обращения
bot.command('new', async (ctx) => {
  ctx.session = {
    state: STATES.WAITING_CATEGORY,
    category: null,
    message: null,
    contact: null,
    attachments: [],
  };

  const keyboard = new InlineKeyboard();
  Object.values(CATEGORIES).forEach((cat, index) => {
    keyboard.text(cat.label, `category:${cat.value}`);
    if (index % 2 === 1) keyboard.row();
  });

  await ctx.reply('📋 Выберите категорию обращения:', {
    reply_markup: keyboard,
  });
});

// Команда /cancel - отмена текущего обращения
bot.command('cancel', async (ctx) => {
  ctx.session = {
    state: STATES.IDLE,
    category: null,
    message: null,
    contact: null,
    attachments: [],
  };

  await ctx.reply('❌ Обращение отменено. Нажмите /new чтобы начать заново.');
});

// Команда /help
bot.command('help', async (ctx) => {
  await ctx.reply(
    `📖 Доступные команды:\n\n` +
      `/new - Создать новое обращение\n` +
      `/cancel - Отменить текущее обращение\n` +
      `/status - Проверить статус обращений\n` +
      `/help - Показать эту справку`
  );
});

// Команда /status - статус обращений пользователя
bot.command('status', async (ctx) => {
  const telegramUserId = ctx.from.id;

  const { data: complaints, error } = await supabase
    .from('complaints')
    .select('id, category, status, created_at, subject')
    .eq('telegram_user_id', telegramUserId)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Ошибка получения обращений:', error);
    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
    return;
  }

  if (!complaints || complaints.length === 0) {
    await ctx.reply('📭 У вас пока нет обращений.');
    return;
  }

  const statusEmoji = {
    new: '🆕',
    in_progress: '⏳',
    resolved: '✅',
    closed: '📁',
  };

  const statusText = {
    new: 'Новое',
    in_progress: 'В обработке',
    resolved: 'Решено',
    closed: 'Закрыто',
  };

  let message = '📋 Ваши последние обращения:\n\n';

  complaints.forEach((c, i) => {
    const date = new Date(c.created_at).toLocaleDateString('ru-RU');
    const emoji = statusEmoji[c.status] || '📝';
    const status = statusText[c.status] || c.status;
    const category = CATEGORIES[c.category]?.label || c.category;

    message += `${i + 1}. ${emoji} ${status}\n`;
    message += `   ${category}\n`;
    if (c.subject) message += `   "${c.subject.substring(0, 50)}..."\n`;
    message += `   📅 ${date}\n\n`;
  });

  await ctx.reply(message);
});

// Обработка выбора категории
bot.callbackQuery(/^category:(.+)$/, async (ctx) => {
  const category = ctx.match[1];
  ctx.session.category = category;
  ctx.session.state = STATES.WAITING_MESSAGE;

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `✅ Категория: ${CATEGORIES[category]?.label || category}\n\n` +
      `📝 Теперь опишите вашу проблему или вопрос.\n` +
      `Постарайтесь изложить суть максимально подробно.`
  );
});

// Обработка подтверждения отправки
bot.callbackQuery('confirm_send', async (ctx) => {
  await ctx.answerCallbackQuery();

  const session = ctx.session;
  const user = ctx.from;

  // Сохранение в БД
  const { data, error } = await supabase.from('complaints').insert({
    telegram_user_id: user.id,
    telegram_username: user.username,
    telegram_first_name: user.first_name,
    telegram_last_name: user.last_name,
    category: session.category,
    subject: session.message?.substring(0, 100),
    message: session.message,
    contact_info: session.contact,
    attachments: session.attachments,
    telegram_message_id: ctx.callbackQuery.message?.message_id,
  });

  if (error) {
    console.error('Ошибка сохранения обращения:', error);
    await ctx.editMessageText(
      '❌ Произошла ошибка при отправке обращения. Пожалуйста, попробуйте позже.'
    );
    return;
  }

  // Уведомление администраторов
  if (ADMIN_CHAT_ID) {
    try {
      const categoryLabel = CATEGORIES[session.category]?.label || session.category;
      const userName = user.username ? `@${user.username}` : user.first_name;

      let adminMessage =
        `🔔 *Новое обращение*\n\n` +
        `👤 От: ${userName}\n` +
        `📋 Категория: ${categoryLabel}\n` +
        `📧 Контакт: ${session.contact || 'не указан'}\n\n` +
        `📝 *Сообщение:*\n${session.message?.substring(0, 500)}`;

      if (session.attachments.length > 0) {
        adminMessage += `\n\n📎 Вложений: ${session.attachments.length}`;
      }

      await bot.api.sendMessage(ADMIN_CHAT_ID, adminMessage, {
        parse_mode: 'Markdown',
      });

      // Пересылка вложений
      for (const attachment of session.attachments) {
        try {
          if (attachment.file_type === 'photo') {
            await bot.api.sendPhoto(ADMIN_CHAT_ID, attachment.file_id);
          } else if (attachment.file_type === 'document') {
            await bot.api.sendDocument(ADMIN_CHAT_ID, attachment.file_id);
          } else if (attachment.file_type === 'video') {
            await bot.api.sendVideo(ADMIN_CHAT_ID, attachment.file_id);
          }
        } catch (e) {
          console.error('Ошибка пересылки вложения:', e);
        }
      }
    } catch (e) {
      console.error('Ошибка уведомления администраторов:', e);
    }
  }

  // Сброс сессии
  ctx.session = {
    state: STATES.IDLE,
    category: null,
    message: null,
    contact: null,
    attachments: [],
  };

  await ctx.editMessageText(
    `✅ Ваше обращение успешно отправлено!\n\n` +
      `Мы рассмотрим его в ближайшее время и свяжемся с вами при необходимости.\n\n` +
      `Спасибо за обратную связь! 🙏`
  );
});

// Обработка отмены через callback
bot.callbackQuery('cancel_send', async (ctx) => {
  await ctx.answerCallbackQuery();

  ctx.session = {
    state: STATES.IDLE,
    category: null,
    message: null,
    contact: null,
    attachments: [],
  };

  await ctx.editMessageText('❌ Обращение отменено. Нажмите /new чтобы начать заново.');
});

// Обработка пропуска контакта
bot.callbackQuery('skip_contact', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.contact = null;
  ctx.session.state = STATES.WAITING_ATTACHMENT;

  const keyboard = new InlineKeyboard()
    .text('⏭ Пропустить', 'skip_attachment')
    .row();

  await ctx.editMessageText(
    `📎 Хотите прикрепить файл (скриншот, документ)?\n\n` +
      `Отправьте файл или фото, или нажмите "Пропустить".`,
    { reply_markup: keyboard }
  );
});

// Обработка пропуска вложения
bot.callbackQuery('skip_attachment', async (ctx) => {
  await ctx.answerCallbackQuery();
  await showConfirmation(ctx);
});

// Обработка завершения добавления вложений
bot.callbackQuery('done_attachments', async (ctx) => {
  await ctx.answerCallbackQuery();
  await showConfirmation(ctx);
});

// Функция показа подтверждения
async function showConfirmation(ctx) {
  ctx.session.state = STATES.CONFIRM;

  const session = ctx.session;
  const categoryLabel = CATEGORIES[session.category]?.label || session.category;

  let summary =
    `📋 *Проверьте ваше обращение:*\n\n` +
    `📌 Категория: ${categoryLabel}\n` +
    `📧 Контакт: ${session.contact || 'не указан'}\n` +
    `📎 Вложений: ${session.attachments.length}\n\n` +
    `📝 *Сообщение:*\n${session.message?.substring(0, 500)}`;

  if (session.message && session.message.length > 500) {
    summary += '...';
  }

  const keyboard = new InlineKeyboard()
    .text('✅ Отправить', 'confirm_send')
    .text('❌ Отменить', 'cancel_send');

  // Используем reply вместо editMessageText для универсальности
  await ctx.reply(summary, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}

// Обработка текстовых сообщений
bot.on('message:text', async (ctx) => {
  const session = ctx.session;
  const text = ctx.message.text;

  // Игнорируем команды
  if (text.startsWith('/')) return;

  switch (session.state) {
    case STATES.WAITING_MESSAGE:
      session.message = text;
      session.state = STATES.WAITING_CONTACT;

      const keyboard = new InlineKeyboard().text('⏭ Пропустить', 'skip_contact').row();

      await ctx.reply(
        `✅ Сообщение сохранено!\n\n` +
          `📧 Укажите контакт для обратной связи (email или телефон).\n` +
          `Или нажмите "Пропустить" если не хотите оставлять контакт.`,
        { reply_markup: keyboard }
      );
      break;

    case STATES.WAITING_CONTACT:
      session.contact = text;
      session.state = STATES.WAITING_ATTACHMENT;

      const attachKeyboard = new InlineKeyboard()
        .text('⏭ Пропустить', 'skip_attachment')
        .row();

      await ctx.reply(
        `✅ Контакт сохранен: ${text}\n\n` +
          `📎 Хотите прикрепить файл (скриншот, документ)?\n` +
          `Отправьте файл или фото, или нажмите "Пропустить".`,
        { reply_markup: attachKeyboard }
      );
      break;

    case STATES.IDLE:
      await ctx.reply(
        `Чтобы создать обращение, нажмите /new\n` + `Для справки используйте /help`
      );
      break;

    default:
      await ctx.reply(
        `Пожалуйста, следуйте инструкциям выше или нажмите /cancel для отмены.`
      );
  }
});

// Обработка фото
bot.on('message:photo', async (ctx) => {
  if (ctx.session.state !== STATES.WAITING_ATTACHMENT) {
    if (ctx.session.state === STATES.WAITING_MESSAGE) {
      await ctx.reply('📝 Сначала опишите вашу проблему текстом, затем можно прикрепить файлы.');
      return;
    }
    await ctx.reply('Чтобы создать обращение, нажмите /new');
    return;
  }

  const photo = ctx.message.photo[ctx.message.photo.length - 1]; // Берем максимальное качество
  ctx.session.attachments.push({
    file_id: photo.file_id,
    file_type: 'photo',
    file_name: 'photo.jpg',
  });

  const keyboard = new InlineKeyboard()
    .text('📎 Добавить еще', 'add_more')
    .text('✅ Готово', 'done_attachments');

  await ctx.reply(
    `✅ Фото прикреплено (всего: ${ctx.session.attachments.length})\n\n` +
      `Можете добавить еще файлы или нажмите "Готово".`,
    { reply_markup: keyboard }
  );
});

// Обработка документов
bot.on('message:document', async (ctx) => {
  if (ctx.session.state !== STATES.WAITING_ATTACHMENT) {
    if (ctx.session.state === STATES.WAITING_MESSAGE) {
      await ctx.reply('📝 Сначала опишите вашу проблему текстом, затем можно прикрепить файлы.');
      return;
    }
    await ctx.reply('Чтобы создать обращение, нажмите /new');
    return;
  }

  const doc = ctx.message.document;
  ctx.session.attachments.push({
    file_id: doc.file_id,
    file_type: 'document',
    file_name: doc.file_name || 'document',
  });

  const keyboard = new InlineKeyboard()
    .text('📎 Добавить еще', 'add_more')
    .text('✅ Готово', 'done_attachments');

  await ctx.reply(
    `✅ Документ "${doc.file_name}" прикреплен (всего: ${ctx.session.attachments.length})\n\n` +
      `Можете добавить еще файлы или нажмите "Готово".`,
    { reply_markup: keyboard }
  );
});

// Обработка видео
bot.on('message:video', async (ctx) => {
  if (ctx.session.state !== STATES.WAITING_ATTACHMENT) {
    await ctx.reply('Чтобы создать обращение, нажмите /new');
    return;
  }

  const video = ctx.message.video;
  ctx.session.attachments.push({
    file_id: video.file_id,
    file_type: 'video',
    file_name: video.file_name || 'video.mp4',
  });

  const keyboard = new InlineKeyboard()
    .text('📎 Добавить еще', 'add_more')
    .text('✅ Готово', 'done_attachments');

  await ctx.reply(
    `✅ Видео прикреплено (всего: ${ctx.session.attachments.length})\n\n` +
      `Можете добавить еще файлы или нажмите "Готово".`,
    { reply_markup: keyboard }
  );
});

// Callback для добавления еще файлов
bot.callbackQuery('add_more', async (ctx) => {
  await ctx.answerCallbackQuery('Отправьте еще файл или фото');
});

// Обработка ошибок
bot.catch((err) => {
  console.error('Ошибка бота:', err);
});

// Запуск бота
console.log('🤖 Запуск Telegram бота...');
bot.start({
  onStart: (botInfo) => {
    console.log(`✅ Бот @${botInfo.username} запущен!`);
  },
});
