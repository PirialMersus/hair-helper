import 'dotenv/config';

const alwaysRequiredEnvironmentVariables = [
  'TELEGRAM_TOKEN',
  'GEMINI_API_KEY',
  'MONGO_URI',
];

const productionOnlyEnvironmentVariables = [
  'WEBHOOK_URL',
];

for (const variableName of alwaysRequiredEnvironmentVariables) {
  if (!process.env[variableName]) {
    throw new Error(`Отсутствует обязательная переменная окружения: ${variableName}`);
  }
}

if (process.env.NODE_ENV === 'production') {
  for (const variableName of productionOnlyEnvironmentVariables) {
    if (!process.env[variableName]) {
      throw new Error(`Для production обязательна переменная: ${variableName}`);
    }
  }
}

export const telegramToken = process.env.TELEGRAM_TOKEN;
export const geminiApiKey = process.env.GEMINI_API_KEY;
export const mongoUri = process.env.MONGO_URI;
export const webhookUrl = process.env.WEBHOOK_URL || '';
export const serverPort = Number(process.env.PORT) || 3000;
