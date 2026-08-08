import { supabase } from '../supabaseClient.js';
import { requireAdmin, wireLogoutButton } from '../auth.js';

const params = new URLSearchParams(window.location.search);
const courseId = params.get('course');
if (!courseId) window.location.href = 'admin-manage.html';

const auth = await requireAdmin();
if (!auth) throw new Error('not admin');
wireLogoutButton(document.getElementById('logout-btn'));

const elements = {
  courseTitle: document.getElementById('course-title'),
  breadcrumb: document.getElementById('course-breadcrumb'),
  saveStatus: document.getElementById('save-status'),
  preview: document.getElementById('preview-course'),
  done: document.querySelector('.admin-header-actions .admin-primary'),
  lessonSearch: document.getElementById('lesson-search'),
  lessonsList: document.getElementById('lessons-list'),
  lessonsCount: document.getElementById('lessons-count'),
  editorEmpty: document.getElementById('editor-empty'),
  editorContent: document.getElementById('editor-content'),
  editorTitle: document.getElementById('editor-title'),
  editorShortLabel: document.getElementById('editor-short-label'),
  lessonTitle: document.getElementById('lesson-title'),
  lessonShortLabel: document.getElementById('lesson-short-label'),
  lessonDescription: document.getElementById('lesson-description'),
  lessonParent: document.getElementById('lesson-parent'),
  presentationUrl: document.getElementById('presentation-url'),
  videoCount: document.getElementById('video-count'),
  videoList: document.getElementById('video-list'),
  newVideo: document.getElementById('new-video'),
  homeworkEnabled: document.getElementById('homework-enabled'),
  homeworkSettings: document.getElementById('homework-settings'),
  homeworkType: document.getElementById('homework-type'),
  homeworkDescription: document.getElementById('homework-description'),
  error: document.getElementById('editor-error'),
};

let course = null;
let lessons = [];
let selectedLessonId = params.get('lesson');
let draggedLessonId = null;
let savingCounter = 0;
const pendingSaves = new Map();

async function load({ keepSelection = true } = {}) {
  setSaveStatus('Завантаження…', 'saving');
  const [{ data: courseData, error }, { data: presentation }, { data: lessonRows }, { data: previewAccess }] = await Promise.all([
    supabase.from('courses').select('id, title').eq('id', courseId).single(),
    supabase.from('presentations').select('embed_url').eq('course_id', courseId).maybeSingle(),
    supabase
      .from('lessons')
      .select('id, title, short_label, description, homework_type, homework_description, parent_lesson_id, order_index, videos(id, youtube_id, title, order_index)')
      .eq('course_id', courseId)
      .order('order_index'),
    supabase.from('course_access').select('student_id').eq('course_id', courseId).limit(1).maybeSingle(),
  ]);

  if (error || !courseData) {
    showError('Курс не знайдено або його не вдалося завантажити.');
    setSaveStatus('Помилка завантаження', 'error');
    return;
  }

  course = courseData;
  course.presentationUrl = presentation?.embed_url || '';
  lessons = (lessonRows || []).map((lesson) => ({
    ...lesson,
    videos: [...(lesson.videos || [])].sort((a, b) => a.order_index - b.order_index),
  }));
  if (!keepSelection || !lessons.some((lesson) => lesson.id === selectedLessonId)) selectedLessonId = lessons[0]?.id || null;

  elements.courseTitle.value = course.title;
  elements.breadcrumb.textContent = course.title;
  elements.presentationUrl.value = course.presentationUrl;
  if (previewAccess?.student_id) {
    elements.preview.href = `course.html?course=${courseId}&student=${previewAccess.student_id}&admin=1`;
    elements.preview.classList.remove('disabled');
    elements.preview.removeAttribute('aria-disabled');
  }

  renderLessonList();
  renderEditor();
  setSaveStatus('Збережено');
}

