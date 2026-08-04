// Тонка обгортка над Telegram Bot API (без сторонніх пакетів).
// Працює лише на сервері (pages/api/**), бо потребує TELEGRAM_BOT_TOKEN.

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

/**
 * Надсилає повідомлення в Telegram-чат.
 * @param {string} chatId - куди слати (chat_id адмінки)
 * @param {string} text
 * @param {number|null} replyToMessageId - якщо задано, повідомлення
 *   приєднується реплаєм до існуючого треду в Telegram (п.6 ТЗ).
 * @returns {Promise<{message_id: number}>} відправлене повідомлення Telegram
 */
export async function sendTelegramMessage(chatId, text, replyToMessageId = null) {
  const res = await fetch(`${API_BASE}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
      ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
    }),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram API error: ${JSON.stringify(data)}`);
  }
  return data.result;
}

/**
 * Формує посилання на конкретний чат в адмінці (deep link, п.6 ТЗ).
 */
export function buildAdminChatLink(studentId, courseId, lessonId) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || '';
  const lessonPart = lessonId ? lessonId : 'general';
  return `${base}/admin/${studentId}/${courseId}?lesson=${lessonPart}`;
}

/**
 * Формує текст "візитки" першого повідомлення нового треду (п.6 ТЗ):
 * курс, урок, ім'я учениці, посилання на чат.
 */
export function buildFirstMessageText({ studentName, courseTitle, lessonTitle, link, body }) {
  const lessonLine = lessonTitle ? `Урок: ${lessonTitle}` : 'Урок: Загальний';
  return (
    `<b>Нове повідомлення</b>\n` +
    `Учениця: ${studentName}\n` +
    `Курс: ${courseTitle}\n` +
    `${lessonLine}\n` +
    `<a href="${link}">Відкрити чат</a>\n\n` +
    `${body}`
  );
}
