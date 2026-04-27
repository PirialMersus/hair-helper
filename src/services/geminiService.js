import { GoogleGenerativeAI } from '@google/generative-ai';
import { geminiApiKey } from '../config/env.js';

const googleGenerativeAIClient = new GoogleGenerativeAI(geminiApiKey);

const geminiFlashModel = googleGenerativeAIClient.getGenerativeModel({
  model: 'gemini-2.5-flash',
});

const systemPromptForHairMasterAssistant = `Ты — профессиональный ассистент парикмахера. Твоя задача — извлекать структурированные данные из текстового или голосового сообщения мастера.

Извлекай: имя клиента, дату и время записи, сумму и тип операции (доход/расход), описание покупки, рецепт окрашивания.

Особое внимание датам: если мастер говорит "сегодня", "завтра" или называет день недели, вычисли точную дату на основе текущей даты, которую я тебе передам.

Если данных недостаточно — вежливо уточни на русском языке.

ВСЕГДА возвращай ответ ТОЛЬКО в формате валидного JSON (без markdown, без обёртки \`\`\`json):
{
  "actions": [
    {
      "action": "appointment|cancel_appointment|finance|need|unknown",
      "data": {
        "name": "имя клиента",
        "date": "YYYY-MM-DD или сегодня/завтра",
        "time": "HH:mm",
        "amount": 1000,
        "type": "income/expense",
        "item": "название товара"
      }
    }
  ],
  "userMessage": "Единый текст для отображения мастеру на русском языке, обобщающий все действия"
}`;

function safeJsonParse(rawText) {
  let cleaned = rawText.trim();
  const jsonBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    cleaned = jsonBlockMatch[1].trim();
  }
  return JSON.parse(cleaned);
}

export function escapeRegExpSpecialChars(text) {
  if (!text) return '';
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function parseIntentFromText(userText) {
  const now = new Date();
  const dateContext = `Контекст: сегодня ${now.toLocaleDateString('ru-RU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`;
  const fullPrompt = `${systemPromptForHairMasterAssistant}\n\n${dateContext}\n\nСообщение мастера: "${userText}"`;
  const generationResult = await geminiFlashModel.generateContent(fullPrompt);
  const rawResponseText = generationResult.response.text().trim();
  return safeJsonParse(rawResponseText);
}

export async function parseIntentFromAudio(audioBase64, mimeType) {
  const now = new Date();
  const dateContext = `Контекст: сегодня ${now.toLocaleDateString('ru-RU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`;
  const fullPrompt = `${systemPromptForHairMasterAssistant}\n\n${dateContext}\n\nМастер прислал голосовое сообщение. Расшифруй его и извлеки данные согласно инструкции выше.`;
  const generationResult = await geminiFlashModel.generateContent([
    fullPrompt,
    { inlineData: { data: audioBase64, mimeType } },
  ]);
  const rawResponseText = generationResult.response.text().trim();
  return safeJsonParse(rawResponseText);
}

export async function classifyPhotoAsBeforeOrAfter(photoBase64) {
  const classificationPrompt = `Ты — ассистент парикмахера. Перед тобой фотография из парикмахерской. Определи: это фото ДО или ПОСЛЕ процедуры?

Ответь ТОЛЬКО в формате валидного JSON:
{
  "classification": "before" | "after" | "uncertain",
  "confidence": 0.0-1.0,
  "description": "Краткое описание что видно на фото (на русском)"
}`;

  const generationResult = await geminiFlashModel.generateContent([
    classificationPrompt,
    { inlineData: { data: photoBase64, mimeType: 'image/jpeg' } },
  ]);
  const rawResponseText = generationResult.response.text().trim();
  return safeJsonParse(rawResponseText);
}

export async function describeColoringTechnique(photoBase64) {
  const descriptionPrompt = `Ты — профессиональный колорист. Опиши технику окрашивания на этом фото подробно: 
- Используемая техника (балаяж, шатуш, омбре, сплошное окрашивание и т.д.)
- Примерный рецепт краски если видно
- Общее впечатление о работе

Ответ на русском языке, 3-5 предложений.`;

  const generationResult = await geminiFlashModel.generateContent([
    descriptionPrompt,
    { inlineData: { data: photoBase64, mimeType: 'image/jpeg' } },
  ]);
  return generationResult.response.text().trim();
}