function renderLessonList() {
  const query = elements.lessonSearch.value.trim().toLocaleLowerCase('uk');
  const filtered = lessons.filter((lesson) => `${lesson.short_label || ''} ${lesson.title}`.toLocaleLowerCase('uk').includes(query));
  elements.lessonsCount.textContent = String(lessons.length);
  elements.lessonsList.innerHTML = '';

  if (!filtered.length) {
    elements.lessonsList.innerHTML = `<div class="admin-empty-card">${query ? 'Уроків не знайдено.' : 'Додайте перший урок.'}</div>`;
    return;
  }

  for (const lesson of filtered) {
    const actualIndex = lessons.findIndex((item) => item.id === lesson.id);
    const card = document.createElement('article');
    card.className = `admin-lesson-card${lesson.id === selectedLessonId ? ' active' : ''}${lesson.parent_lesson_id ? ' child' : ''}`;
    card.draggable = !query;
    card.dataset.lessonId = lesson.id;
    card.innerHTML = `
      <span class="admin-drag" title="Перетягнути">⠿</span>
      <div><h3>${escapeHtml(lesson.short_label ? `${lesson.short_label} · ${lesson.title}` : lesson.title)}</h3><p>${lesson.videos.length} відео · ${lesson.homework_type ? 'є ДЗ' : 'без ДЗ'}</p></div>
      <span class="admin-move-controls">
        <button data-move="up" title="Вище" ${actualIndex === 0 ? 'disabled' : ''}>↑</button>
        <button data-move="down" title="Нижче" ${actualIndex === lessons.length - 1 ? 'disabled' : ''}>↓</button>
      </span>
    `;
    card.addEventListener('click', () => selectLesson(lesson.id));
    card.querySelectorAll('[data-move]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        moveLesson(actualIndex, button.dataset.move === 'up' ? -1 : 1);
      });
    });
    card.addEventListener('dragstart', () => { draggedLessonId = lesson.id; card.style.opacity = '.45'; });
    card.addEventListener('dragend', () => { draggedLessonId = null; card.style.opacity = ''; });
    card.addEventListener('dragover', (event) => { if (draggedLessonId && draggedLessonId !== lesson.id) event.preventDefault(); });
    card.addEventListener('drop', (event) => {
      event.preventDefault();
      if (draggedLessonId && draggedLessonId !== lesson.id) reorderLesson(draggedLessonId, lesson.id);
    });
    elements.lessonsList.appendChild(card);
  }
}

function renderEditor() {
  const lesson = selectedLesson();
  elements.editorEmpty.hidden = Boolean(lesson);
  elements.editorContent.hidden = !lesson;
  if (!lesson) return;

  elements.editorTitle.textContent = lesson.title;
  elements.editorShortLabel.textContent = lesson.short_label || 'Урок';
  elements.lessonTitle.value = lesson.title;
  elements.lessonShortLabel.value = lesson.short_label || '';
  elements.lessonDescription.value = lesson.description || '';

  elements.lessonParent.innerHTML = '<option value="">Немає — основний рівень</option>';
  for (const candidate of lessons.filter((item) => item.id !== lesson.id && item.parent_lesson_id !== lesson.id)) {
    const option = document.createElement('option');
    option.value = candidate.id;
    option.textContent = `${candidate.short_label ? `${candidate.short_label} · ` : ''}${candidate.title}`;
    elements.lessonParent.appendChild(option);
  }
  elements.lessonParent.value = lesson.parent_lesson_id || '';

  renderVideos(lesson);
  elements.homeworkEnabled.checked = Boolean(lesson.homework_type);
  elements.homeworkSettings.hidden = !lesson.homework_type;
  elements.homeworkType.value = lesson.homework_type || 'text';
  elements.homeworkDescription.value = lesson.homework_description || '';
}

function renderVideos(lesson) {
  elements.videoCount.textContent = `${lesson.videos.length}`;
  elements.videoList.innerHTML = '';
  if (!lesson.videos.length) {
    elements.videoList.innerHTML = '<div class="admin-empty-card">Відео ще не додано.</div>';
    return;
  }

  lesson.videos.forEach((video, index) => {
    const row = document.createElement('article');
    row.className = 'admin-video-item';
    row.innerHTML = `
      <img src="https://i.ytimg.com/vi/${encodeURIComponent(video.youtube_id)}/mqdefault.jpg" alt="" />
      <div><h4>${escapeHtml(video.title || `Відео ${index + 1}`)}</h4><p>${escapeHtml(video.youtube_id)}</p></div>
      <div class="admin-video-actions">
        <button data-action="up" title="Вище" ${index === 0 ? 'disabled' : ''}>↑</button>
        <button data-action="down" title="Нижче" ${index === lesson.videos.length - 1 ? 'disabled' : ''}>↓</button>
        <button data-action="delete" class="danger" title="Видалити">✕</button>
      </div>
    `;
    row.querySelector('[data-action="up"]').addEventListener('click', () => moveVideo(index, -1));
    row.querySelector('[data-action="down"]').addEventListener('click', () => moveVideo(index, 1));
    row.querySelector('[data-action="delete"]').addEventListener('click', () => deleteVideo(video.id));
    elements.videoList.appendChild(row);
  });
}

function selectLesson(lessonId) {
  selectedLessonId = lessonId;
  const nextParams = new URLSearchParams(window.location.search);
  nextParams.set('lesson', lessonId);
  history.replaceState(null, '', `${window.location.pathname}?${nextParams}`);
  renderLessonList();
  renderEditor();
}

function selectedLesson() {
  return lessons.find((lesson) => lesson.id === selectedLessonId) || null;
}

