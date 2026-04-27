import express from 'express';
import { Bot, webhookCallback } from 'grammy';
import { connectToDatabase } from '../db/connection.js';
import { telegramToken, webhookUrl, serverPort } from '../config/env.js';
import { rateLimiterMiddleware } from './middleware/rateLimiter.js';
import { sessionMiddleware } from './middleware/sessionMiddleware.js';
import { getMainKeyboard, sendMainMenuMessage } from '../handlers/menuHandlers.js';
import { SessionModel } from '../db/models/Session.js';
import { InlineKeyboard } from 'grammy';
import { creatorId } from '../config/env.js';
import {
  handleJournalMenuButton,
  handleJournalDateCallback,
  handleJournalCalendarCallback,
  handleJournalCalendarCloseCallback,
  handleAppointmentDeleteCallback,
  handleAppointmentConfirmDeleteCallback,
} from '../handlers/journalHandlers.js';
import {
  showClientList,
  handleClientOpenCallback,
  handleClientCreateCallback,
  handleClientBackToListCallback,
  handleClientPhotosCallback,
  handleSkipPhoneCallback,
  handleNewClientNameInput,
  handleNewClientPhoneInput,
  handleClientPageCallback,
  handleClientSearchCallback,
  handleClientSearchInput,
  handleClientAutoCreateCallback,
} from '../handlers/clientHandlers.js';
import {
  showCashRegister,
  handleAddIncomeCallback,
  handleAddExpenseCallback,
  handleFinanceTextInput,
  showFinanceAnalytics,
} from '../handlers/financeHandlers.js';
import {
  showShoppingList,
  handleNeedDeleteCallback,
  handleAddNeedFromText,
} from '../handlers/needsHandlers.js';
import { handlePhotoMessage, handlePhotoClassifyCallback, handlePhotoAttachToClientCallback, handlePhotoAttachSkipCallback } from '../handlers/photoHandlers.js';
import { handleVoiceMessage, handleAIConfirmCallback, handleAICancelCallback, prepareActionConfirmation } from '../handlers/voiceHandlers.js';
import { parseIntentFromText } from '../services/geminiService.js';
import { startCronJobs } from '../services/cronService.js';

const bot = new Bot(telegramToken);

bot.use(rateLimiterMiddleware);
bot.use(sessionMiddleware);

bot.command('start', async (ctx) => {
  await sendMainMenuMessage(
    ctx,
    `👋 Привет! Я твой персональный ассистент парикмахера.\n\nВыбери раздел в меню ниже.`
  );
});

bot.hears('🗓 ЖУРНАЛ', handleJournalMenuButton);
bot.hears('👥 КЛИЕНТЫ', async (ctx) => {
  ctx.session.step = 'IDLE';
  ctx.session.activeClientId = null;
  await ctx.saveSession();
  await showClientList(ctx);
});
bot.hears('💸 КАССА', async (ctx) => {
  ctx.session.step = 'IDLE';
  await ctx.saveSession();
  await showCashRegister(ctx);
});
bot.hears('🛒 СПИСОК', async (ctx) => {
  ctx.session.step = 'IDLE';
  await ctx.saveSession();
  await showShoppingList(ctx);
});

bot.hears('👤 АДМИН', async (ctx) => {
  if (ctx.from?.id !== creatorId) return;
  
  const adminKeyboard = new InlineKeyboard()
    .text('📊 Количество активных пользователей', 'admin_user_count');
    
  await ctx.reply('🎛 *Панель администратора*', {
    parse_mode: 'Markdown',
    reply_markup: adminKeyboard
  });
});

bot.callbackQuery('admin_user_count', async (ctx) => {
  if (ctx.from?.id !== creatorId) {
    await ctx.answerCallbackQuery('У вас нет доступа');
    return;
  }
  
  const userCount = await SessionModel.countDocuments();
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(`📊 *Всего пользователей в базе:* ${userCount}`, {
    parse_mode: 'Markdown',
    reply_markup: new InlineKeyboard().text('🔄 Обновить', 'admin_user_count')
  });
});

bot.callbackQuery(/^journal_date:/, handleJournalDateCallback);
bot.callbackQuery('journal_calendar', handleJournalCalendarCallback);
bot.callbackQuery('journal_calendar_close', handleJournalCalendarCloseCallback);
bot.callbackQuery(/^journal_cancel:/, handleAppointmentDeleteCallback);
bot.callbackQuery(/^journal_confirm_cancel:/, handleAppointmentConfirmDeleteCallback);
bot.callbackQuery('journal_add_appointment', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    '🎙 *Как создать запись?*\n\n' +
    'В этом боте не нужно заполнять скучные формы! Просто напиши мне или отправь голосовое сообщение:\n\n' +
    '_«Запиши Машу на завтра в 14:00 на окрашивание»_\n' +
    '_«Катя придет в пятницу на 12:00»_\n\n' +
    'Напиши или продиктуй запись прямо сейчас 👇',
    { parse_mode: 'Markdown' }
  );
});

