import { InlineKeyboard } from 'grammy';
import { NeedModel } from '../db/models/Need.js';
import { parseIntentFromText } from '../services/geminiService.js';

export async function showShoppingList(ctx) {
  const masterId = String(ctx.from.id);
  const shoppingItems = await NeedModel.find({ masterId }).sort({ createdAt: 1 });

  let shoppingListKeyboard = new InlineKeyboard();
  let listText = '🛒 *Список покупок*\n\n';

  if (shoppingItems.length === 0) {
    listText += '_Список пуст. Напиши или продиктуй, что нужно купить._';
  } else {
    shoppingItems.forEach((item, index) => {
      listText += `${index + 1}. ${item.text}\n`;
      shoppingListKeyboard = shoppingListKeyboard
        .text(`❌`, `need_delete:${item._id}`)
        .row();
    });
    listText += '\n_Нажми ❌ рядом с пунктом чтобы удалить._';
  }

  const addItemKeyboard = new InlineKeyboard();
  shoppingItems.forEach((item) => {
    addItemKeyboard.text(`❌ ${item.text}`, `need_delete:${item._id}`).row();
  });

  if (ctx.callbackQuery) {
    await ctx.editMessageText(listText, {
      parse_mode: 'Markdown',
      reply_markup: buildShoppingListKeyboard(shoppingItems),
    });
  } else {
    await ctx.reply(listText, {
      parse_mode: 'Markdown',
      reply_markup: buildShoppingListKeyboard(shoppingItems),
    });
  }
}

function buildShoppingListKeyboard(shoppingItems) {
  let keyboard = new InlineKeyboard();
  shoppingItems.forEach((item) => {
    keyboard = keyboard.text(`❌ ${item.text}`, `need_delete:${item._id}`).row();
  });
  keyboard.text('➕ Добавить', 'need_add');
  return keyboard;
}

export async function handleNeedDeleteCallback(ctx) {
  const itemId = ctx.callbackQuery.data.replace('need_delete:', '');
  const masterId = String(ctx.from.id);

  await NeedModel.findOneAndDelete({ masterId, _id: itemId });
  await ctx.answerCallbackQuery('✅ Удалено');
  await showShoppingList(ctx);
}

export async function handleShoppingListMenuButton(ctx) {
  ctx.session.step = 'IDLE';
  await ctx.saveSession();
  await showShoppingList(ctx);
}

export async function handleAddNeedFromText(ctx) {
  const masterId = String(ctx.from.id);
  const userText = ctx.message.text.trim();

  let itemText = userText;

  try {
    const parsedIntent = await parseIntentFromText(userText);
    const needAction = parsedIntent?.actions?.find(a => a.action === 'need');
    if (needAction?.data?.item) {
      itemText = needAction.data.item;
    }
  } catch {
  }

  await NeedModel.create({ masterId, text: itemText });

  ctx.session.step = 'IDLE';
  await ctx.saveSession();

  await ctx.reply(`✅ Добавлено в список: *${itemText}*`, { parse_mode: 'Markdown' });
  await showShoppingList(ctx);
}
