import { Keyboard } from 'grammy';
import { creatorId } from '../config/env.js';

export function getMainKeyboard(ctx) {
  const keyboard = new Keyboard()
    .text('🗓 ЖУРНАЛ').text('👥 КЛИЕНТЫ').row()
    .text('💸 КАССА').text('🛒 СПИСОК');

  if (ctx.from?.id === creatorId) {
    keyboard.row().text('👤 АДМИН');
  }

  return keyboard.resized().persistent();
}

export async function sendMainMenuMessage(ctx, messageText) {
  await ctx.reply(messageText, {
    reply_markup: getMainKeyboard(ctx),
  });
}

export function isMainMenuButton(text) {
  return ['🗓 ЖУРНАЛ', '👥 КЛИЕНТЫ', '💸 КАССА', '🛒 СПИСОК', '👤 АДМИН'].includes(text);
}
