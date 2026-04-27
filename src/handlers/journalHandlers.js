import { InlineKeyboard } from 'grammy';
import { AppointmentModel } from '../db/models/Appointment.js';

function buildStartOfDay(date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  return startOfDay;
}

function buildEndOfDay(date) {
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay;
}

function formatDateLabel(date) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const isSameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (isSameDay(date, today)) return 'Сегодня';
  if (isSameDay(date, yesterday)) return 'Вчера';
  if (isSameDay(date, tomorrow)) return 'Завтра';

  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function buildDateNavigationKeyboard(activeDate) {
  const previousDate = new Date(activeDate);
  previousDate.setDate(activeDate.getDate() - 1);
  const nextDate = new Date(activeDate);
  nextDate.setDate(activeDate.getDate() + 1);

  return new InlineKeyboard()
    .text('⬅️', `journal_date:${previousDate.toISOString()}`)
    .text('Сегодня', `journal_date:${new Date().toISOString()}`)
    .text('➡️', `journal_date:${nextDate.toISOString()}`)
    .row()
    .text('📅 Выбрать дату', 'journal_calendar');
}

export function buildCalendarKeyboard(year, month) {
  const keyboard = new InlineKeyboard();
  const date = new Date(year, month, 1);
  const monthName = date.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });

  keyboard.text(monthName, 'ignore').row();

  const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  weekDays.forEach((day) => keyboard.text(day, 'ignore'));
  keyboard.row();

  // Пустые ячейки до начала месяца
  let firstDay = date.getDay();
  if (firstDay === 0) firstDay = 7; // Вс -> 7
  for (let i = 1; i < firstDay; i++) {
    keyboard.text(' ', 'ignore');
  }

  // Дни месяца
  while (date.getMonth() === month) {
    const day = date.getDate();
    const iso = date.toISOString();
    keyboard.text(String(day), `journal_date:${iso}`);
    if (date.getDay() === 0) keyboard.row();
    date.setDate(day + 1);
  }

  keyboard.row().text('❌ Закрыть', 'journal_calendar_close');
  return keyboard;
}

export async function showJournalForDate(ctx, targetDate) {
  const masterId = String(ctx.from.id);
  const appointments = await AppointmentModel.find({
    masterId,
    dateTime: {
      $gte: buildStartOfDay(targetDate),
      $lte: buildEndOfDay(targetDate),
    },
  }).sort({ dateTime: 1 }).lean();

  const dateLabel = formatDateLabel(targetDate);
  let journalText = `🗓 *Журнал — ${dateLabel}*\n\n`;

  if (appointments.length === 0) {
    journalText += '_Записей нет._';
  } else {
    appointments.forEach((appointment, index) => {
      const timeString = appointment.dateTime.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      });
      journalText += `${index + 1}. *${timeString}* — ${appointment.clientName}`;
      if (appointment.serviceType) journalText += ` (${appointment.serviceType})`;
      journalText += '\n';
    });
  }

  const navigationKeyboard = buildDateNavigationKeyboard(targetDate);

  if (appointments.length > 0) {
    navigationKeyboard.row();
    appointments.forEach((appointment) => {
      const tStr = appointment.dateTime.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      navigationKeyboard.text(`❌ Отменить ${tStr} (${appointment.clientName})`, `journal_cancel:${appointment._id}`).row();
    });
  } else {
    navigationKeyboard.row();
  }
  navigationKeyboard.text('➕ Добавить запись', 'journal_add_appointment');

  if (ctx.callbackQuery && !ctx.callbackQuery.data.startsWith('journal_cancel:')) {
    await ctx.editMessageText(journalText, {
      parse_mode: 'Markdown',
      reply_markup: navigationKeyboard,
    });
  } else if (ctx.callbackQuery && ctx.callbackQuery.data.startsWith('journal_cancel:')) {
    // При удалении (чтобы не дублировать сообщения, редактируем текущее)
    await ctx.editMessageText(journalText, {
      parse_mode: 'Markdown',
      reply_markup: navigationKeyboard,
    });
  } else {
    await ctx.reply(journalText, {
      parse_mode: 'Markdown',
      reply_markup: navigationKeyboard,
    });
  }
}

export async function handleJournalMenuButton(ctx) {
  ctx.session.activeDate = new Date();
  ctx.session.step = 'IDLE';
  await ctx.saveSession();
  await showJournalForDate(ctx, new Date());
}

export async function handleJournalDateCallback(ctx) {
  const dateString = ctx.callbackQuery.data.replace('journal_date:', '');
  const targetDate = new Date(dateString);
  ctx.session.activeDate = targetDate;
  await ctx.saveSession();
  await showJournalForDate(ctx, targetDate);
  await ctx.answerCallbackQuery();
}

export async function handleJournalCalendarCallback(ctx) {
  const now = new Date();
  const keyboard = buildCalendarKeyboard(now.getFullYear(), now.getMonth());
  await ctx.editMessageText('📅 Выбери дату из календаря:', {
    reply_markup: keyboard,
  });
  await ctx.answerCallbackQuery();
}

export async function handleJournalCalendarCloseCallback(ctx) {
  const activeDate = ctx.session.activeDate || new Date();
  await showJournalForDate(ctx, activeDate);
  await ctx.answerCallbackQuery();
}

export async function handleAppointmentDeleteCallback(ctx) {
  const appointmentId = ctx.callbackQuery.data.replace('journal_cancel:', '');
  const masterId = String(ctx.from.id);

  const appointment = await AppointmentModel.findOne({ _id: appointmentId, masterId });
  if (!appointment) {
    await ctx.answerCallbackQuery('Запись не найдена');
    return;
  }

  const timeStr = appointment.dateTime.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const confirmKeyboard = new InlineKeyboard()
    .text('✅ Да, отменить', `journal_confirm_cancel:${appointmentId}`)
    .text('↩️ Нет', `journal_date:${(ctx.session.activeDate || new Date()).toISOString()}`);

  await ctx.editMessageText(
    `⚠️ Точно отменить запись?\n\n*${timeStr}* — ${appointment.clientName}`,
    { parse_mode: 'Markdown', reply_markup: confirmKeyboard }
  );
  await ctx.answerCallbackQuery();
}

export async function handleAppointmentConfirmDeleteCallback(ctx) {
  const appointmentId = ctx.callbackQuery.data.replace('journal_confirm_cancel:', '');
  const masterId = String(ctx.from.id);

  const deleted = await AppointmentModel.findOneAndDelete({ _id: appointmentId, masterId });

  if (deleted) {
    await ctx.answerCallbackQuery(`Запись ${deleted.clientName} отменена`);
  } else {
    await ctx.answerCallbackQuery('Запись не найдена');
  }

  const activeDate = ctx.session.activeDate || new Date();
  await showJournalForDate(ctx, activeDate);
}
