import { Keyboard } from 'grammy';

export const mainReplyKeyboard = new Keyboard()
  .text('🗓 ЖУРНАЛ').text('👥 КЛИЕНТЫ').row()
  .text('💸 КАССА').text('🛒 СПИСОК')
  .resized()
  .persistent();

export async function sendMainMenuMessage(ctx, messageText) {
  await ctx.reply(messageText, {
    reply_markup: mainReplyKeyboard,
  });
}

export function isMainMenuButton(text) {
  return ['🗓 ЖУРНАЛ', '👥 КЛИЕНТЫ', '💸 КАССА', '🛒 СПИСОК'].includes(text);
}
