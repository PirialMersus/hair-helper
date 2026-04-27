import mongoose from 'mongoose';
import { mongoUri } from '../config/env.js';

const MAX_CONNECTION_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

export async function connectToDatabase() {
  let retriesLeft = MAX_CONNECTION_RETRIES;

  while (retriesLeft > 0) {
    try {
      await mongoose.connect(mongoUri);
      console.log('MongoDB подключена успешно');

      mongoose.connection.on('disconnected', () => {
        console.warn('MongoDB отключена. Попытка переподключения...');
      });

      mongoose.connection.on('reconnected', () => {
        console.log('MongoDB переподключена.');
      });

      mongoose.connection.on('error', (error) => {
        console.error('Ошибка MongoDB:', error.message);
      });

      return;
    } catch (error) {
      retriesLeft -= 1;
      console.error(`Ошибка подключения к MongoDB (осталось попыток: ${retriesLeft}):`, error.message);
      if (retriesLeft === 0) throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}
