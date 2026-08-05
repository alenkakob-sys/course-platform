import { supabase } from '../supabaseClient.js';
import { getOrCreateThread, sendMessage } from '../chat.js';

export function mountHomeworkField(container, { lesson, studentId, courseId }) {
  if (!lesson.homework_type && !lesson.homework_description) {
    container.innerHTML = `<p class="muted">Для цього уроку домашнє завдання не потрібне.</p>`;
    return;
  }

  let files = [];

  container.innerHTML = `
    ${lesson.homework_description ? `<p style="white-space:pre-wrap;background:var(--surface-2);border-radius:8px;padding:10px;margin-bottom:10px;font-size:13px;">${escapeHtml(lesson.homework_description)}</p>` : ''}
    <textarea id="hw-text" rows="3" placeholder="Ваша відповідь (необов'язково, якщо додаєте лише файли)"></textarea>
    <div id="hw-files" style="margin:8px 0;"></div>
    <div style="display:flex;gap:8px;align-items:center;">
      <label class="btn" style="cursor:pointer;">
        + Фото/відео
        <input type="file" id="hw-file-input" accept="image/*,video/*" multiple style="display:none;" />
      </label>
      <button id="hw-submit" class="btn btn-primary">Надіслати домашнє завдання</button>
    </div>
    <p id="hw-status" style="display:none;"></p>
  `;

  const filesEl = container.querySelector('#hw-files');
  const statusEl = container.querySelector('#hw-status');

  function renderFiles() {
    filesEl.innerHTML = '';
    files.forEach((f, i) => {
      const row = document.createElement('div');
      row.className = 'row-between';
      row.style.fontSize = '12px';
      row.innerHTML = `<span>${escapeHtml(f.name)}</span>`;
      const removeBtn = document.createElement('button');
      removeBtn.textContent = '✕';
      removeBtn.style.color = 'var(--danger)';
      removeBtn.addEventListener('click', () => { files.splice(i, 1); renderFiles(); });
      row.appendChild(removeBtn);
      filesEl.appendChild(row);
    });
  }

  container.querySelector('#hw-file-input').addEventListener('change', (e) => {
    files.push(...Array.from(e.target.files));
    e.target.value = '';
    renderFiles();
  });

  container.querySelector('#hw-submit').addEventListener('click', async () => {
    const textEl = container.querySelector('#hw-text');
    const text = textEl.value.trim();
    if (!text && files.length === 0) return;

    statusEl.style.display = 'block';
    statusEl.className = '';
    statusEl.textContent = 'Надсилаємо…';

    try {
      const threadId = await getOrCreateThread(studentId, courseId, lesson.id);

      if (text) {
        await sendMessage({ threadId, senderRole: 'student', body: text, kind: 'homework' });
      }
      for (const file of files) {
        const path = `${threadId}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage.from('chat-attachments').upload(path, file);
        if (uploadError) throw uploadError;
        const { data: pub } = supabase.storage.from('chat-attachments').getPublicUrl(path);
        await sendMessage({ threadId, senderRole: 'student', body: '', attachmentUrl: pub.publicUrl, kind: 'homework' });
      }

      textEl.value = '';
      files = [];
      renderFiles();
      statusEl.className = 'success-text';
      statusEl.textContent = 'Надіслано ✓ дивіться в чаті цього уроку';
    } catch (err) {
      console.error('homework submit failed', err);
      statusEl.className = 'error-text';
      statusEl.textContent = 'Не вдалося надіслати. Спробуйте ще раз.';
    }
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
