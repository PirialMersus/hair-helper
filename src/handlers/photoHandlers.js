import { InlineKeyboard } from 'grammy';
import { ClientModel } from '../db/models/Client.js';
import {
  classifyPhotoAsBeforeOrAfter,
  describeColoringTechnique,
} from '../services/geminiService.js';
import { downloadTelegramFileAsBase64 } from '../services/telegramFileService.js';

const CONFIDENCE_THRESHOLD_FOR_AUTO_CLASSIFICATION = 0.75;

async function attachPhotoToClientVisit(masterId, clientId, fileId, photoType) {
  const updateField =
    photoType === 'before' ? 'visitHistory.$.photoBefore' : 'visitHistory.$.photoAfter';

  const client = await ClientModel.findOne({ masterId, _id: clientId });
  if (!client) return;

  const lastVisit = client.visitHistory.at(-1);
  const isLastVisitFromToday =
    lastVisit && new Date() - lastVisit.date < 24 * 60 * 60 * 1000;

  if (isLastVisitFromToday) {
    lastVisit[photoType === 'before' ? 'photoBefore' : 'photoAfter'] = fileId;
    await client.save();
  } else {
    client.visitHistory.push({
      date: new Date(),
      [photoType === 'before' ? 'photoBefore' : 'photoAfter']: fileId,
    });
    await client.save();
  }
}

export async function handlePhotoMessage(ctx) {
  const masterId = String(ctx.from.id);
  const photoArray = ctx.message.photo;
  const highestResolutionPhoto = photoArray[photoArray.length - 1];
  const fileId = highestResolutionPhoto.file_id;

  const photoBase64 = await downloadTelegramFileAsBase64(fileId, ctx.api ? ctx : { api: ctx.api ?? ctx });

  if (ctx.session.step === 'CLIENT_CARD_OPEN' && ctx.session.activeClientId) {
    await handlePhotoInClientContext(ctx, masterId, fileId, photoBase64);
  } else {
    await handlePhotoOutsideClientContext(ctx, masterId, fileId, photoBase64);
  }
}

async function handlePhotoInClientContext(ctx, masterId, fileId, photoBase64) {
  const client = await ClientModel.findOne({ masterId, _id: ctx.session.activeClientId });
  if (!client) {
    await ctx.reply('❌ Клиент не найден. Открой карточку заново.');
    return;
  }

  await ctx.reply('⏳ Определяю: это До или После...');

  let classificationResult;
  try {
    classificationResult = await classifyPhotoAsBeforeOrAfter(photoBase64);
  } catch {
    await ctx.reply('❌ Ошибка анализа фото. Попробуй ещё раз.');
    return;
  }

  if (
    classificationResult.classification !== 'uncertain' &&
    classificationResult.confidence >= CONFIDENCE_THRESHOLD_FOR_AUTO_CLASSIFICATION
  ) {
    const photoType = classificationResult.classification;
    await attachPhotoToClientVisit(masterId, ctx.session.activeClientId, fileId, photoType);

    const typeLabel = photoType === 'before' ? '📷 ДО' : '📸 ПОСЛЕ';
    await ctx.reply(
      `✅ Фото *${typeLabel}* прикреплено к *${client.name}*\n\n_${classificationResult.description}_`,
      { parse_mode: 'Markdown' }
    );
  } else {
    ctx.session.pendingPhotoFileId = fileId;
    await ctx.saveSession();

    const manualSelectionKeyboard = new InlineKeyboard()
      .text('📷 ДО', `photo_classify:before:${fileId}`)
      .text('📸 ПОСЛЕ', `photo_classify:after:${fileId}`);

    await ctx.reply(
      `🤔 Не уверена — это ДО или ПОСЛЕ?\n\n_${classificationResult.description || 'Выбери вручную:'}_`,
      {
        parse_mode: 'Markdown',
        reply_markup: manualSelectionKeyboard,
      }
    );
  }
}

async function handlePhotoOutsideClientContext(ctx, masterId, fileId, photoBase64) {
  await ctx.reply('⏳ Анализирую технику окрашивания...');

  let coloringDescription;
  try {
    coloringDescription = await describeColoringTechnique(photoBase64);
  } catch {
    coloringDescription = 'Не удалось проанализировать фото.';
  }

  const recentClients = await ClientModel.find({ masterId })
    .sort({ updatedAt: -1 })
    .limit(5);

  ctx.session.pendingPhotoFileId = fileId;
  await ctx.saveSession();

  let attachmentKeyboard = new InlineKeyboard();
  recentClients.forEach((client) => {
    attachmentKeyboard = attachmentKeyboard
      .text(client.name, `photo_attach_to_client:${client._id}`)
      .row();
  });
  attachmentKeyboard = attachmentKeyboard.text('🚫 Не прикреплять', 'photo_attach_skip');

  await ctx.reply(
    `🎨 *Анализ фото:*\n\n${coloringDescription}\n\nК кому прикрепить это фото?`,
    {
      parse_mode: 'Markdown',
      reply_markup: attachmentKeyboard,
    }
  );
}

export async function handlePhotoClassifyCallback(ctx) {
  const callbackParts = ctx.callbackQuery.data.replace('photo_classify:', '').split(':');
  const photoType = callbackParts[0];
  const masterId = String(ctx.from.id);

  const client = await ClientModel.findOne({ masterId, _id: ctx.session.activeClientId });
  if (!client) {
    await ctx.answerCallbackQuery('Клиент не найден');
    return;
  }

  const fileId = ctx.session.pendingPhotoFileId;
  if (!fileId) {
    await ctx.answerCallbackQuery('Фото не найдено');
    return;
  }

  await attachPhotoToClientVisit(masterId, ctx.session.activeClientId, fileId, photoType);

  ctx.session.pendingPhotoFileId = null;
  await ctx.saveSession();

  const typeLabel = photoType === 'before' ? '📷 ДО' : '📸 ПОСЛЕ';
  await ctx.editMessageText(`✅ Фото *${typeLabel}* прикреплено к *${client.name}*`, {
    parse_mode: 'Markdown',
  });
  await ctx.answerCallbackQuery();
}

export async function handlePhotoAttachToClientCallback(ctx) {
  const clientId = ctx.callbackQuery.data.replace('photo_attach_to_client:', '');
  const masterId = String(ctx.from.id);

  const fileId = ctx.session.pendingPhotoFileId;
  if (!fileId) {
    await ctx.answerCallbackQuery('Фото не найдено');
    return;
  }

  await attachPhotoToClientVisit(masterId, clientId, fileId, 'after');

  const client = await ClientModel.findOne({ masterId, _id: clientId });

  ctx.session.pendingPhotoFileId = null;
  await ctx.saveSession();

  await ctx.editMessageText(`✅ Фото прикреплено к *${client?.name || 'клиенту'}*`, {
    parse_mode: 'Markdown',
  });
  await ctx.answerCallbackQuery();
}

export async function handlePhotoAttachSkipCallback(ctx) {
  ctx.session.pendingPhotoFileId = null;
  await ctx.saveSession();

  await ctx.editMessageText('Хорошо, фото сохранено без привязки к клиенту.');
  await ctx.answerCallbackQuery();
}
