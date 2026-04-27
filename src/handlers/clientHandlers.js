import { InlineKeyboard } from 'grammy';
import { ClientModel } from '../db/models/Client.js';
import { AppointmentModel } from '../db/models/Appointment.js';
import { getMainKeyboard } from './menuHandlers.js';

const CLIENTS_PER_PAGE = 7;

export async function showClientList(ctx, page = 0, searchQuery = '') {
  const masterId = String(ctx.from.id);
  
  const query = { masterId };
  if (searchQuery) {
    query.name = { $regex: new RegExp(searchQuery, 'i') };
  }

  const totalClients = await ClientModel.countDocuments(query);
  const totalPages = Math.ceil(totalClients / CLIENTS_PER_PAGE) || 1;
  const currentPage = Math.min(Math.max(0, page), totalPages - 1);

  const clients = await ClientModel.find(query)
    .sort({ updatedAt: -1 })
    .skip(currentPage * CLIENTS_PER_PAGE)
    .limit(CLIENTS_PER_PAGE)
    .lean();

  let clientListKeyboard = new InlineKeyboard();

  clients.forEach((client) => {
    clientListKeyboard = clientListKeyboard
      .text(client.name, `client_open:${client._id}`)
      .row();
  });

  // Пагинация
  const paginationRow = [];
  if (currentPage > 0) paginationRow.push(InlineKeyboard.text('⬅️', `client_page:${currentPage - 1}`));
  paginationRow.push(InlineKeyboard.text(`Стр. ${currentPage + 1}/${totalPages}`, 'ignore'));
  if (currentPage < totalPages - 1) paginationRow.push(InlineKeyboard.text('➡️', `client_page:${currentPage + 1}`));
  
  clientListKeyboard.row(...paginationRow).row();
  clientListKeyboard.text('🔍 Поиск', 'client_search').text('➕ СОЗДАТЬ', 'client_create');

  const text = searchQuery 
    ? `👥 *Результаты поиска: "${searchQuery}"*\nНайдено: ${totalClients}` 
    : `👥 *Клиенты*\nВсего: ${totalClients}`;

  if (ctx.callbackQuery && ctx.callbackQuery.data.startsWith('client_page:')) {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: clientListKeyboard });
  } else {
    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: clientListKeyboard });
  }
}

export async function handleClientPageCallback(ctx) {
  const page = parseInt(ctx.callbackQuery.data.replace('client_page:', ''), 10);
  await showClientList(ctx, page, ctx.session.searchQuery || '');
  await ctx.answerCallbackQuery();
}

export async function handleClientSearchCallback(ctx) {
  ctx.session.step = 'AWAIT_CLIENT_SEARCH';
  await ctx.saveSession();
  await ctx.editMessageText('🔍 Введи имя или часть имени клиента для поиска:', {
    reply_markup: new InlineKeyboard().text('← Отмена', 'client_back_to_list'),
  });
  await ctx.answerCallbackQuery();
}

export async function handleClientSearchInput(ctx) {
  const searchQuery = ctx.message.text.trim();
  ctx.session.step = 'IDLE';
  ctx.session.searchQuery = searchQuery;
  await ctx.saveSession();
  await showClientList(ctx, 0, searchQuery);
}

export async function showClientCard(ctx, clientId) {
  const masterId = String(ctx.from.id);
  const client = await ClientModel.findOne({ masterId, _id: clientId });

  if (!client) {
    await ctx.reply('❌ Клиент не найден.');
    return;
  }

  ctx.session.step = 'CLIENT_CARD_OPEN';
  ctx.session.activeClientId = client._id;
  await ctx.saveSession();

  const lastVisit = client.visitHistory.at(-1);
  let cardText = `👤 *${client.name}*\n`;
  if (client.phone) cardText += `📞 ${client.phone}\n`;
  if (client.tags.length > 0) cardText += `🏷 ${client.tags.join(', ')}\n`;
  cardText += `\n📋 Визитов: ${client.visitHistory.length}\n`;

  if (lastVisit) {
    const lastVisitDate = lastVisit.date.toLocaleDateString('ru-RU');
    cardText += `🕐 Последний визит: ${lastVisitDate}\n`;
    if (lastVisit.recipe) cardText += `🎨 Рецепт: ${lastVisit.recipe}\n`;
  }

  cardText += '\n_Пришли фото или голосовое — оно прикрепится к этому клиенту._';

  const clientCardKeyboard = new InlineKeyboard()
    .text('📸 История фото', `client_photos:${clientId}`)
    .text('✏️ Редактировать', `client_edit:${clientId}`)
    .row()
    .text('← Назад', 'client_back_to_list');

  if (ctx.callbackQuery) {
    await ctx.editMessageText(cardText, {
      parse_mode: 'Markdown',
      reply_markup: clientCardKeyboard,
    });
  } else {
    await ctx.reply(cardText, {
      parse_mode: 'Markdown',
      reply_markup: clientCardKeyboard,
    });
  }
}

export async function handleClientOpenCallback(ctx) {
  const clientId = ctx.callbackQuery.data.replace('client_open:', '');
  await showClientCard(ctx, clientId);
  await ctx.answerCallbackQuery();
}

