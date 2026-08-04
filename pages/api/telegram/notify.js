import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendTelegramMessage, buildAdminChatLink, buildFirstMessageText } from '@/lib/telegram';

// Викликається з клієнта одразу після того, як учениця надіслала
// повідомлення в чат (див. components/ChatPanel.js). Логіка з п.6 ТЗ:
// перше повідомлення нового треду -> "візитка" з посиланням у Telegram,
// усі наступні -> звичайний реплай у той самий Telegram-тред.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { threadId, messageId } = req.body;
  if (!threadId || !messageId) {
    return res.status(400).json({ error: 'threadId and messageId required' });
  }

  try {
    const { data: message, error: msgError } = await supabaseAdmin
      .from('chat_messages')
      .select('id, body, sender_role')
      .eq('id', messageId)
      .single();
    if (msgError) throw msgError;

    // Форвардимо в Telegram лише повідомлення від учениць.
    if (message.sender_role !== 'student') {
      return res.status(200).json({ skipped: true });
    }

    const { data: thread, error: threadError } = await supabaseAdmin
      .from('chat_threads')
      .select(
        'id, student_id, course_id, lesson_id, profiles(full_name, email), courses(title), lessons(title)'
      )
      .eq('id', threadId)
      .single();
    if (threadError) throw threadError;

    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    const link = buildAdminChatLink(thread.student_id, thread.course_id, thread.lesson_id);

    // Чи вже є Telegram-тред для цього діалогу? Беремо найперше повідомлення,
    // щоб усі наступні реплаї трималися одним ланцюжком (п.6 ТЗ).
    const { data: existingMap } = await supabaseAdmin
      .from('telegram_message_map')
      .select('telegram_message_id')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    let sent;
    if (!existingMap) {
      const studentName = thread.profiles?.full_name || thread.profiles?.email || 'Учениця';
      const text = buildFirstMessageText({
        studentName,
        courseTitle: thread.courses?.title || '',
        lessonTitle: thread.lessons?.title || null,
        link,
        body: message.body,
      });
      sent = await sendTelegramMessage(adminChatId, text);
    } else {
      sent = await sendTelegramMessage(adminChatId, message.body, existingMap.telegram_message_id);
    }

    await supabaseAdmin.from('telegram_message_map').insert({
      telegram_message_id: sent.message_id,
      thread_id: threadId,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('telegram notify error', err);
    return res.status(500).json({ error: err.message });
  }
}
