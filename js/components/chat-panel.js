import { getOrCreateThread, fetchMessages, sendMessage, markThreadRead, subscribeToThreadMessages, fetchUnreadCounts } from '../chat.js';
import { uploadPrivateFile, openPrivateFile, isPrivateFileRef } from '../r2-files.js';

// Монтує незалежний модуль чату в container. lessons — масив уроків курсу.
// Перемикач уроків тут СВІЙ, окремий від відео вище (п.10 ТЗ):
// можна дивитись відео уроку 7, маючи відкритим чат уроку 1.
export function mountChatPanel(container, { courseId, studentId, lessons, viewerRole, initialLessonId = 'general' }) {
  const validInitialLesson = initialLessonId === 'general' || lessons.some((lesson) => lesson.id === initialLessonId)
    ? initialLessonId
    : 'general';
  const state = { chatLessonId: validInitialLesson, threadId: null, messages: [], unread: {} };
  let unsubscribe = () => {};

  container.innerHTML = `
    <div class="chat-tabs" id="chat-tabs"></div>
    <div class="msg-list" id="chat-messages"></div>
    <p class="error-text" id="chat-error" style="display:none;"></p>
    <div class="chat-input-row">
      <label style="cursor:pointer;font-size:16px;">📎<input type="file" id="chat-attach" style="display:none;" /></label>
      <input type="text" id="chat-draft" placeholder="Повідомлення" />
      <button id="chat-send" class="btn">Надіслати</button>
    </div>
  `;

  const tabsEl = container.querySelector('#chat-tabs');
  const messagesEl = container.querySelector('#chat-messages');
  const errorEl = container.querySelector('#chat-error');
  const draftEl = container.querySelector('#chat-draft');

  async function refreshUnread() {
    state.unread = await fetchUnreadCounts(courseId, viewerRole, studentId);
    renderTabs();
  }

  function renderTabs() {
    const items = [{ id: 'general', label: 'Загальний' }, ...lessons.map((l) => ({ id: l.id, label: l.short_label || l.title }))];
    tabsEl.innerHTML = '';
    for (const item of items) {
      const btn = document.createElement('button');
      btn.className = 'chat-tab' + (state.chatLessonId === item.id ? ' active' : '');
      const unreadCount = state.unread[item.id] || 0;
      btn.innerHTML = escapeHtml(item.label) + (unreadCount > 0 ? `<span class="chat-dot">${unreadCount}</span>` : '');
      btn.addEventListener('click', () => openThread(item.id));
      tabsEl.appendChild(btn);
    }
  }

  function renderMessages() {
    messagesEl.innerHTML = '';
    for (const m of state.messages) {
      const wrap = document.createElement('div');
      wrap.style.display = 'flex';
      wrap.style.flexDirection = 'column';
      wrap.style.alignItems = m.sender_role === viewerRole ? 'flex-end' : 'flex-start';

      if (m.kind === 'homework') {
        const label = document.createElement('p');
        label.className = 'msg-label';
        label.textContent = 'Домашнє завдання';
        wrap.appendChild(label);
      }

      const bubble = document.createElement('div');
      bubble.className = 'msg ' + (m.kind === 'homework' ? 'homework' : m.sender_role === viewerRole ? 'mine' : 'theirs');
      if (m.body) {
        const body = document.createElement('div');
        body.textContent = m.body;
        bubble.appendChild(body);
      }
      if (m.attachment_url) {
        const actions = document.createElement('div');
        actions.className = 'attachment-actions';

        if (isPrivateFileRef(m.attachment_url)) {
          for (const [label, download] of [['Відкрити', false], ['Завантажити', true]]) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'attachment-link';
            button.textContent = label;
            button.addEventListener('click', async () => {
              button.disabled = true;
              try {
                await openPrivateFile(m.id, { download });
              } catch (error) {
                console.error('open attachment failed', error);
                errorEl.textContent = 'Не вдалося відкрити файл. Спробуйте ще раз.';
                errorEl.style.display = 'block';
              } finally {
                button.disabled = false;
              }
            });
            actions.appendChild(button);
          }
        } else {
          const link = document.createElement('a');
          link.href = m.attachment_url;
          link.target = '_blank';
          link.rel = 'noreferrer';
          link.textContent = 'Відкрити вкладення';
          actions.appendChild(link);
        }
        bubble.appendChild(actions);
      }
      wrap.appendChild(bubble);
      messagesEl.appendChild(wrap);
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function openThread(lessonId) {
    state.chatLessonId = lessonId;
    renderTabs();
    unsubscribe();
    const realLessonId = lessonId === 'general' ? null : lessonId;
    state.threadId = await getOrCreateThread(studentId, courseId, realLessonId);
    state.messages = await fetchMessages(state.threadId);
    renderMessages();
    await markThreadRead(state.threadId, viewerRole);
    refreshUnread();
    unsubscribe = subscribeToThreadMessages(state.threadId, (msg) => {
      if (!state.messages.some((m) => m.id === msg.id)) {
        state.messages.push(msg);
        renderMessages();
      }
      if (msg.sender_role !== viewerRole) {
        markThreadRead(state.threadId, viewerRole).then(refreshUnread);
      }
    });
  }

  async function handleSend() {
    const text = draftEl.value.trim();
    if (!text || !state.threadId) return;
    draftEl.value = '';
    errorEl.style.display = 'none';
    try {
      const id = await sendMessage({ threadId: state.threadId, senderRole: viewerRole, body: text });
      if (!state.messages.some((m) => m.id === id)) {
        state.messages.push({ id, sender_role: viewerRole, kind: 'message', body: text, attachment_url: null });
        renderMessages();
      }
    } catch (err) {
      console.error('send failed', err);
      draftEl.value = text;
      errorEl.textContent = 'Не вдалося надіслати. Перевірте інтернет і спробуйте ще раз.';
      errorEl.style.display = 'block';
    }
  }

  async function handleAttach(e) {
    const file = e.target.files[0];
    if (!file || !state.threadId) return;
    const uploadThreadId = state.threadId;
    e.target.value = '';
    errorEl.style.display = 'none';
    const sendButton = container.querySelector('#chat-send');
    const originalText = sendButton.textContent;
    sendButton.disabled = true;
    try {
      const attachmentUrl = await uploadPrivateFile({
        threadId: uploadThreadId,
        file,
        kind: 'chat',
        onProgress: (progress) => { sendButton.textContent = `${Math.round(progress * 100)}%`; },
      });
      const id = await sendMessage({ threadId: uploadThreadId, senderRole: viewerRole, body: file.name, attachmentUrl });
      if (state.threadId === uploadThreadId && !state.messages.some((message) => message.id === id)) {
        state.messages.push({ id, sender_role: viewerRole, kind: 'message', body: file.name, attachment_url: attachmentUrl });
        renderMessages();
      }
    } catch (err) {
      console.error('attach failed', err);
      errorEl.textContent = err.message || 'Не вдалося надіслати файл.';
      errorEl.style.display = 'block';
    } finally {
      sendButton.disabled = false;
      sendButton.textContent = originalText;
    }
  }

  container.querySelector('#chat-send').addEventListener('click', handleSend);
  draftEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSend(); });
  container.querySelector('#chat-attach').addEventListener('change', handleAttach);

  openThread(validInitialLesson);

  return () => unsubscribe(); // викликати при демонтажі, якщо колись знадобиться
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
