import { supabase } from '../supabaseClient.js';
import { requireAdmin, wireLogoutButton } from '../auth.js';
import { ADMIN_LESSON_SELECT, HOMEWORK_REQUIREMENTS, normalizeLesson } from '../models/lesson.js';

const urlParams = new URLSearchParams(window.location.search);
const courseId = urlParams.get('course');
if (!courseId) window.location.href = 'admin-manage.html';

const authenticatedAdmin = await requireAdmin();
if (!authenticatedAdmin) throw new Error('not admin');
wireLogoutButton(document.getElementById('logout-btn'));

const elements = {
  courseTitle: document.getElementById('course-title'),
  saveStatus: document.getElementById('save-status'),
  preview: document.getElementById('preview-course'),
  done: document.getElementById('finish-editing'),
  shell: document.getElementById('admin-shell'),
  toggleSidebar: document.getElementById('toggle-sidebar'),
  singleMode: document.getElementById('single-mode'),
  tableMode: document.getElementById('table-mode'),
  singleView: document.getElementById('single-view'),
  tableView: document.getElementById('table-view'),
  comparisonBody: document.getElementById('comparison-body'),
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
  homeworkDescription: document.getElementById('homework-description'),
  error: document.getElementById('editor-error'),
  presentationFile: document.getElementById('course-presentation-file'),
  presentationNote: document.getElementById('presentation-note'),
  courseSettings: document.getElementById('course-settings'),
  courseSettingsToggle: document.getElementById('course-settings-toggle'),
  courseSettingsClose: document.getElementById('course-settings-close'),
};

const homeworkRequirementInputs = new Map(HOMEWORK_REQUIREMENTS.map(({ field }) => [
  field,
  document.getElementById(field.replaceAll('_', '-')),
]));

let courseState = null;
let lessons = [];
let selectedLessonId = urlParams.get('lesson');
let draggedLessonId = null;
let saveSequence = 0;
let editorMode = 'single';
let sidebarManuallyCollapsed = localStorage.getItem('admin-sidebar-collapsed') === '1';
const pendingSaves = new Map();

async function load({ keepSelection = true } = {}) {
  setSaveStatus('Завантаження…', 'saving');
  const [{ data: courseData, error: courseError }, { data: presentation }, { data: lessonRows, error: lessonsError }, { data: previewAccess }] = await Promise.all([
    supabase.from('courses').select('id, title').eq('id', courseId).single(),
    supabase.from('presentations').select('embed_url').eq('course_id', courseId).maybeSingle(),
    supabase
      .from('lessons')
      .select(ADMIN_LESSON_SELECT)
      .eq('course_id', courseId)
      .order('order_index'),
    supabase.from('course_access').select('student_id').eq('course_id', courseId).limit(1).maybeSingle(),
  ]);

  if (courseError || lessonsError || !courseData) {
    showError('Курс не знайдено або його не вдалося завантажити.');
    setSaveStatus('Помилка завантаження', 'error');
    return;
  }

  courseState = { ...courseData, presentationUrl: presentation?.embed_url || '' };
  lessons = (lessonRows || []).map(normalizeLesson);
  if (!keepSelection || !lessons.some((lesson) => lesson.id === selectedLessonId)) selectedLessonId = lessons[0]?.id || null;

  elements.courseTitle.value = courseState.title;
  elements.presentationUrl.value = courseState.presentationUrl;
  if (previewAccess?.student_id) {
    elements.preview.href = `course.html?course=${courseId}&student=${previewAccess.student_id}&admin=1`;
    elements.preview.classList.remove('disabled');
    elements.preview.removeAttribute('aria-disabled');
  }

  renderLessonList();
  renderEditor();
  renderComparison();
  applySidebarState();
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
      <div><h3>${escapeHtml(lesson.short_label ? `${lesson.short_label} · ${lesson.title}` : lesson.title)}</h3><p>${lesson.videos.length} відео · ${lesson.homework_enabled ? 'є ДЗ' : 'без ДЗ'}</p></div>
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

  elements.lessonParent.innerHTML = '<option value="">Головний рівень</option>';
  for (const candidate of lessons.filter((item) => item.id !== lesson.id && item.parent_lesson_id !== lesson.id)) {
    const option = document.createElement('option');
    option.value = candidate.id;
    option.textContent = `${candidate.short_label ? `${candidate.short_label} · ` : ''}${candidate.title}`;
    elements.lessonParent.appendChild(option);
  }
  elements.lessonParent.value = lesson.parent_lesson_id || '';

  renderVideos(lesson);
  elements.homeworkEnabled.checked = lesson.homework_enabled;
  elements.homeworkSettings.hidden = !lesson.homework_enabled;
  for (const [field, input] of homeworkRequirementInputs) input.checked = lesson[field];
  elements.homeworkDescription.value = lesson.homework_description || '';
}

