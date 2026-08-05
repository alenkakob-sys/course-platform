import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Telegram викликає цей адрес при кожному новому повідомленні в бота
// (налаштовується один раз через setWebhook, див. README).
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  // Захист: Telegram надсилає секрет, який ми задали при setWebhook.
  const secret = req.headers['x-telegram-bot-api-secret-token'];
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).end();
  }

  const update = req.body;
  const message = update.message;

  // Нас цікавлять лише текстові відповіді (реплаї) адмінки на повідомлення бота.
  if (!message || !message.reply_to_message || !message.text) {
    return res.status(200).json({ ignored: true });
  }

  try {
    const repliedToId = message.reply_to_message.message_id;

    const { data: mapping } = await supabaseAdmin
      .from('telegram_message_map')
      .select('thread_id')
      .eq('telegram_message_id', repliedToId)
      .maybeSingle();

    if (!mapping) {
      // Реплай на повідомлення, що не пов'язане з жодним тредом на сайті.
      return res.status(200).json({ ignored: true, reason: 'no thread mapping' });
    }

    const { data: newMessage, error } = await supabaseAdmin
      .from('chat_messages')
      .insert({
        thread_id: mapping.thread_id,
        sender_role: 'admin',
        body: message.text,
      })
      .select('id')
      .single();
    if (error) throw error;

    // Записуємо це повідомлення теж у карту, щоб майбутні реплаї
    // (навіть на цю саму відповідь) так само резолвились у правильний тред.
    await supabaseAdmin.from('telegram_message_map').insert({
      telegram_message_id: message.message_id,
      thread_id: mapping.thread_id,
    });

    return res.status(200).json({ ok: true, messageId: newMessage.id });
  } catch (err) {
    console.error('telegram webhook error', err);
    return res.status(500).json({ error: err.message });
  }
}