bot.callbackQuery(/^client_open:/, handleClientOpenCallback);
bot.callbackQuery('client_create', handleClientCreateCallback);
bot.callbackQuery('client_back_to_list', handleClientBackToListCallback);
bot.callbackQuery(/^client_photos:/, handleClientPhotosCallback);
bot.callbackQuery('client_skip_phone', handleSkipPhoneCallback);
bot.callbackQuery(/^client_page:/, handleClientPageCallback);
bot.callbackQuery('client_search', handleClientSearchCallback);
bot.callbackQuery(/^client_auto_create:/, handleClientAutoCreateCallback);
bot.callbackQuery(/^client_edit:/, async (ctx) => {
  await ctx.answerCallbackQuery('🚧 Функция редактирования в разработке');
});

bot.callbackQuery('finance_add_income', handleAddIncomeCallback);
bot.callbackQuery('finance_add_expense', handleAddExpenseCallback);
bot.callbackQuery('finance_analytics', showFinanceAnalytics);
bot.callbackQuery('finance_back', showCashRegister);

bot.callbackQuery(/^need_delete:/, handleNeedDeleteCallback);
bot.callbackQuery('need_add', async (ctx) => {
  ctx.session.step = 'AWAIT_NEED';
  await ctx.saveSession();
  await ctx.answerCallbackQuery();
  await ctx.reply('✏️ Напиши, что нужно купить:');
});

bot.callbackQuery(/^photo_classify:/, handlePhotoClassifyCallback);
bot.callbackQuery(/^photo_attach_to_client:/, handlePhotoAttachToClientCallback);
bot.callbackQuery('photo_attach_skip', handlePhotoAttachSkipCallback);

bot.callbackQuery('ai_confirm', handleAIConfirmCallback);
bot.callbackQuery('ai_cancel', handleAICancelCallback);

bot.on('message:photo', handlePhotoMessage);
bot.on(['message:voice', 'message:audio'], handleVoiceMessage);

bot.on('message:text', async (ctx) => {
  const currentStep = ctx.session?.step ?? 'IDLE';
  const messageText = ctx.message.text;

  if (currentStep === 'AWAIT_CLIENT_NAME') {
    await handleNewClientNameInput(ctx);
    return;
  }

  if (currentStep === 'AWAIT_CLIENT_PHONE') {
    await handleNewClientPhoneInput(ctx);
    return;
  }

  if (currentStep === 'AWAIT_CLIENT_SEARCH') {
    await handleClientSearchInput(ctx);
    return;
  }

  if (currentStep === 'AWAIT_INCOME') {
    await handleFinanceTextInput(ctx, 'income');
    return;
  }

  if (currentStep === 'AWAIT_EXPENSE') {
    await handleFinanceTextInput(ctx, 'expense');
    return;
  }

  if (currentStep === 'AWAIT_NEED') {
    await handleAddNeedFromText(ctx);
    return;
  }

  // Глобальный NLP для текста
  const isCommand = messageText.startsWith('/');
  const isMenuButton = ['🗓 ЖУРНАЛ', '👥 КЛИЕНТЫ', '💸 КАССА', '🛒 СПИСОК'].includes(messageText);

  if (!isCommand && !isMenuButton) {
    const MINIMUM_TEXT_LENGTH_FOR_NLP = 3;
    const GARBAGE_WORDS = ['ок', 'да', 'нет', 'привет', 'спс', 'спасибо', 'хорошо', 'ладно', 'ага', 'угу', 'пока', 'лан'];
    const lowerText = messageText.toLowerCase().trim();

    if (lowerText.length < MINIMUM_TEXT_LENGTH_FOR_NLP || GARBAGE_WORDS.includes(lowerText)) {
      await ctx.reply('👇 Используй кнопки меню ниже или пришли голосовое сообщение.', { reply_markup: getMainKeyboard(ctx) });
      return;
    }

    try {
      const parsedIntent = await parseIntentFromText(messageText);
      await prepareActionConfirmation(ctx, parsedIntent);
      return;
    } catch (error) {
      console.error('Ошибка NLP текста:', error);
    }
  }

  await ctx.reply(
    '👇 Используй кнопки меню ниже или пришли голосовое сообщение.',
    { reply_markup: getMainKeyboard(ctx) }
  );
});

bot.catch((error) => {
  console.error('Ошибка бота:', error.message);
});

async function startBot() {
  await connectToDatabase();
  startCronJobs(bot);

  const expressApplication = express();
  expressApplication.use(express.json());

  expressApplication.get('/health', (_request, response) => {
    response.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  if (process.env.NODE_ENV === 'production') {
    const webhookEndpoint = `${webhookUrl}/webhook`;
    await bot.api.setWebhook(webhookEndpoint);
    console.log(`Webhook установлен: ${webhookEndpoint}`);

    expressApplication.use('/webhook', webhookCallback(bot, 'express'));
  } else {
    await bot.api.deleteWebhook();
    bot.start();
    console.log('Бот запущен в режиме Long Polling (локально)');
  }

  expressApplication.listen(serverPort, () => {
    console.log(`Сервер запущен на порту ${serverPort}`);
  });
}

startBot();
