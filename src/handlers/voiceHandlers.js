import { InlineKeyboard } from 'grammy';
import { parseIntentFromAudio, escapeRegExpSpecialChars } from '../services/geminiService.js';
import { downloadTelegramFileAsBase64ByPath, detectAudioMimeType } from '../services/telegramFileService.js';
import { AppointmentModel } from '../db/models/Appointment.js';
import { FinanceModel } from '../db/models/Finance.js';
import { NeedModel } from '../db/models/Need.js';
import { ClientModel } from '../db/models/Client.js';

export async function handleVoiceMessage(ctx) {
  const masterId = String(ctx.from.id);
  const voiceMessage = ctx.message.voice || ctx.message.audio;

  if (!voiceMessage) {
    await ctx.reply('Не удалось получить аудио сообщение.');
    return;
  }

  const listeningMessage = await ctx.reply('🎙 Слушаю...');

  try {
    const telegramFile = await ctx.api.getFile(voiceMessage.file_id);
    const mimeType = detectAudioMimeType(telegramFile.file_path || '');
    
    const audioBase64 = await downloadTelegramFileAsBase64ByPath(telegramFile.file_path);
    const parsedIntent = await parseIntentFromAudio(audioBase64, mimeType);
    
    await ctx.api.deleteMessage(ctx.chat.id, listeningMessage.message_id);
    await prepareActionConfirmation(ctx, parsedIntent);
  } catch (error) {
    console.error('Ошибка обработки голоса:', error);
    await ctx.reply('❌ Не смог разобрать голос. Попробуй еще раз или напиши текстом.');
  }
}

export async function prepareActionConfirmation(ctx, parsedIntent) {
  const { actions, userMessage } = parsedIntent;

  if (!actions || actions.length === 0 || actions.every(a => a.action === 'unknown')) {
    await ctx.reply(userMessage || '🤖 Не совсем понял запрос. Уточни, пожалуйста.');
    return;
  }

  ctx.session.pendingActions = actions;
  await ctx.saveSession();

  const confirmationKeyboard = new InlineKeyboard()
    .text('✅ Подтвердить всё', 'ai_confirm')
    .text('❌ Отмена', 'ai_cancel');

  await ctx.reply(`🤖 Проверь данные:\n\n${userMessage}`, {
    reply_markup: confirmationKeyboard,
    parse_mode: 'Markdown',
  });
}

export async function handleAIConfirmCallback(ctx) {
  const masterId = String(ctx.from.id);
  const actions = ctx.session.pendingActions;

  if (!actions || actions.length === 0) {
    await ctx.answerCallbackQuery('Нет активных действий.');
    return;
  }

  try {
    // Выполняем все действия по порядку
    for (const actionItem of actions) {
      await executeConfirmedAction(ctx, masterId, actionItem);
    }
    
    ctx.session.pendingActions = [];
    await ctx.saveSession();
    await ctx.editMessageReplyMarkup(null);
    await ctx.answerCallbackQuery('Все действия выполнены!');
  } catch (error) {
    console.error('Ошибка выполнения действий:', error);
    await ctx.reply('❌ Произошла ошибка при сохранении одного из действий.');
    await ctx.answerCallbackQuery();
  }
}

export async function handleAICancelCallback(ctx) {
  ctx.session.pendingActions = [];
  await ctx.saveSession();
  await ctx.editMessageText('❌ Действие отменено.');
  await ctx.answerCallbackQuery();
}

async function executeConfirmedAction(ctx, masterId, actionItem) {
  const { action, data } = actionItem;

  if (action === 'appointment') {
    await saveAppointment(ctx, masterId, data);
  } else if (action === 'cancel_appointment') {
    await cancelAppointment(ctx, masterId, data);
  } else if (action === 'finance') {
    await saveFinance(ctx, masterId, data);
  } else if (action === 'need') {
    await saveNeed(ctx, masterId, data);
  }
}

