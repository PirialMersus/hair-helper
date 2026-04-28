import cron from 'node-cron';
import { AppointmentModel } from '../db/models/Appointment.js';

function buildStartOfToday() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
}

function buildEndOfToday() {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return end;
}

export function startCronJobs(bot) {
  // Запускаем каждый день в 08:00 утра по времени Киева
  cron.schedule('0 8 * * *', async () => {
    try {
      console.log('Запуск утренней рассылки (Daily Briefing)...');
      
      const startOfDay = buildStartOfToday();
      const endOfDay = buildEndOfToday();

      // Находим все уникальные masterId, у которых есть записи на сегодня
      const todayAppointments = await AppointmentModel.find({
        dateTime: { $gte: startOfDay, $lte: endOfDay }
      }).sort({ dateTime: 1 });

      if (todayAppointments.length === 0) {
        return; // Записей нет вообще ни у кого
      }

      // Группируем записи по masterId
      const appointmentsByMaster = todayAppointments.reduce((acc, appt) => {
        if (!acc[appt.masterId]) {
          acc[appt.masterId] = [];
        }
        acc[appt.masterId].push(appt);
        return acc;
      }, {});

      // Рассылаем сообщения мастерам
      for (const [masterId, appointments] of Object.entries(appointmentsByMaster)) {
        let text = `☀️ *Доброе утро!*\nСегодня у тебя ${appointments.length} ${getAppointmentWord(appointments.length)}:\n\n`;
        
        appointments.forEach((appt, index) => {
          const time = appt.dateTime.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
          text += `${index + 1}. *${time}* — ${appt.clientName}`;
          if (appt.serviceType) text += ` (${appt.serviceType})`;
          text += '\n';
        });

        text += `\nУдачного дня и хороших клиентов! 💇‍♀️💇‍♂️`;

        try {
          await bot.api.sendMessage(masterId, text, { parse_mode: 'Markdown' });
        } catch (err) {
          console.error(`Ошибка отправки рассылки мастеру ${masterId}:`, err.message);
        }
      }
      
      console.log('Утренняя рассылка завершена.');
    } catch (error) {
      console.error('Ошибка в cronService:', error);
    }
  }, {
    timezone: 'Europe/Kyiv'
  });

  // Пинг для мониторинга активности (Health Check) только в продакшене каждые 5 минут
  if (process.env.NODE_ENV === 'production') {
    cron.schedule('*/5 * * * *', async () => {
      try {
        const healthCheckUrl = 'https://hc-ping.com/3a181b98-802b-4172-a946-aeccd5a75a04';
        const response = await fetch(healthCheckUrl);
        
        if (response.ok) {
          console.log('Health check пинг успешно отправлен');
        } else {
          console.error(`Ошибка при отправке health check пинга: ${response.status}`);
        }
      } catch (error) {
        console.error('Не удалось отправить health check пинг:', error.message);
      }
    });
  }
}

function getAppointmentWord(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  
  if (mod100 >= 11 && mod100 <= 14) {
    return 'записей';
  }
  
  if (mod10 === 1) {
    return 'запись';
  }
  
  if (mod10 >= 2 && mod10 <= 4) {
    return 'записи';
  }
  
  return 'записей';
}
