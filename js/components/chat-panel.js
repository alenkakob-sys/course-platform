import { getOrCreateThread, fetchMessages, sendMessage, markThreadRead, subscribeToThreadMessages, fetchUnreadCounts } from '../chat.js?v=20261112-2';
import { uploadPrivateFile, openPrivateFile, isPrivateFileRef, getPrivateFilePreviewUrl, attachmentKind } from '../r2-files.js?v=20261112-2';

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
      <label style="cursor:pointer;font-size:16px;">📎<input type="file" id="chat-attach" multiple style="display:none;" /></label>
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
      const privateAttachment = m.attachment_url && isPrivateFileRef(m.attachment_url);
      const kind = privateAttachment ? attachmentKind(m.body) : 'file';
      const showsPreview = kind === 'image' || kind === 'video';

      // Для картинки чи відео підпис — це просто назва файлу, а сам файл видно
      // поруч. Друкуємо її дрібним рядком, щоб не забивала бульбашку.
      if (m.body) {
        const body = document.createElement('div');
        body.textContent = m.body;
        if (showsPreview) body.className = 'attachment-name';
        bubble.appendChild(body);
      }

      if (m.attachment_url) {
        if (kind === 'image') bubble.appendChild(buildImagePreview(m));
        if (kind === 'video') bubble.appendChild(buildVideoPreview(m));

        const actions = document.createElement('div');
        actions.className = 'attachment-actions';

        if (privateAttachment) {
          // «Відкрити» лишається тільки там, де показати всередині чату нічим.
          const buttons = showsPreview ? [['Завантажити', true]] : [['Відкрити', false], ['Завантажити', true]];
          for (const [label, download] of buttons) {
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

  // Картинку замовляємо не одразу для всієї стрічки, а коли вона підходить до
  // видимої частини чату: у старому треді може бути сто фото ДЗ, і сто запитів
  // на посилання при кожному відкритті — це і довго, і платно.
  const previewObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      previewObserver.unobserve(entry.target);
      entry.target.dispatchEvent(new CustomEvent('preview-needed'));
    }
  }, { root: messagesEl, rootMargin: '200px' });

  function previewFailed(box, messageId) {
    box.classList.remove('loading');
    box.classList.add('failed');
    box.textContent = '';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'attachment-link';
    retry.textContent = 'Не вдалося показати — відкрити окремо';
    retry.addEventListener('click', () => openPrivateFile(messageId).catch(() => {}));
    box.appendChild(retry);
  }

  function buildImagePreview(message) {
    const box = document.createElement('div');
    box.className = 'attachment-preview loading';
    box.addEventListener('preview-needed', async () => {
      try {
        const url = await getPrivateFilePreviewUrl(message.id);
        const image = document.createElement('img');
        image.alt = message.body || 'Вкладення';
        image.addEventListener('load', () => box.classList.remove('loading'), { once: true });
        image.addEventListener('error', () => previewFailed(box, message.id), { once: true });
        image.src = url;
        box.appendChild(image);
        box.addEventListener('click', () => openLightbox(url, message.body));
      } catch (error) {
        console.error('preview failed', error);
        previewFailed(box, message.id);
      }
    }, { once: true });
    previewObserver.observe(box);
    return box;
  }

  // Відео не вантажимо самі: показуємо кнопку, і програвач зʼявляється лише
  // тоді, коли його справді хочуть подивитись.
  function buildVideoPreview(message) {
    const box = document.createElement('div');
    box.className = 'attachment-preview attachment-video';
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'attachment-play';
    play.setAttribute('aria-label', `Увімкнути відео${message.body ? `: ${message.body}` : ''}`);
    play.addEventListener('click', async () => {
      play.disabled = true;
      box.classList.add('loading');
      try {
        const url = await getPrivateFilePreviewUrl(message.id);
        const video = document.createElement('video');
        video.controls = true;
        video.playsInline = true;
        video.autoplay = true;
        video.preload = 'metadata';
        video.src = url;
        box.classList.remove('loading');
        box.replaceChildren(video);
      } catch (error) {
        console.error('preview failed', error);
        previewFailed(box, message.id);
      }
    });
    box.appendChild(play);
    return box;
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

  // Файлів може бути кілька. Вантажимо їх по черзі, а не всі разом: паралельні
  // вивантаження великих відео забивають канал і збивають лічильник відсотків.
  // Кожен файл їде окремим повідомленням, тому впав один — решта все одно дійде.
  async function handleAttach(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length || !state.threadId) return;
    const uploadThreadId = state.threadId;
    e.target.value = '';
    errorEl.style.display = 'none';
    const sendButton = container.querySelector('#chat-send');
    const originalText = sendButton.textContent;
    sendButton.disabled = true;
    const failed = [];

    for (const [index, file] of files.entries()) {
      const counter = files.length > 1 ? `${index + 1}/${files.length} · ` : '';
      try {
        const attachmentUrl = await uploadPrivateFile({
          threadId: uploadThreadId,
          file,
          kind: 'chat',
          onProgress: (progress) => { sendButton.textContent = `${counter}${Math.round(progress * 100)}%`; },
        });
        const id = await sendMessage({ threadId: uploadThreadId, senderRole: viewerRole, body: file.name, attachmentUrl });
        if (state.threadId === uploadThreadId && !state.messages.some((message) => message.id === id)) {
          state.messages.push({ id, sender_role: viewerRole, kind: 'message', body: file.name, attachment_url: attachmentUrl });
          renderMessages();
        }
      } catch (err) {
        console.error('attach failed', err);
        failed.push(file.name);
      }
    }

    if (failed.length) {
      errorEl.textContent = `Не вдалося надіслати: ${failed.join(', ')}. Спробуйте ще раз.`;
      errorEl.style.display = 'block';
    }
    sendButton.disabled = false;
    sendButton.textContent = originalText;
  }

  container.querySelector('#chat-send').addEventListener('click', handleSend);
  draftEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSend(); });
  container.querySelector('#chat-attach').addEventListener('change', handleAttach);

  openThread(validInitialLesson);

  return () => unsubscribe(); // викликати при демонтажі, якщо колись знадобиться
}

// Фото на весь екран: у бульбашці воно дрібне, а розглядати треба саме роботу.
function openLightbox(url, caption) {
  const overlay = document.createElement('div');
  overlay.className = 'lightbox';
  overlay.innerHTML = `
    <button class="lightbox-close" type="button" aria-label="Закрити">✕</button>
    <img alt="${escapeHtml(caption || 'Вкладення')}" />
  `;
  overlay.querySelector('img').src = url;

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (event) => { if (event.key === 'Escape') close(); };

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target.closest('.lightbox-close')) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