function scheduleSave(key, task) {
  const existing = pendingSaves.get(key);
  if (existing?.timer) clearTimeout(existing.timer);
  const entry = { task, timer: null };
  entry.timer = setTimeout(() => executePending(key), 550);
  pendingSaves.set(key, entry);
  setSaveStatus('Є незбережені зміни', 'saving');
}

async function executePending(key) {
  const entry = pendingSaves.get(key);
  if (!entry) return;
  clearTimeout(entry.timer);
  pendingSaves.delete(key);
  await runSave(entry.task);
}

async function flushPending() {
  const entries = [...pendingSaves.entries()];
  pendingSaves.clear();
  for (const [, entry] of entries) clearTimeout(entry.timer);
  await Promise.all(entries.map(([, entry]) => runSave(entry.task)));
}

async function runSave(task) {
  const currentSave = ++savingCounter;
  setSaveStatus('Зберігаємо…', 'saving');
  try {
    const result = await task();
    if (result?.error) throw result.error;
    if (currentSave === savingCounter && pendingSaves.size === 0) setSaveStatus('Збережено');
  } catch (error) {
    console.error('admin save failed', error);
    showError('Не вдалося зберегти зміни. Перевірте інтернет і спробуйте ще раз.');
    setSaveStatus('Не збережено', 'error');
  }
}

function setSaveStatus(text, className = '') {
  elements.saveStatus.textContent = text;
  elements.saveStatus.className = `admin-save-status${className ? ` ${className}` : ''}`;
}

elements.courseTitle.addEventListener('input', () => {
  const value = elements.courseTitle.value;
  course.title = value;
  elements.breadcrumb.textContent = value || 'Без назви';
  scheduleSave('course-title', () => supabase.from('courses').update({ title: value.trim() || 'Без назви' }).eq('id', courseId));
});

elements.presentationUrl.addEventListener('input', () => {
  const value = elements.presentationUrl.value.trim();
  course.presentationUrl = value;
  scheduleSave('course-presentation', () => value
    ? supabase.from('presentations').upsert({ course_id: courseId, embed_url: value })
    : supabase.from('presentations').delete().eq('course_id', courseId));
});

function bindLessonText(element, field, { refreshTitles = false } = {}) {
  element.addEventListener('input', () => {
    const lesson = selectedLesson();
    if (!lesson) return;
    const lessonId = lesson.id;
    const value = element.value;
    lesson[field] = value;
    if (refreshTitles) {
      elements.editorTitle.textContent = lesson.title || 'Без назви';
      elements.editorShortLabel.textContent = lesson.short_label || 'Урок';
      renderLessonList();
    }
    scheduleSave(`lesson-${lessonId}-${field}`, () => supabase.from('lessons').update({ [field]: value }).eq('id', lessonId));
  });
}

bindLessonText(elements.lessonTitle, 'title', { refreshTitles: true });
bindLessonText(elements.lessonShortLabel, 'short_label', { refreshTitles: true });
bindLessonText(elements.lessonDescription, 'description');
bindLessonText(elements.homeworkDescription, 'homework_description');

elements.lessonParent.addEventListener('change', () => {
  const lesson = selectedLesson();
  if (!lesson) return;
  lesson.parent_lesson_id = elements.lessonParent.value || null;
  renderLessonList();
  runSave(() => supabase.from('lessons').update({ parent_lesson_id: lesson.parent_lesson_id }).eq('id', lesson.id));
});

elements.homeworkEnabled.addEventListener('change', () => {
  const lesson = selectedLesson();
  if (!lesson) return;
  lesson.homework_type = elements.homeworkEnabled.checked ? (elements.homeworkType.value || 'text') : null;
  elements.homeworkSettings.hidden = !lesson.homework_type;
  renderLessonList();
  runSave(() => supabase.from('lessons').update({ homework_type: lesson.homework_type }).eq('id', lesson.id));
});

elements.homeworkType.addEventListener('change', () => {
  const lesson = selectedLesson();
  if (!lesson) return;
  lesson.homework_type = elements.homeworkType.value;
  renderLessonList();
  runSave(() => supabase.from('lessons').update({ homework_type: lesson.homework_type }).eq('id', lesson.id));
});

document.getElementById('add-lesson').addEventListener('click', async () => {
  await flushPending();
  setSaveStatus('Створюємо урок…', 'saving');
  const { data, error } = await supabase
    .from('lessons')
    .insert({
      course_id: courseId,
      title: 'Новий урок',
      short_label: String(lessons.length + 1),
      order_index: lessons.length,
    })
    .select('id')
    .single();
  if (error) {
    showError('Не вдалося створити урок.');
    setSaveStatus('Не збережено', 'error');
    return;
  }
  selectedLessonId = data.id;
  await load();
});

