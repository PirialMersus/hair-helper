import { InlineKeyboard } from 'grammy';
import { FinanceModel } from '../db/models/Finance.js';
import { parseIntentFromText } from '../services/geminiService.js';

function buildStartOfToday() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
}

function buildEndOfToday() {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return end;
}

async function calculateBalanceForPeriod(masterId, days = 0) {
  const start = new Date();
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);

  const operations = await FinanceModel.find({
    masterId,
    date: { $gte: start, $lte: buildEndOfToday() },
  });

  let totalIncome = 0;
  let totalExpense = 0;

  for (const op of operations) {
    if (op.type === 'income') totalIncome += op.amount;
    else totalExpense += op.amount;
  }

  return { totalIncome, totalExpense, balance: totalIncome - totalExpense };
}

export async function showCashRegister(ctx) {
  const masterId = String(ctx.from.id);
  const { totalIncome, totalExpense, balance } = await calculateBalanceForPeriod(masterId, 0);

  const balanceEmoji = balance >= 0 ? '📈' : '📉';
  const cashRegisterText =
    `💸 *Касса — сегодня*\n\n` +
    `✅ Доходы: *${totalIncome.toLocaleString('ru-RU')} ₽*\n` +
    `❌ Расходы: *${totalExpense.toLocaleString('ru-RU')} ₽*\n` +
    `${balanceEmoji} Баланс: *${balance.toLocaleString('ru-RU')} ₽*`;

  const cashRegisterKeyboard = new InlineKeyboard()
    .text('+ Доход', 'finance_add_income')
    .text('– Расход', 'finance_add_expense')
    .row()
    .text('📊 Аналитика', 'finance_analytics');

  if (ctx.callbackQuery) {
    await ctx.editMessageText(cashRegisterText, {
      parse_mode: 'Markdown',
      reply_markup: cashRegisterKeyboard,
    });
  } else {
    await ctx.reply(cashRegisterText, {
      parse_mode: 'Markdown',
      reply_markup: cashRegisterKeyboard,
    });
  }
}

export async function showFinanceAnalytics(ctx) {
  const masterId = String(ctx.from.id);
  
  const week = await calculateBalanceForPeriod(masterId, 7);
  const month = await calculateBalanceForPeriod(masterId, 30);

  const analyticsText = 
    `📊 *Финансовая аналитика*\n\n` +
    `📅 *За последние 7 дней:*\n` +
    `  • Доходы: ${week.totalIncome.toLocaleString('ru-RU')} ₽\n` +
    `  • Расходы: ${week.totalExpense.toLocaleString('ru-RU')} ₽\n` +
    `  • Прибыль: *${week.balance.toLocaleString('ru-RU')} ₽*\n\n` +
    `🗓 *За последние 30 дней:*\n` +
    `  • Доходы: ${month.totalIncome.toLocaleString('ru-RU')} ₽\n` +
    `  • Расходы: ${month.totalExpense.toLocaleString('ru-RU')} ₽\n` +
    `  • Прибыль: *${month.balance.toLocaleString('ru-RU')} ₽*`;

  const keyboard = new InlineKeyboard().text('⬅️ Назад в кассу', 'finance_back');

  await ctx.editMessageText(analyticsText, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
  await ctx.answerCallbackQuery();
}

export async function handleAddIncomeCallback(ctx) {
  ctx.session.step = 'AWAIT_INCOME';
  await ctx.saveSession();

  await ctx.answerCallbackQuery();
  await ctx.reply(
    '💰 Опиши доход. Например: _«получил 2000 со стрижки»_ или _«оплата 3500»_',
    { parse_mode: 'Markdown' }
  );
}

export async function handleAddExpenseCallback(ctx) {
  ctx.session.step = 'AWAIT_EXPENSE';
  await ctx.saveSession();

  await ctx.answerCallbackQuery();
  await ctx.reply(
    '💸 Опиши расход. Например: _«краска 800 рублей»_ или _«расход 500 на фольгу»_',
    { parse_mode: 'Markdown' }
  );
}

export async function handleFinanceTextInput(ctx, operationType) {
  const masterId = String(ctx.from.id);
  const userText = ctx.message.text.trim();

  await ctx.reply('⏳ Обрабатываю...');

  let parsedIntent;
  try {
    parsedIntent = await parseIntentFromText(userText);
  } catch {
    await ctx.reply('❌ Не смог разобрать сообщение. Попробуй ещё раз.');
    return;
  }

  const amountValue = parsedIntent?.data?.amount;
  if (!amountValue || isNaN(Number(amountValue))) {
    await ctx.reply(parsedIntent?.userMessage || '❓ Не смог определить сумму. Уточни, пожалуйста.');
    return;
  }

  await FinanceModel.create({
    masterId,
    amount: Number(amountValue),
    type: operationType,
    category: parsedIntent?.data?.category || '',
    date: new Date(),
  });

  ctx.session.step = 'IDLE';
  await ctx.saveSession();

  const typeLabel = operationType === 'income' ? '✅ Доход' : '❌ Расход';
  await ctx.reply(
    `${typeLabel} *${Number(amountValue).toLocaleString('ru-RU')} ₽* записан!\n${parsedIntent.userMessage || ''}`,
    { parse_mode: 'Markdown' }
  );
}
