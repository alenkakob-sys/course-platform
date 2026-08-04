import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  getOrCreateThread,
  fetchMessages,
  sendMessage,
  markThreadRead,
  subscribeToThreadMessages,
  fetchUnreadCounts,
} from '@/lib/chat';

// Головна ідея (п.5, п.10 ТЗ): перемикач уроків тут — СВІЙ, окремий від
// LessonStrip, що керує відео вище. Можна дивитись відео уроку 7,
// водночас маючи відкритим чат уроку 1.
export default function ChatPanel({ courseId, studentId, lessons, viewerRole }) {
  const [chatLessonId, setChatLessonId] = useState('general'); // 'general' | lesson.id
  const [threadId, setThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [unread, setUnread] = useState({});
  const [sendError, setSendError] = useState('');

  const refreshUnread = useCallback(async () => {
    const counts = await fetchUnreadCounts(courseId, viewerRole, studentId);
    setUnread(counts);
  }, [courseId, viewerRole, studentId]);

  useEffect(() => {
    let unsubscribe = () => {};
    async function open() {
      const lessonId = chatLessonId === 'general' ? null : chatLessonId;
      const id = await getOrCreateThread(studentId, courseId, lessonId);
      setThreadId(id);
      setMessages(await fetchMessages(id));
      await markThreadRead(id, viewerRole);
      refreshUnread();
      unsubscribe = subscribeToThreadMessages(id, (msg) => {
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        // якщо повідомлення від іншої сторони і тред зараз відкритий -
        // одразу позначаємо прочитаним
        if (msg.sender_role !== viewerRole) {
          markThreadRead(id, viewerRole).then(refreshUnread);
        }
      });
    }
    open();
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatLessonId, studentId, courseId, viewerRole]);

  async function handleSend() {
    if (!draft.trim() || !threadId) return;
    const text = draft.trim();
    setDraft('');
    setSendError('');
    try {
      const id = await sendMessage({ threadId, senderRole: viewerRole, body: text });
      // Показуємо повідомлення одразу, не чекаючи realtime-підписки —
      // так воно з'являється миттєво навіть якщо realtime десь забарився.
      setMessages((prev) =>
        prev.some((m) => m.id === id) ? prev : [...prev, { id, sender_role: viewerRole, body: text, attachment_url: null, created_at: new Date().toISOString() }]
      );
    } catch (err) {
      console.error('send message failed', err);
      setSendError('Не вдалося надіслати. Перевірте інтернет і спробуйте ще раз.');
      setDraft(text);
    }
  }

  async function handleAttach(e) {
    const file = e.target.files[0];
    if (!file || !threadId) return;
    setSendError('');
    try {
      const path = `${threadId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from('chat-attachments').upload(path, file);
      if (uploadError) throw uploadError;
      const { data: pub } = supabase.storage.from('chat-attachments').getPublicUrl(path);
      const id = await sendMessage({ threadId, senderRole: viewerRole, body: '', attachmentUrl: pub.publicUrl });
      setMessages((prev) =>
        prev.some((m) => m.id === id)
          ? prev
          : [...prev, { id, sender_role: viewerRole, body: '', attachment_url: pub.publicUrl, created_at: new Date().toISOString() }]
      );
    } catch (err) {
      console.error('attach failed', err);
      setSendError('Не вдалося надіслати файл. Спробуйте ще раз.');
    }
  }

  return (
    <div style={{ border: '1px solid #eee', borderRadius: 8 }}>
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', padding: '8px 8px 0' }}>
        <ChatTab
          label="Загальний"
          active={chatLessonId === 'general'}
          unreadCount={unread.general || 0}
          onClick={() => setChatLessonId('general')}
        />
        {lessons.map((l) => (
          <ChatTab
            key={l.id}
            label={l.short_label || l.title}
            active={chatLessonId === l.id}
            unreadCount={unread[l.id] || 0}
            onClick={() => setChatLessonId(l.id)}
          />
        ))}
      </div>

      <div style={{ padding: 10, maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              alignSelf: m.sender_role === viewerRole ? 'flex-end' : 'flex-start',
              background: m.sender_role === viewerRole ? '#111' : '#f0f0f0',
              color: m.sender_role === viewerRole ? '#fff' : '#111',
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: 13,
              maxWidth: '80%',
            }}
          >
            {m.body}
            {m.attachment_url && (
              <div>
                <a href={m.attachment_url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>
                  вкладення
                </a>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: 8, borderTop: '1px solid #eee' }}>
        <label style={{ cursor: 'pointer', fontSize: 16 }}>
          📎
          <input type="file" onChange={handleAttach} style={{ display: 'none' }} />
        </label>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Повідомлення"
          style={{ flex: 1, fontSize: 13, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6 }}
        />
        <button onClick={handleSend} style={{ fontSize: 13, padding: '6px 10px' }}>
          Надіслати
        </button>
      </div>
      {sendError && <p style={{ fontSize: 12, color: 'crimson', padding: '0 8px 8px' }}>{sendError}</p>}
    </div>
  );
}

function ChatTab({ label, active, unreadCount, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0,
        position: 'relative',
        fontSize: 11,
        padding: '4px 8px',
        borderRadius: 6,
        border: '1px solid ' + (active ? '#111' : '#ddd'),
        background: active ? '#111' : '#fff',
        color: active ? '#fff' : '#333',
        cursor: 'pointer',
      }}
    >
      {label}
      {unreadCount > 0 && (
        <span
          style={{
            position: 'absolute',
            top: -5,
            right: -5,
            background: '#e5484d',
            color: '#fff',
            borderRadius: 999,
            fontSize: 9,
            minWidth: 14,
            height: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {unreadCount}
        </span>
      )}
    </button>
  );
}