document.getElementById('delete-lesson').addEventListener('click', async () => {
  const lesson = selectedLesson();
  if (!lesson) return;
  const childCount = lessons.filter((item) => item.parent_lesson_id === lesson.id).length;
  const childWarning = childCount ? ` Разом із ним буде видалено вкладені уроки: ${childCount}.` : '';
  if (!confirm(`Видалити урок «${lesson.title}» разом із його відео?${childWarning} Дію не можна скасувати.`)) return;
  await flushPending();
  const currentIndex = lessons.findIndex((item) => item.id === lesson.id);
  const { error } = await supabase.from('lessons').delete().eq('id', lesson.id);
  if (error) {
    showError('Не вдалося видалити урок.');
    return;
  }
  selectedLessonId = lessons[currentIndex + 1]?.id || lessons[currentIndex - 1]?.id || null;
  await load();
});

async function moveLesson(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= lessons.length) return;
  await flushPending();
  const next = [...lessons];
  [next[index], next[target]] = [next[target], next[index]];
  await persistLessonOrder(next);
}

async function reorderLesson(sourceId, targetId) {
  const sourceIndex = lessons.findIndex((lesson) => lesson.id === sourceId);
  const targetIndex = lessons.findIndex((lesson) => lesson.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  await flushPending();
  const next = [...lessons];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  await persistLessonOrder(next);
}

async function persistLessonOrder(next) {
  lessons = next.map((lesson, index) => ({ ...lesson, order_index: index }));
  renderLessonList();
  await runSave(async () => {
    const results = await Promise.all(lessons.map((lesson) =>
      supabase.from('lessons').update({ order_index: lesson.order_index }).eq('id', lesson.id)
    ));
    return { error: results.find((result) => result.error)?.error || null };
  });
}

document.getElementById('add-video').addEventListener('click', async () => {
  const lesson = selectedLesson();
  const youtubeId = extractYoutubeId(elements.newVideo.value);
  if (!lesson || !youtubeId) return;
  if (!/^[\w-]{11}$/.test(youtubeId)) {
    showError('Не вдалося розпізнати YouTube-посилання. Вставте повне посилання або ID з 11 символів.');
    return;
  }
  const { error } = await supabase.from('videos').insert({
    lesson_id: lesson.id,
    youtube_id: youtubeId,
    title: `Відео ${lesson.videos.length + 1}`,
    order_index: lesson.videos.length,
  });
  if (error) {
    showError('Не вдалося додати відео.');
    return;
  }
  elements.newVideo.value = '';
  await load();
});

elements.newVideo.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    document.getElementById('add-video').click();
  }
});

async function deleteVideo(videoId) {
  if (!confirm('Видалити це відео з уроку?')) return;
  const { error } = await supabase.from('videos').delete().eq('id', videoId);
  if (error) showError('Не вдалося видалити відео.');
  else await load();
}

async function moveVideo(index, direction) {
  const lesson = selectedLesson();
  const target = index + direction;
  if (!lesson || target < 0 || target >= lesson.videos.length) return;
  const videos = [...lesson.videos];
  [videos[index], videos[target]] = [videos[target], videos[index]];
  videos.forEach((video, orderIndex) => { video.order_index = orderIndex; });
  lesson.videos = videos;
  renderVideos(lesson);
  await runSave(async () => {
    const results = await Promise.all(videos.map((video) =>
      supabase.from('videos').update({ order_index: video.order_index }).eq('id', video.id)
    ));
    return { error: results.find((result) => result.error)?.error || null };
  });
}

document.querySelectorAll('.admin-tabs [data-tab]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.admin-tabs [data-tab]').forEach((item) => item.classList.toggle('active', item === button));
    document.querySelectorAll('.admin-tab-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === button.dataset.tab));
  });
});

elements.lessonSearch.addEventListener('input', renderLessonList);
elements.done.addEventListener('click', async (event) => {
  event.preventDefault();
  await flushPending();
  window.location.href = elements.done.href;
});
elements.preview.addEventListener('click', async (event) => {
  event.preventDefault();
  if (elements.preview.classList.contains('disabled')) return;
  await flushPending();
  window.location.href = elements.preview.href;
});

window.addEventListener('beforeunload', (event) => {
  if (!pendingSaves.size) return;
  event.preventDefault();
  event.returnValue = '';
});

function extractYoutubeId(input) {
  const value = input.trim();
  const match = value.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|shorts\/|watch\?(?:[^#]*&)?v=))([\w-]{11})/);
  return match ? match[1] : value;
}

function showError(message) {
  elements.error.textContent = message;
  elements.error.hidden = false;
  clearTimeout(showError.timer);
  showError.timer = setTimeout(() => { elements.error.hidden = true; }, 6000);
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value || '';
  return div.innerHTML;
}

load();
