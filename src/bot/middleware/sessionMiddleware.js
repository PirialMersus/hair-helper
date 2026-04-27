import { SessionModel } from '../../db/models/Session.js';
import { creatorId } from '../../config/env.js';

const SESSION_FIELDS_TO_TRACK = ['step', 'activeClientId', 'pendingPhotoFileId', 'activeDate', 'pendingActions', 'searchQuery'];

export async function sessionMiddleware(ctx, next) {
  const masterId = String(ctx.from?.id);
  if (!masterId) return next();

  let sessionDocument = await SessionModel.findOne({ masterId });
  if (!sessionDocument) {
    sessionDocument = await SessionModel.create({ masterId });
    
    if (creatorId && Number(masterId) !== creatorId) {
      const newUserUsername = ctx.from.username ? `@${ctx.from.username}` : 'без username';
      const newUserName = ctx.from.first_name || 'Неизвестный';
      await ctx.api.sendMessage(
        creatorId,
        `🚀 *Новый пользователь в боте!*\n\n` +
        `👤 Имя: ${newUserName}\n` +
        `🆔 ID: ${masterId}\n` +
        `🔗 Username: ${newUserUsername}`,
        { parse_mode: 'Markdown' }
      ).catch(error => console.error('Ошибка уведомления админа:', error));
    }
  }

  ctx.session = sessionDocument;

  const snapshotBeforeProcessing = JSON.stringify(
    SESSION_FIELDS_TO_TRACK.reduce((acc, field) => {
      acc[field] = ctx.session[field];
      return acc;
    }, {})
  );

  ctx.saveSession = async () => {
    const updatePayload = SESSION_FIELDS_TO_TRACK.reduce((acc, field) => {
      acc[field] = ctx.session[field];
      return acc;
    }, {});

    await SessionModel.findOneAndUpdate({ masterId }, updatePayload);
  };

  await next();

  const snapshotAfterProcessing = JSON.stringify(
    SESSION_FIELDS_TO_TRACK.reduce((acc, field) => {
      acc[field] = ctx.session[field];
      return acc;
    }, {})
  );

  if (snapshotBeforeProcessing !== snapshotAfterProcessing) {
    await ctx.saveSession();
  }
}
