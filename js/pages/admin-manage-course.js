import { supabase } from '../supabaseClient.js';
import { requireAdmin } from '../auth.js';

const params = new URLSearchParams(window.location.search);
const courseId = params.get('course');

const auth = await requireAdmin();
if (auth) {
  const titleInput = document.getElementById('course-title');
  const presentationInput = document.getElementById('presentation-url');
  const lessonsEl = document.getElementById('lessons-list');

  let lessons = [];

  async function load() {
    const [{ data: course }, { data: presentation }, { data: lessonsData }] = await Promise.all([
      supabase.from('courses').select('id, title').eq('id', courseId).single(),
      supabase.from('presentations').select('embed_url').eq('course_id', courseId).maybeSingle(),
      supabase.from('lessons').select('id, title, short_label, description, homework_type, homework_description, order_index, videos(id, youtube_id, order_index)').eq('course_id', courseId).order('order_index'),
    ]);
    titleInput.value = course?.title || '';
    presentationInput.value = presentation?.embed_url || '';
    lessons = lessonsData || [];
    renderLessons();
  }

  titleInput.addEventListener('blur', async () => {
    await supabase.from('courses').update({ title: titleInput.value }).eq('id', courseId);
  });

  presentationInput.addEventListener('blur', async () => {
    if (presentationInput.value.trim()) {
      await supabase.from('presentations').upsert({ course_id: courseId, embed_url: presentationInput.value.trim() });
    } else {
      await supabase.from('presentations').delete().eq('course_id', courseId);
    }
  });

  document.getElementById('add-lesson').addEventListener('click', async () => {
    await supabase.from('lessons').insert({ course_id: courseId, title: 'Новий урок', short_label: String(lessons.length), order_index: lessons.length });
    load();
  });

  function extractYoutubeId(input) {
    const value = input.trim();
    const match = value.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|shorts\/|watch\?v=))([\w-]{11})/);
    return match ? match[1] : value;
  }

  function renderLessons() {
    lessonsEl.innerHTML = '';
    lessons.forEach((lesson, i) => {
      const details = document.createElement('details');
      details.className = 'accordion';
      details.innerHTML = `
        <summary class="row-between">
          <span>${escapeHtml(lesson.short_label ? lesson.short_label + ' · ' : '')}${escapeHtml(lesson.title)}</span>
          <span class="muted">${lesson.videos?.length || 0} відео</span>
        </summary>
        <div class="body">
          <div style="display:flex;gap:6px;margin-bottom:8px;">
            <button class="btn" data-action="up" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button class="btn" data-action="down" ${i === lessons.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="btn" data-action="delete" style="margin-left:auto;color:var(--danger);">Видалити урок</button>
          </div>

          <label class="field-label">Назва уроку</label>
          <input type="text" data-field="title" value="${escapeAttr(lesson.title)}" />

          <label class="field-label">Коротка мітка (номер у стрічці, напр. "7.1")</label>
          <input type="text" data-field="short_label" value="${escapeAttr(lesson.short_label || '')}" />

          <label class="field-label">Опис</label>
          <textarea data-field="description" rows="2">${escapeHtml(lesson.description || '')}</textarea>

          <label class="field-label">Домашнє завдання (тип файлу, необов'язково)</label>
          <select data-field="homework_type">
            <option value="">Без ДЗ</option>
            <option value="text">Текст</option>
            <option value="photo">Фото</option>
            <option value="video">Відео</option>
          </select>

          <label class="field-label">Текст завдання (що саме зробити — покаже учениці)</label>
          <textarea data-field="homework_description" rows="3" placeholder="Наприклад: зробіть корекцію брів на моделі, надішліть фото до і після">${escapeHtml(lesson.homework_description || '')}</textarea>

          <label class="field-label">Відео (YouTube ID або посилання — розпізнається саме)</label>
          <div data-role="video-list"></div>
          <div style="display:flex;gap:6px;margin-top:4px;">
            <input type="text" data-role="new-video" placeholder="напр. dQw4w9WgXcQ або посилання" style="flex:1;" />
            <button class="btn" data-action="add-video">+</button>
          </div>
        </div>
      `;

      const select = details.querySelector('[data-field="homework_type"]');
      select.value = lesson.homework_type || '';

      details.querySelectorAll('[data-field]').forEach((el) => {
        el.addEventListener('blur', async () => {
          const field = el.dataset.field;
          const value = field === 'homework_type' ? (el.value || null) : el.value;
          await supabase.from('lessons').update({ [field]: value }).eq('id', lesson.id);
        });
      });

      details.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        if (!confirm('Видалити урок разом з відео? Дію не можна скасувати.')) return;
        await supabase.from('lessons').delete().eq('id', lesson.id);
        load();
      });

      details.querySelector('[data-action="up"]')?.addEventListener('click', () => moveLesson(i, -1));
      details.querySelector('[data-action="down"]')?.addEventListener('click', () => moveLesson(i, 1));

      const videoListEl = details.querySelector('[data-role="video-list"]');
      (lesson.videos || []).forEach((v) => {
        const row = document.createElement('div');
        row.className = 'row-between';
        row.style.marginBottom = '4px';
        row.innerHTML = `<span style="font-size:12px;font-family:monospace;">${escapeHtml(v.youtube_id)}</span>`;
        const delBtn = document.createElement('button');
        delBtn.textContent = '✕';
        delBtn.style.color = 'var(--danger)';
        delBtn.style.fontSize = '11px';
        delBtn.addEventListener('click', async () => { await supabase.from('videos').delete().eq('id', v.id); load(); });
        row.appendChild(delBtn);
        videoListEl.appendChild(row);
      });

      details.querySelector('[data-action="add-video"]').addEventListener('click', async () => {
        const input = details.querySelector('[data-role="new-video"]');
        if (!input.value.trim()) return;
        await supabase.from('videos').insert({ lesson_id: lesson.id, youtube_id: extractYoutubeId(input.value), order_index: lesson.videos?.length || 0 });
        load();
      });

      lessonsEl.appendChild(details);
    });
  }

  async function moveLesson(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= lessons.length) return;
    const a = lessons[index];
    const b = lessons[target];
    await Promise.all([
      supabase.from('lessons').update({ order_index: b.order_index }).eq('id', a.id),
      supabase.from('lessons').update({ order_index: a.order_index }).eq('id', b.id),
    ]);
    load();
  }

  load();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}