function renderComparison() {
  elements.comparisonBody.innerHTML = '';
  if (!lessons.length) {
    elements.comparisonBody.innerHTML = '<tr><td colspan="3">Додайте перший урок.</td></tr>';
    return;
  }

  for (const lesson of lessons) {
    const row = document.createElement('tr');
    row.dataset.lessonId = lesson.id;
    row.innerHTML = `
      <td data-table-column="main">
        <div class="admin-table-main-grid">
          <label>Мітка<input type="text" data-table-field="short_label" value="${escapeAttribute(lesson.short_label || '')}" /></label>
          <label>Назва<input type="text" data-table-field="title" value="${escapeAttribute(lesson.title)}" /></label>
        </div>
        <label>Структура<select data-table-field="parent_lesson_id"></select></label>
        <label>Опис<textarea data-table-field="description" rows="2">${escapeHtml(lesson.description || '')}</textarea></label>
      </td>
      <td data-table-column="materials">
        <div class="admin-table-videos"></div>
        <div class="admin-table-add-video"><input type="text" data-table-new-video placeholder="YouTube-посилання" /><button type="button">＋</button></div>
        <div class="admin-table-presentation">▧ Презентація уроку: не додана</div>
      </td>
      <td data-table-column="homework-access">
        <div data-table-subsection="homework" class="admin-table-subsection">
          <label class="admin-table-check"><input data-table-homework-enabled type="checkbox" ${lesson.homework_enabled ? 'checked' : ''} /> Є ДЗ</label>
          <div class="admin-table-requirements">
            ${HOMEWORK_REQUIREMENTS.map(({ field, label }) => `<label><input data-require="${field}" type="checkbox" ${lesson[field] ? 'checked' : ''} ${lesson.homework_enabled ? '' : 'disabled'} /> ${label}</label>`).join('')}
          </div>
          <textarea data-table-field="homework_description" rows="2" placeholder="Текст завдання" ${lesson.homework_enabled ? '' : 'disabled'}>${escapeHtml(lesson.homework_description || '')}</textarea>
        </div>
        <div data-table-subsection="access" class="admin-table-subsection">
          <label>Доступ<select disabled><option>Вільний доступ</option><option>Після здачі ДЗ</option><option>Після перевірки</option></select></label>
        </div>
      </td>
    `;

    const parentSelect = row.querySelector('[data-table-field="parent_lesson_id"]');
    parentSelect.innerHTML = '<option value="">Головний рівень</option>';
    for (const candidate of lessons.filter((item) => item.id !== lesson.id && item.parent_lesson_id !== lesson.id)) {
      const option = document.createElement('option');
      option.value = candidate.id;
      option.textContent = `${candidate.short_label ? `${candidate.short_label} · ` : ''}${candidate.title}`;
      parentSelect.appendChild(option);
    }
    parentSelect.value = lesson.parent_lesson_id || '';

    const videosWrap = row.querySelector('.admin-table-videos');
    if (!lesson.videos.length) videosWrap.innerHTML = '<span class="admin-table-empty">Без відео</span>';
    lesson.videos.forEach((video, index) => {
      const chip = document.createElement('span');
      chip.className = 'admin-video-chip';
      chip.textContent = `▶ ${video.title || `Відео ${index + 1}`}`;
      chip.title = video.youtube_id;
      videosWrap.appendChild(chip);
    });

    row.querySelectorAll('[data-table-field]').forEach((fieldEl) => {
      const field = fieldEl.dataset.tableField;
      const eventName = fieldEl.tagName === 'TEXTAREA' || fieldEl.tagName === 'INPUT' ? 'input' : 'change';
      fieldEl.addEventListener(eventName, () => {
        const value = field === 'parent_lesson_id' ? (fieldEl.value || null) : fieldEl.value;
        lesson[field] = value;
        if (field === 'title' || field === 'short_label') {
          renderLessonList();
        }
        scheduleSave(`lesson-${lesson.id}-${field}`, () => supabase.from('lessons').update({ [field]: value }).eq('id', lesson.id));
      });
    });

    const homeworkToggle = row.querySelector('[data-table-homework-enabled]');
    homeworkToggle.addEventListener('change', () => {
      lesson.homework_enabled = homeworkToggle.checked;
      row.querySelectorAll('[data-require]').forEach((checkbox) => { checkbox.disabled = !homeworkToggle.checked; });
      row.querySelector('[data-table-field="homework_description"]').disabled = !homeworkToggle.checked;
      renderLessonList();
      runSave(() => supabase.from('lessons').update({ homework_enabled: lesson.homework_enabled }).eq('id', lesson.id));
    });

    row.querySelectorAll('[data-require]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        const field = checkbox.dataset.require;
        lesson[field] = checkbox.checked;
        runSave(() => supabase.from('lessons').update({ [field]: checkbox.checked }).eq('id', lesson.id));
      });
    });

    const addVideoButton = row.querySelector('.admin-table-add-video button');
    const addVideoInput = row.querySelector('[data-table-new-video]');
    addVideoButton.addEventListener('click', () => addVideoToLesson(lesson, addVideoInput));
    addVideoInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); addVideoToLesson(lesson, addVideoInput); }
    });

    elements.comparisonBody.appendChild(row);
  }
  applyColumnFilter(document.querySelector('.admin-column-filters .active')?.dataset.filter || 'all');
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
  const currentSave = ++saveSequence;
  setSaveStatus('Зберігаємо…', 'saving');
  try {
    const result = await task();
    if (result?.error) throw result.error;
    if (currentSave === saveSequence && pendingSaves.size === 0) setSaveStatus('Збережено');
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
  courseState.title = value;
  scheduleSave('course-title', () => supabase.from('courses').update({ title: value.trim() || 'Без назви' }).eq('id', courseId));
});

