const lastMessageTimestampByUserId = new Map();
const MINIMUM_INTERVAL_BETWEEN_MESSAGES_MS = 1000;
const RATE_LIMITER_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const RATE_LIMITER_ENTRY_TTL_MS = 5 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [userId, timestamp] of lastMessageTimestampByUserId) {
    if (now - timestamp > RATE_LIMITER_ENTRY_TTL_MS) {
      lastMessageTimestampByUserId.delete(userId);
    }
  }
}, RATE_LIMITER_CLEANUP_INTERVAL_MS);

export function rateLimiterMiddleware(ctx, next) {
  const userId = String(ctx.from?.id);
  if (!userId) return next();

  const lastTimestamp = lastMessageTimestampByUserId.get(userId) ?? 0;
  const currentTimestamp = Date.now();

  if (currentTimestamp - lastTimestamp < MINIMUM_INTERVAL_BETWEEN_MESSAGES_MS) {
    return ctx.reply('⏳ Не так быстро! Подожди секунду.');
  }

  lastMessageTimestampByUserId.set(userId, currentTimestamp);
  return next();
}
