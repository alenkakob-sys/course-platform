import { supabase } from './supabaseClient.js';
import { FUNCTIONS_URL } from './config.js';

// Кожна пара (учениця, курс, урок|null="Загальний") -> окремий приватний
// тред (п.5 ТЗ). Створюється лінькво, при першому відкритті вкладки.
export async function getOrCreateThread(studentId, courseId, lessonId) {
  const query = supabase.from('chat_threads').select('id').eq('student_id', studentId).eq('course_id', courseId);
  const { data: existing } = lessonId
    ? await query.eq('lesson_id', lessonId).maybeSingle()
    : await query.is('lesson_id', null).maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from('chat_threads')
    .insert({ student_id: studentId, course_id: courseId, lesson_id: lessonId })
    .select('id')
    .single();
  if (error) throw error;
  return created.id;
}

export async function fetchMessages(threadId) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, sender_role, kind, body, attachment_url, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function sendMessage({ threadId, senderRole, body, attachmentUrl = null, kind = 'message' }) {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ thread_id: threadId, sender_role: senderRole, body, attachment_url: attachmentUrl, kind })
    .select('id')
    .single();
  if (error) throw error;

  // Форвардимо в Telegram лише повідомлення від учениць (п.6 ТЗ) —
  // через окремий міні-проєкт функцій на Netlify (config.js: FUNCTIONS_URL).
  if (senderRole === 'student') {
    fetch(`${FUNCTIONS_URL}/telegram-notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId, messageId: data.id }),
    }).catch((err) => console.error('telegram notify failed', err));
  }

  return data.id;
}

export async function markThreadRead(threadId, role) {
  await supabase.from('thread_reads').upsert({ thread_id: threadId, reader_role: role, last_read_at: new Date().toISOString() });
}

export function subscribeToThreadMessages(threadId, onInsert) {
  const channel = supabase
    .channel(`thread-${threadId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${threadId}` }, (payload) => onInsert(payload.new))
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export async function fetchUnreadCounts(courseId, viewerRole, studentId = null) {
  let query = supabase.from('thread_unread_counts').select('*').eq('course_id', courseId);
  if (studentId) query = query.eq('student_id', studentId);
  const { data, error } = await query;
  if (error) throw error;
  const field = viewerRole === 'admin' ? 'unread_for_admin' : 'unread_for_student';
  const map = {};
  for (const row of data) map[row.lesson_id || 'general'] = row[field];
  return map;
}