elements.presentationUrl.addEventListener('input', () => {
  const value = elements.presentationUrl.value.trim();
  courseState.presentationUrl = value;
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
  renderComparison();
  runSave(() => supabase.from('lessons').update({ parent_lesson_id: lesson.parent_lesson_id }).eq('id', lesson.id));
});

elements.homeworkEnabled.addEventListener('change', () => {
  const lesson = selectedLesson();
  if (!lesson) return;
  lesson.homework_enabled = elements.homeworkEnabled.checked;
  elements.homeworkSettings.hidden = !lesson.homework_enabled;
  renderLessonList();
  renderComparison();
  runSave(() => supabase.from('lessons').update({ homework_enabled: lesson.homework_enabled }).eq('id', lesson.id));
});

homeworkRequirementInputs.forEach((checkbox, field) => checkbox.addEventListener('change', () => {
  const lesson = selectedLesson();
  if (!lesson) return;
  lesson[field] = checkbox.checked;
  renderComparison();
  runSave(() => supabase.from('lessons').update({ [field]: checkbox.checked }).eq('id', lesson.id));
}));

async function createLesson() {
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
}

document.getElementById('add-lesson').addEventListener('click', createLesson);
document.getElementById('add-lesson-table').addEventListener('click', createLesson);

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
  renderComparison();
  await runSave(async () => {
    const results = await Promise.all(lessons.map((lesson) =>
      supabase.from('lessons').update({ order_index: lesson.order_index }).eq('id', lesson.id)
    ));
    return { error: results.find((result) => result.error)?.error || null };
  });
}

