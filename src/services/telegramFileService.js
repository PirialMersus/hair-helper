import https from 'https';
import { telegramToken } from '../config/env.js';

function downloadFileAsBuffer(fileUrl) {
  return new Promise((resolve, reject) => {
    https.get(fileUrl, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

export async function downloadTelegramFileAsBase64(fileId, bot) {
  const telegramFile = await bot.api.getFile(fileId);
  return downloadTelegramFileAsBase64ByPath(telegramFile.file_path);
}

export async function downloadTelegramFileAsBase64ByPath(filePath) {
  const downloadUrl = `https://api.telegram.org/file/bot${telegramToken}/${filePath}`;
  const fileBuffer = await downloadFileAsBuffer(downloadUrl);
  return fileBuffer.toString('base64');
}

export function detectAudioMimeType(filePath) {
  if (filePath.endsWith('.ogg') || filePath.endsWith('.oga')) return 'audio/ogg';
  if (filePath.endsWith('.mp4') || filePath.endsWith('.m4a')) return 'audio/mp4';
  if (filePath.endsWith('.mp3')) return 'audio/mpeg';
  return 'audio/ogg';
}
