import { getOrCreateThread, sendMessage } from '../chat.js';
import { uploadPrivateFile, formatFileSize } from '../r2-files.js';
import { getRequiredHomeworkFormats } from '../models/lesson.js';
import { supabase } from '../supabaseClient.js';

export function mountHomeworkField(container, { lesson, studentId, courseId, readOnly = false, onSubmitted = null }) {
  if (!lesson.homework_enabled) {
    container.innerHTML = `<p class="muted">Для цього уроку домашнє завдання не потрібне.</p>`;
    return;
  }

  if (readOnly) {
    container.innerHTML = `
      ${lesson.homework_description ? `<p class="homework-description">${escapeHtml(lesson.homework_description)}</p>` : ''}
      <div id="hw-review" class="homework-review"><p class="muted">Завантажуємо статус здачі…</p></div>
    `;
    mountAdminReview(container.querySelector('#hw-review'), { lessonId: lesson.id, studentId });
    return;
  }

  let files = [];
  const requiredFormats = getRequiredHomeworkFormats(lesson);

  container.innerHTML = `
    ${lesson.homework_description ? `<p class="homework-description">${escapeHtml(lesson.homework_description)}</p>` : ''}
    ${requiredFormats.length ? `<p class="muted">Обов’язково: ${requiredFormats.map(({ validationLabel }) => validationLabel).join(', ')}</p>` : ''}
    <textarea id="hw-text" rows="3" placeholder="Ваша відповідь (необов'язково, якщо додаєте лише файли)"></textarea>
    <div id="hw-files" style="margin:8px 0;"></div>
    <div class="homework-actions">
      <label class="btn">
        ＋ Фото або відео
        <input type="file" id="hw-file-input" accept="image/*,video/*" multiple style="display:none;" />
      </label>
      <button id="hw-submit" class="btn btn-primary">Надіслати</button>
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
      row.innerHTML = `<span>${escapeHtml(f.name)} <span class="muted">· ${formatFileSize(f.size)}</span></span>`;
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

    const hasPhoto = files.some((file) => file.type.startsWith('image/'));
    const hasVideo = files.some((file) => file.type.startsWith('video/'));
    const missing = [];
    for (const requirement of requiredFormats) {
      const isPresent = requirement.format === 'text' ? Boolean(text) : requirement.format === 'photo' ? hasPhoto : hasVideo;
      if (!isPresent) missing.push(requirement.validationLabel);
    }
    if (missing.length) {
      statusEl.style.display = 'block';
      statusEl.className = 'error-text';
      statusEl.textContent = `Додайте: ${missing.join(', ')}.`;
      return;
    }

    statusEl.style.display = 'block';
    statusEl.className = '';
    statusEl.textContent = 'Надсилаємо…';

    try {
      const threadId = await getOrCreateThread(studentId, courseId, lesson.id);
      const submitButton = container.querySelector('#hw-submit');
      submitButton.disabled = true;

      if (text) {
        await sendMessage({ threadId, senderRole: 'student', body: text, kind: 'homework' });
      }
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const attachmentUrl = await uploadPrivateFile({
          threadId,
          file,
          kind: 'homework',
          onProgress: (progress) => {
            statusEl.textContent = `Файл ${index + 1} з ${files.length}: ${Math.round(progress * 100)}%`;
          },
        });
        await sendMessage({ threadId, senderRole: 'student', body: file.name, attachmentUrl, kind: 'homework' });
      }

      const { error: progressError } = await supabase.from('lesson_progress').upsert({
        student_id: studentId,
        lesson_id: lesson.id,
        homework_submitted_at: new Date().toISOString(),
        homework_review_status: 'pending',
      }, { onConflict: 'student_id,lesson_id' });
      if (progressError) throw progressError;

      textEl.value = '';
      files = [];
      renderFiles();
      statusEl.className = 'success-text';
      statusEl.textContent = 'Надіслано ✓ дивіться в чаті цього уроку';
      onSubmitted?.();
    } catch (err) {
      console.error('homework submit failed', err);
      statusEl.className = 'error-text';
      statusEl.textContent = err.message || 'Не вдалося надіслати. Спробуйте ще раз.';
    } finally {
      container.querySelector('#hw-submit').disabled = false;
    }
  });
}

async function mountAdminReview(container, { lessonId, studentId }) {
  const { data: progress, error } = await supabase
    .from('lesson_progress')
    .select('homework_submitted_at, homework_review_status, reviewed_at')
    .eq('lesson_id', lessonId)
    .eq('student_id', studentId)
    .maybeSingle();
  if (error) {
    container.innerHTML = '<p class="muted">Не вдалося завантажити статус.</p>';
    return;
  }
  if (!progress?.homework_submitted_at) {
    container.innerHTML = '<p class="muted">Домашнє завдання ще не здано.</p>';
    return;
  }
  const labels = { pending: 'На перевірці', accepted: 'Зараховано', revision: 'Потребує виправлення' };
  container.innerHTML = `
    <p class="muted">Здано: ${new Date(progress.homework_submitted_at).toLocaleString('uk-UA')}</p>
    <p><strong>${labels[progress.homework_review_status] || 'На перевірці'}</strong></p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button type="button" class="btn btn-primary" data-review="accepted">Зарахувати</button>
      <button type="button" class="btn" data-review="revision">На виправлення</button>
    </div>
  `;
  container.querySelectorAll('[data-review]').forEach((button) => button.addEventListener('click', async () => {
    const status = button.dataset.review;
    const buttons = container.querySelectorAll('button');
    buttons.forEach((item) => { item.disabled = true; });
    const { error: updateError } = await supabase.from('lesson_progress').update({
      homework_review_status: status,
      reviewed_at: new Date().toISOString(),
    }).eq('lesson_id', lessonId).eq('student_id', studentId);
    if (updateError) {
      buttons.forEach((item) => { item.disabled = false; });
      alert('Не вдалося зберегти статус.');
      return;
    }
    mountAdminReview(container, { lessonId, studentId });
  }));
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
