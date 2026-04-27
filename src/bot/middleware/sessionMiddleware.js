import { SessionModel } from '../../db/models/Session.js';

const SESSION_FIELDS_TO_TRACK = ['step', 'activeClientId', 'pendingPhotoFileId', 'activeDate', 'pendingActions', 'searchQuery'];

export async function sessionMiddleware(ctx, next) {
  const masterId = String(ctx.from?.id);
  if (!masterId) return next();

  let sessionDocument = await SessionModel.findOne({ masterId });
  if (!sessionDocument) {
    sessionDocument = await SessionModel.create({ masterId });
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