document.getElementById('add-video').addEventListener('click', async () => {
  const lesson = selectedLesson();
  if (!lesson) return;
  await addVideoToLesson(lesson, elements.newVideo);
});

async function addVideoToLesson(lesson, input) {
  const youtubeId = extractYoutubeId(input.value);
  if (!youtubeId) return;
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
  input.value = '';
  await load();
}

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

function setEditorMode(mode) {
  editorMode = mode;
  const isTable = mode === 'table';
  elements.singleView.hidden = isTable;
  elements.tableView.hidden = !isTable;
  elements.singleMode.classList.toggle('active', !isTable);
  elements.tableMode.classList.toggle('active', isTable);
  elements.shell.classList.toggle('table-mode', isTable);
  if (isTable) renderComparison();
  else {
    renderLessonList();
    renderEditor();
  }
  applySidebarState();
}

function applySidebarState() {
  const collapsed = editorMode === 'table' || sidebarManuallyCollapsed;
  elements.shell.classList.toggle('sidebar-collapsed', collapsed);
  elements.toggleSidebar.setAttribute('aria-label', collapsed ? 'Розгорнути головне меню' : 'Згорнути головне меню');
  elements.toggleSidebar.title = collapsed ? 'Розгорнути меню' : 'Згорнути меню';
}

function applyColumnFilter(filter) {
  document.querySelector('.admin-comparison-table').dataset.activeFilter = filter;
  document.querySelectorAll('.admin-column-filters [data-filter]').forEach((button) => button.classList.toggle('active', button.dataset.filter === filter));
  document.querySelectorAll('[data-table-column]').forEach((cell) => {
    const group = cell.dataset.tableColumn;
    const visible = filter === 'all' || group === filter || (group === 'homework-access' && (filter === 'homework' || filter === 'access'));
    cell.hidden = !visible;
  });
  document.querySelectorAll('[data-table-subsection]').forEach((section) => {
    section.hidden = (filter === 'homework' || filter === 'access') && section.dataset.tableSubsection !== filter;
  });
}

elements.singleMode.addEventListener('click', () => setEditorMode('single'));
elements.tableMode.addEventListener('click', () => setEditorMode('table'));
elements.toggleSidebar.addEventListener('click', () => {
  sidebarManuallyCollapsed = !elements.shell.classList.contains('sidebar-collapsed');
  localStorage.setItem('admin-sidebar-collapsed', sidebarManuallyCollapsed ? '1' : '0');
  applySidebarState();
});
document.querySelectorAll('.admin-column-filters [data-filter]').forEach((button) => button.addEventListener('click', () => applyColumnFilter(button.dataset.filter)));

document.getElementById('choose-course-presentation').addEventListener('click', () => elements.presentationFile.click());
elements.courseSettingsToggle.addEventListener('click', () => elements.courseSettings.showModal());
elements.courseSettingsClose.addEventListener('click', () => elements.courseSettings.close());
elements.courseSettings.addEventListener('click', (event) => {
  if (event.target === elements.courseSettings) elements.courseSettings.close();
});
elements.presentationFile.addEventListener('change', () => {
  const file = elements.presentationFile.files[0];
  if (!file) return;
  elements.presentationNote.textContent = `${file.name} · завантаження підключимо наступним кроком`;
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

function escapeAttribute(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

load();