async function saveAppointment(ctx, masterId, data) {
  const parsedDateTime = parseAppointmentDateTime(data.date, data.time);
  if (!parsedDateTime) throw new Error('Invalid date/time');

  const existingClient = await ClientModel.findOne({
    masterId,
    name: { $regex: new RegExp(escapeRegExpSpecialChars(data.name), 'i') },
  }).lean();

  const duplicateAppointment = await AppointmentModel.findOne({
    masterId,
    clientName: { $regex: new RegExp(escapeRegExpSpecialChars(data.name), 'i') },
    dateTime: parsedDateTime,
  }).lean();

  if (duplicateAppointment) {
    await ctx.reply(`⚠️ Запись *${data.name}* на это время уже существует.`, { parse_mode: 'Markdown' });
    return;
  }

  const appointment = await AppointmentModel.create({
    masterId,
    clientId: existingClient?._id ?? null,
    clientName: data.name,
    dateTime: parsedDateTime,
    serviceType: data.service || '',
  });

  const formattedDateTime = parsedDateTime.toLocaleString('ru-RU', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
  });

  let keyboard;
  if (!existingClient) {
    keyboard = new InlineKeyboard().text(`👤 Создать карту для ${data.name}`, `client_auto_create:${data.name}:${appointment._id}`);
  }

  await ctx.reply(`✅ Запись создана: *${data.name}* на *${formattedDateTime}*`, { 
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

async function cancelAppointment(ctx, masterId, data) {
  const parsedDateTime = parseAppointmentDateTime(data.date, data.time);
  if (!parsedDateTime) throw new Error('Invalid date/time');

  const startOfDay = new Date(parsedDateTime);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(parsedDateTime);
  endOfDay.setHours(23, 59, 59, 999);

  const deleted = await AppointmentModel.findOneAndDelete({
    masterId,
    clientName: { $regex: new RegExp(escapeRegExpSpecialChars(data.name), 'i') },
    dateTime: { $gte: startOfDay, $lte: endOfDay }
  });

  if (deleted) {
    const formattedDateTime = deleted.dateTime.toLocaleString('ru-RU', {
      day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
    });
    await ctx.reply(`❌ Запись отменена: *${deleted.clientName}* на *${formattedDateTime}*`, { parse_mode: 'Markdown' });
  } else {
    await ctx.reply(`⚠️ Не нашел запись для *${data.name}* на указанную дату.`, { parse_mode: 'Markdown' });
  }
}

async function saveFinance(ctx, masterId, data) {
  await FinanceModel.create({
    masterId,
    amount: Number(data.amount),
    type: data.type,
    category: data.category || '',
    date: new Date(),
  });

  const typeLabel = data.type === 'income' ? '✅ Доход' : '❌ Расход';
  await ctx.reply(`${typeLabel} *${Number(data.amount).toLocaleString('ru-RU')} ₽* сохранен.`, { parse_mode: 'Markdown' });
}

async function saveNeed(ctx, masterId, data) {
  const itemText = data?.item || data?.text;
  await NeedModel.create({ masterId, text: itemText });
  await ctx.reply(`🛒 Добавлено в список: *${itemText}*`, { parse_mode: 'Markdown' });
}

function parseAppointmentDateTime(dateString, timeString) {
  try {
    const now = new Date();
    const targetDate = new Date(now);

    const lowerDate = dateString?.toLowerCase() ?? '';
    if (lowerDate.includes('сегодня')) {
      // текущая дата
    } else if (lowerDate.includes('завтра')) {
      targetDate.setDate(now.getDate() + 1);
    } else {
      const parsed = new Date(dateString);
      if (!isNaN(parsed.getTime())) {
        targetDate.setFullYear(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
      }
    }

    const timeParts = timeString?.match(/(\d{1,2})[:\.]?(\d{0,2})/);
    if (timeParts) {
      targetDate.setHours(Number(timeParts[1]), Number(timeParts[2] || 0), 0, 0);
    }

    return targetDate;
  } catch {
    return null;
  }
}