export async function handleClientCreateCallback(ctx) {
  ctx.session.step = 'AWAIT_CLIENT_NAME';
  ctx.session.activeClientId = null;
  await ctx.saveSession();

  await ctx.editMessageText('✏️ Введи имя нового клиента:', {
    reply_markup: new InlineKeyboard().text('← Отмена', 'client_back_to_list'),
  });
  await ctx.answerCallbackQuery();
}
export async function handleClientAutoCreateCallback(ctx) {
  const masterId = String(ctx.from.id);
  const data = ctx.callbackQuery.data.replace('client_auto_create:', '').split(':');
  const name = data[0];
  const appointmentId = data[1];

  let client = await ClientModel.findOne({ masterId, name: { $regex: new RegExp(`^${name}$`, 'i') } });
  
  if (!client) {
    client = await ClientModel.create({
      masterId,
      name,
    });
  }

  if (appointmentId) {
    await AppointmentModel.findOneAndUpdate(
      { _id: appointmentId, masterId },
      { clientId: client._id }
    );
  }

  await ctx.editMessageText(`✅ Карта клиента *${name}* создана и привязана к записи!`, {
    parse_mode: 'Markdown',
  });
  
  await showClientCard(ctx, client._id);
  await ctx.answerCallbackQuery();
}

export async function handleClientBackToListCallback(ctx) {
  ctx.session.step = 'IDLE';
  ctx.session.activeClientId = null;
  ctx.session.searchQuery = '';
  await ctx.saveSession();

  await ctx.answerCallbackQuery();
  await ctx.deleteMessage();
  await showClientList(ctx);
}

export async function handleClientPhotosCallback(ctx) {
  const clientId = ctx.callbackQuery.data.replace('client_photos:', '');
  const masterId = String(ctx.from.id);
  const client = await ClientModel.findOne({ masterId, _id: clientId });

  if (!client) {
    await ctx.answerCallbackQuery('Клиент не найден');
    return;
  }

  const visitsWithPhotos = client.visitHistory.filter(
    (visit) => visit.photoBefore || visit.photoAfter
  );

  if (visitsWithPhotos.length === 0) {
    await ctx.answerCallbackQuery('Фото ещё нет');
    return;
  }

  await ctx.answerCallbackQuery();
  await ctx.reply('⏳ Формирую альбом...');

  const mediaGroup = [];
  // Берем последние 5 визитов (до 10 фото, так как лимит альбома в Telegram - 10 медиа)
  for (const visit of visitsWithPhotos.slice(-5)) {
    const visitDate = visit.date.toLocaleDateString('ru-RU');
    let caption = `📅 ${visitDate}`;
    if (visit.recipe) caption += `\n🎨 ${visit.recipe}`;
    if (visit.comment) caption += `\n📝 ${visit.comment}`;

    // Добавляем подпись только к первому фото визита, чтобы не дублировать текст
    if (visit.photoBefore) {
      mediaGroup.push({ type: 'photo', media: visit.photoBefore, caption: `ДО\n${caption}` });
    }
    if (visit.photoAfter) {
      mediaGroup.push({ type: 'photo', media: visit.photoAfter, caption: `ПОСЛЕ\n${caption}` });
    }
  }

  if (mediaGroup.length > 0) {
    // В Telegram caption применяется ко всему альбому, если он установлен у первого медиа, 
    // но если подписи разные, они будут видны при просмотре конкретного фото.
    try {
      await ctx.replyWithMediaGroup(mediaGroup.slice(-10)); // Страховка лимита Telegram (max 10)
    } catch (e) {
      console.error('Ошибка отправки медиагруппы:', e);
      await ctx.reply('❌ Ошибка отправки фотографий.');
    }
  }
}

export async function handleNewClientNameInput(ctx) {
  const clientName = ctx.message.text.trim();
  if (!clientName) {
    await ctx.reply('Имя не может быть пустым. Попробуй ещё раз:');
    return;
  }

  const masterId = String(ctx.from.id);
  const newClient = await ClientModel.create({ masterId, name: clientName });

  ctx.session.step = 'AWAIT_CLIENT_PHONE';
  ctx.session.activeClientId = newClient._id;
  await ctx.saveSession();

  const skipPhoneKeyboard = new InlineKeyboard().text('Пропустить ➡️', 'client_skip_phone');
  await ctx.reply(`✅ Клиент *${clientName}* создан!\n\nВведи номер телефона или пропусти:`, {
    parse_mode: 'Markdown',
    reply_markup: skipPhoneKeyboard,
  });
}

export async function handleNewClientPhoneInput(ctx) {
  const phoneNumber = ctx.message.text.trim();
  const masterId = String(ctx.from.id);

  await ClientModel.findOneAndUpdate(
    { masterId, _id: ctx.session.activeClientId },
    { phone: phoneNumber }
  );

  ctx.session.step = 'CLIENT_CARD_OPEN';
  await ctx.saveSession();

  await ctx.reply('📞 Телефон сохранён!', { reply_markup: getMainKeyboard(ctx) });
  await showClientCard(ctx, ctx.session.activeClientId);
}

export async function handleSkipPhoneCallback(ctx) {
  ctx.session.step = 'CLIENT_CARD_OPEN';
  await ctx.saveSession();

  await ctx.answerCallbackQuery();
  await ctx.deleteMessage();
  await showClientCard(ctx, ctx.session.activeClientId);
}
