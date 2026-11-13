import { supabase } from '../supabaseClient.js?v=20261113-1';
import { requireAdmin, wireLogoutButton } from '../auth.js?v=20261113-1';
import { ADMIN_LESSON_SELECT, HOMEWORK_REQUIREMENTS, NEXT_LESSON_ACCESS_RULES, normalizeLesson } from '../models/lesson.js?v=20261113-1';
import { uploadCourseAsset } from '../course-assets.js?v=20261113-1';

const urlParams = new URLSearchParams(window.location.search);
const courseId = urlParams.get('course');
if (!courseId) window.location.href = 'admin-manage.html';

const authenticatedAdmin = await requireAdmin();
if (!authenticatedAdmin) throw new Error('not admin');
wireLogoutButton(document.getElementById('logout-btn'));

const elements = {
  courseTitle: document.getElementById('course-title'),
  courseShortLabel: document.getElementById('course-short-label'),
  preview: document.getElementById('preview-course'),
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
  lessonTitle: document.getElementById('lesson-title'),
  lessonShortLabel: document.getElementById('lesson-short-label'),
  lessonDescription: document.getElementById('lesson-description'),
  lessonParent: document.getElementById('lesson-parent'),
  addMaterialFile: document.getElementById('add-material-file'),
  videoList: document.getElementById('video-list'),
  newMaterial: document.getElementById('new-material'),
  homeworkEnabled: document.getElementById('homework-enabled'),
  homeworkSettings: document.getElementById('homework-settings'),
  homeworkDescription: document.getElementById('homework-description'),
  accessRule: document.getElementById('access-rule'),
  accessDelaySettings: document.getElementById('access-delay-settings'),
  accessScheduleSettings: document.getElementById('access-schedule-settings'),
  accessDelayHours: document.getElementById('access-delay-hours'),
  accessDelayDays: document.getElementById('access-delay-days'),
  accessUnlockTime: document.getElementById('access-unlock-time'),
  error: document.getElementById('editor-error'),
  assetFile: document.getElementById('course-asset-file'),
  coursePresentationFileName: document.getElementById('course-presentation-file-name'),
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
let pendingAssetTarget = null;

async function load({ keepSelection = true } = {}) {
  setSaveStatus('Завантаження…', 'saving');
  const [{ data: courseData, error: courseError }, { data: presentation }, { data: lessonRows, error: lessonsError }, { data: previewAccess }] = await Promise.all([
    supabase.from('courses').select('id, title, short_label').eq('id', courseId).single(),
    supabase.from('presentations').select('embed_url, file_key, file_name, file_content_type').eq('course_id', courseId).maybeSingle(),
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

  courseState = {
    ...courseData,
    presentationUrl: presentation?.embed_url || '',
    presentationFileKey: presentation?.file_key || '',
    presentationFileName: presentation?.file_name || '',
    presentationFileContentType: presentation?.file_content_type || '',
  };
  lessons = (lessonRows || []).map(normalizeLesson);
  if (!keepSelection || !lessons.some((lesson) => lesson.id === selectedLessonId)) selectedLessonId = lessons[0]?.id || null;

  elements.courseTitle.value = courseState.title;
  elements.courseShortLabel.value = courseState.short_label || '';
  renderCoursePresentationFile();
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
    const card = document.createElement('article');
    card.className = `admin-lesson-card${lesson.id === selectedLessonId ? ' active' : ''}${lesson.parent_lesson_id ? ' child' : ''}`;
    card.draggable = !query;
    card.dataset.lessonId = lesson.id;
    card.innerHTML = `
      <span class="admin-drag" title="Перетягнути">⠿</span>
      <div><h3>${escapeHtml(lesson.short_label ? `${lesson.short_label} · ${lesson.title}` : lesson.title)}</h3><p>${lesson.videos.length} відео · ${lesson.homework_enabled ? 'є ДЗ' : 'без ДЗ'}</p></div>
    `;
    card.addEventListener('click', () => selectLesson(lesson.id));
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

  elements.lessonTitle.value = lesson.title;
  elements.lessonShortLabel.value = lesson.short_label || '';
  autoSizeLabel();
  elements.lessonDescription.value = lesson.description || '';

  elements.lessonParent.innerHTML = '<option value="">Головний рівень</option>';
  for (const candidate of lessons.filter((item) => item.id !== lesson.id && item.parent_lesson_id !== lesson.id)) {
    const option = document.createElement('option');
    option.value = candidate.id;
    option.textContent = `${candidate.short_label ? `${candidate.short_label} · ` : ''}${candidate.title}`;
    elements.lessonParent.appendChild(option);
  }
  elements.lessonParent.value = lesson.parent_lesson_id || '';

  renderMaterials(lesson);
  elements.homeworkEnabled.checked = lesson.homework_enabled;
  elements.homeworkSettings.hidden = !lesson.homework_enabled;
  for (const [field, input] of homeworkRequirementInputs) input.checked = lesson[field];
  elements.homeworkDescription.value = lesson.homework_description || '';
  elements.accessRule.value = lesson.next_lesson_access_rule;
  elements.accessDelayHours.value = String(lesson.next_lesson_delay_hours);
  elements.accessDelayDays.value = String(lesson.next_lesson_delay_days);
  elements.accessUnlockTime.value = lesson.next_lesson_unlock_time;
  renderAccessTiming(lesson);
}

function renderCoursePresentationFile() {
  const hasFile = Boolean(courseState?.presentationFileKey);
  setCoursePresentationNote(hasFile ? `Презентація курсу: ${courseState.presentationFileName}` : '');
}

function setCoursePresentationNote(text) {
  elements.coursePresentationFileName.hidden = !text;
  elements.coursePresentationFileName.textContent = text;
}

function renderComparison() {
  elements.comparisonBody.innerHTML = '';
  if (!lessons.length) {
    elements.comparisonBody.innerHTML = '<div class="admin-empty-card">Додайте перший урок.</div>';
    return;
  }

  for (const lesson of lessons) {
    const card = document.createElement('article');
    card.className = 'admin-comparison-card';
    card.dataset.lessonId = lesson.id;
    card.innerHTML = `
      <div class="admin-comparison-section">
        <div class="admin-table-title">
          <input type="text" class="lesson-inline-label" data-table-field="short_label" placeholder="Мітка" aria-label="Мітка" value="${escapeAttribute(lesson.short_label || '')}" />
          <input type="text" class="lesson-inline-title" data-table-field="title" placeholder="Назва уроку" aria-label="Назва уроку" value="${escapeAttribute(lesson.title)}" />
        </div>
        <select data-table-field="parent_lesson_id" aria-label="Структура"></select>
        <textarea data-table-field="description" rows="5" placeholder="Опис уроку" aria-label="Опис уроку">${escapeHtml(lesson.description || '')}</textarea>
      </div>
      <div class="admin-comparison-section">
        <div class="admin-table-videos"></div>
        <div class="admin-table-add-video"><input type="text" data-table-new-material placeholder="Посилання на відео або презентацію, потім Enter" /><button class="admin-secondary admin-upload-icon" data-table-upload-material type="button" title="Прикріпити файл">📁</button></div>
      </div>
      <div class="admin-comparison-section">
        <div class="admin-table-subsection">
          <div class="admin-table-homework-row">
            <label class="admin-switch"><input data-table-homework-enabled type="checkbox" ${lesson.homework_enabled ? 'checked' : ''} /><span></span></label>
            <div class="admin-table-requirements">
              ${HOMEWORK_REQUIREMENTS.map(({ field, label }) => `<label><input data-require="${field}" type="checkbox" ${lesson[field] ? 'checked' : ''} ${lesson.homework_enabled ? '' : 'disabled'} /> ${label}</label>`).join('')}
            </div>
            <select class="admin-table-access-select" data-table-field="next_lesson_access_rule" aria-label="Доступ до наступного уроку">${NEXT_LESSON_ACCESS_RULES.map(({ value, label }) => `<option value="${value}" ${lesson.next_lesson_access_rule === value ? 'selected' : ''}>${label}</option>`).join('')}</select>
          </div>
          <textarea data-table-field="homework_description" rows="5" placeholder="Завдання: опишіть, що потрібно виконати" ${lesson.homework_enabled ? '' : 'disabled'}>${escapeHtml(lesson.homework_description || '')}</textarea>
          ${renderTableAccessTiming(lesson)}
        </div>
      </div>
    `;

    card.querySelectorAll('.admin-table-title .lesson-inline-label').forEach((input) => {
      autoSizeInline(input);
      input.addEventListener('input', () => autoSizeInline(input));
    });

    const parentSelect = card.querySelector('[data-table-field="parent_lesson_id"]');
    parentSelect.innerHTML = '<option value="">Головний рівень</option>';
    for (const candidate of lessons.filter((item) => item.id !== lesson.id && item.parent_lesson_id !== lesson.id)) {
      const option = document.createElement('option');
      option.value = candidate.id;
      option.textContent = `${candidate.short_label ? `${candidate.short_label} · ` : ''}${candidate.title}`;
      parentSelect.appendChild(option);
    }
    parentSelect.value = lesson.parent_lesson_id || '';

    const videosWrap = card.querySelector('.admin-table-videos');
    lesson.videos.forEach((video, index) => {
      const chip = document.createElement('span');
      chip.className = 'admin-video-chip';
      chip.textContent = `▶ ${video.title || `Відео ${index + 1}`}`;
      chip.title = video.youtube_id;
      videosWrap.appendChild(chip);
    });
    if (lesson.presentation_file_name || lesson.presentation_url) {
      const chip = document.createElement('span');
      chip.className = 'admin-video-chip';
      chip.textContent = `🗎 ${lesson.presentation_file_name || 'Презентація'}`;
      chip.title = lesson.presentation_url || lesson.presentation_file_name;
      videosWrap.appendChild(chip);
    }

    card.querySelectorAll('[data-table-field]').forEach((fieldEl) => {
      const field = fieldEl.dataset.tableField;
      const eventName = fieldEl.tagName === 'TEXTAREA' || fieldEl.tagName === 'INPUT' ? 'input' : 'change';
      fieldEl.addEventListener(eventName, () => {
        const value = field === 'parent_lesson_id' ? (fieldEl.value || null) : fieldEl.value;
        lesson[field] = value;
        if (field === 'title' || field === 'short_label') renderLessonList();
        if (field === 'next_lesson_access_rule') renderComparison();
        scheduleSave(`lesson-${lesson.id}-${field}`, () => supabase.from('lessons').update({ [field]: value }).eq('id', lesson.id));
      });
    });

    card.querySelectorAll('[data-table-access-number], [data-table-access-time]').forEach((fieldEl) => {
      fieldEl.addEventListener('change', () => {
        const field = fieldEl.dataset.tableAccessNumber || fieldEl.dataset.tableAccessTime;
        const value = fieldEl.dataset.tableAccessNumber ? Math.max(1, Number(fieldEl.value) || 1) : fieldEl.value;
        lesson[field] = value;
        fieldEl.value = String(value);
        runSave(() => supabase.from('lessons').update({ [field]: value }).eq('id', lesson.id));
      });
    });

    const homeworkToggle = card.querySelector('[data-table-homework-enabled]');
    homeworkToggle.addEventListener('change', () => {
      lesson.homework_enabled = homeworkToggle.checked;
      card.querySelectorAll('[data-require]').forEach((checkbox) => { checkbox.disabled = !homeworkToggle.checked; });
      card.querySelector('[data-table-field="homework_description"]').disabled = !homeworkToggle.checked;
      renderLessonList();
      runSave(() => supabase.from('lessons').update({ homework_enabled: lesson.homework_enabled }).eq('id', lesson.id));
    });

    card.querySelectorAll('[data-require]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        const field = checkbox.dataset.require;
        lesson[field] = checkbox.checked;
        runSave(() => supabase.from('lessons').update({ [field]: checkbox.checked }).eq('id', lesson.id));
      });
    });

    const addMaterialInput = card.querySelector('[data-table-new-material]');
    addMaterialInput.addEventListener('keydown', async (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const value = addMaterialInput.value.trim();
      if (!value) return;
      if (looksLikeYoutube(value)) await addVideoToLesson(lesson, addMaterialInput);
      else { await addPresentationLink(lesson, addMaterialInput); renderComparison(); }
    });
    card.querySelector('[data-table-upload-material]').addEventListener('click', () => chooseAsset({ assetType: 'lesson-material', lessonId: lesson.id }));

    elements.comparisonBody.appendChild(card);
  }
}

function renderTableAccessTiming(lesson) {
  if (lesson.next_lesson_access_rule === 'after_delay') {
    return `<label class="admin-table-timing">Через годин<input type="number" min="1" max="8760" data-table-access-number="next_lesson_delay_hours" value="${lesson.next_lesson_delay_hours}" /></label>`;
  }
  if (lesson.next_lesson_access_rule === 'scheduled') {
    return `<div class="admin-table-timing-grid"><label>Через днів<input type="number" min="1" max="365" data-table-access-number="next_lesson_delay_days" value="${lesson.next_lesson_delay_days}" /></label><label>О котрій<input type="time" data-table-access-time="next_lesson_unlock_time" value="${escapeAttribute(lesson.next_lesson_unlock_time)}" /></label></div>`;
  }
  return '';
}

// Відео й презентація живуть одним списком: поки нічого не прикріплено,
// порожніх полів не показуємо зовсім, лишається тільки рядок додавання.
function renderMaterials(lesson) {
  elements.videoList.innerHTML = '';

  lesson.videos.forEach((video, index) => {
    const row = document.createElement('article');
    row.className = 'admin-video-item';
    const isUploadedFile = video.source_type === 'r2';
    row.innerHTML = `
      ${isUploadedFile ? '<span class="admin-file-icon" aria-hidden="true">▶</span>' : `<img src="https://i.ytimg.com/vi/${encodeURIComponent(video.youtube_id)}/mqdefault.jpg" alt="" />`}
      <div><h4>${escapeHtml(video.title || `Відео ${index + 1}`)}</h4><p>${escapeHtml(isUploadedFile ? 'Завантажений файл' : video.youtube_id)}</p></div>
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
  // Презентація йде після відео: спершу те, що дивляться.
  renderPresentationRow(lesson);
}

function renderPresentationRow(lesson) {
  const name = lesson.presentation_file_name || lesson.presentation_url;
  if (!name) return;
  const row = document.createElement('article');
  row.className = 'admin-video-item';
  row.innerHTML = `
    <span class="admin-file-icon" aria-hidden="true">🗎</span>
    <div><h4>${escapeHtml(lesson.presentation_file_name || 'Презентація')}</h4><p>${escapeHtml(lesson.presentation_file_key ? 'Завантажений файл' : lesson.presentation_url)}</p></div>
    <div class="admin-video-actions"><button data-action="delete" class="danger" title="Прибрати">✕</button></div>
  `;
  row.querySelector('[data-action="delete"]').addEventListener('click', () => removePresentation(lesson));
  elements.videoList.appendChild(row);
}

async function removePresentation(lesson) {
  if (!confirm('Прибрати презентацію з цього уроку?')) return;
  const patch = { presentation_url: '', presentation_file_key: null, presentation_file_name: null, presentation_file_content_type: null };
  const { error } = await supabase.from('lessons').update(patch).eq('id', lesson.id);
  if (error) {
    showError('Не вдалося прибрати презентацію.');
    return;
  }
  Object.assign(lesson, patch);
  renderMaterials(lesson);
  renderComparison();
}

// Поле одне, тому воно само вирішує, що йому дали: посилання на YouTube
// стає відео, будь-яке інше посилання стає презентацією уроку.
function looksLikeYoutube(value) {
  return /(?:youtu\.be\/|youtube\.com\/)/.test(value) || /^[\w-]{11}$/.test(value);
}

async function addPresentationLink(lesson, input) {
  const value = input.value.trim();
  const { error } = await supabase.from('lessons').update({ presentation_url: value }).eq('id', lesson.id);
  if (error) {
    showError('Не вдалося зберегти посилання.');
    return;
  }
  lesson.presentation_url = value;
  input.value = '';
  renderMaterials(lesson);
  renderComparison();
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
  if (!elements.saveStatus) return;
  elements.saveStatus.textContent = text;
  elements.saveStatus.className = `admin-save-status${className ? ` ${className}` : ''}`;
}

elements.courseTitle.addEventListener('input', () => {
  const value = elements.courseTitle.value;
  courseState.title = value;
  scheduleSave('course-title', () => supabase.from('courses').update({ title: value.trim() || 'Без назви' }).eq('id', courseId));
});

elements.courseShortLabel.addEventListener('input', () => {
  const value = elements.courseShortLabel.value;
  courseState.short_label = value;
  scheduleSave('course-short-label', () => supabase.from('courses').update({ short_label: value.trim() }).eq('id', courseId));
});

// Мітка росте під свій текст, щоб назва уроку не наповзала на неї й не
// лишалось порожнього місця, коли мітка коротка.
const labelRuler = document.createElement('span');
labelRuler.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;';
document.body.appendChild(labelRuler);

function autoSizeInline(input) {
  const style = getComputedStyle(input);
  labelRuler.style.font = style.font;
  labelRuler.style.letterSpacing = style.letterSpacing;
  labelRuler.textContent = input.value || input.placeholder;
  input.style.width = `${labelRuler.offsetWidth + 11}px`;
}

function autoSizeLabel() {
  autoSizeInline(elements.lessonShortLabel);
}

function bindLessonText(element, field, { refreshTitles = false } = {}) {
  element.addEventListener('input', () => {
    const lesson = selectedLesson();
    if (!lesson) return;
    const lessonId = lesson.id;
    const value = element.value;
    lesson[field] = value;
    if (refreshTitles) {
      if (element === elements.lessonShortLabel) autoSizeLabel();
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

function renderAccessTiming(lesson) {
  elements.accessDelaySettings.hidden = lesson.next_lesson_access_rule !== 'after_delay';
  elements.accessScheduleSettings.hidden = lesson.next_lesson_access_rule !== 'scheduled';
}

elements.accessRule.addEventListener('change', () => {
  const lesson = selectedLesson();
  if (!lesson) return;
  lesson.next_lesson_access_rule = elements.accessRule.value;
  renderAccessTiming(lesson);
  renderComparison();
  runSave(() => supabase.from('lessons').update({ next_lesson_access_rule: lesson.next_lesson_access_rule }).eq('id', lesson.id));
});

function bindAccessNumber(element, field) {
  element.addEventListener('change', () => {
    const lesson = selectedLesson();
    if (!lesson) return;
    const value = Math.max(1, Number(element.value) || 1);
    element.value = String(value);
    lesson[field] = value;
    renderComparison();
    runSave(() => supabase.from('lessons').update({ [field]: value }).eq('id', lesson.id));
  });
}

bindAccessNumber(elements.accessDelayHours, 'next_lesson_delay_hours');
bindAccessNumber(elements.accessDelayDays, 'next_lesson_delay_days');
elements.accessUnlockTime.addEventListener('change', () => {
  const lesson = selectedLesson();
  if (!lesson) return;
  lesson.next_lesson_unlock_time = elements.accessUnlockTime.value || '09:00';
  renderComparison();
  runSave(() => supabase.from('lessons').update({ next_lesson_unlock_time: lesson.next_lesson_unlock_time }).eq('id', lesson.id));
});

async function createLesson() {
  await flushPending();
  setSaveStatus('Створюємо урок…', 'saving');
  const { data, error } = await supabase
    .from('lessons')
    .insert({
      course_id: courseId,
      title: 'Новий урок',
      short_label: '',
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

elements.newMaterial.addEventListener('keydown', async (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const lesson = selectedLesson();
  const value = elements.newMaterial.value.trim();
  if (!lesson || !value) return;
  if (looksLikeYoutube(value)) await addVideoToLesson(lesson, elements.newMaterial);
  else await addPresentationLink(lesson, elements.newMaterial);
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
  renderMaterials(lesson);
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

elements.singleMode.addEventListener('click', () => setEditorMode('single'));
elements.tableMode.addEventListener('click', () => setEditorMode('table'));
elements.toggleSidebar.addEventListener('click', () => {
  sidebarManuallyCollapsed = !elements.shell.classList.contains('sidebar-collapsed');
  localStorage.setItem('admin-sidebar-collapsed', sidebarManuallyCollapsed ? '1' : '0');
  applySidebarState();
});

const DOCUMENT_ACCEPT = '.pdf,.ppt,.pptx,.doc,.docx,application/pdf,application/msword,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function chooseAsset(target) {
  pendingAssetTarget = target;
  if (target.assetType === 'lesson-material') elements.assetFile.accept = `video/*,${DOCUMENT_ACCEPT}`;
  else elements.assetFile.accept = target.assetType === 'lesson-video' ? 'video/*' : DOCUMENT_ACCEPT;
  elements.assetFile.value = '';
  elements.assetFile.click();
}

async function uploadSelectedAsset(file) {
  const target = pendingAssetTarget;
  pendingAssetTarget = null;
  if (!target || !file) return;
  try {
    if (target.assetType === 'course-presentation') {
      setCoursePresentationNote(`Завантажуємо ${file.name}: 0%`);
    }
    const uploaded = await uploadCourseAsset({
      courseId,
      lessonId: target.lessonId,
      assetType: target.assetType,
      file,
      onProgress: (progress) => {
        const text = `Завантажуємо ${file.name}: ${Math.round(progress * 100)}%`;
        if (target.assetType === 'course-presentation') setCoursePresentationNote(text);
      },
    });

    if (target.assetType === 'course-presentation') {
      Object.assign(courseState, {
        presentationFileKey: uploaded.objectKey,
        presentationFileName: uploaded.fileName,
        presentationFileContentType: uploaded.contentType,
      });
      const { error } = await supabase.from('presentations').upsert({
        course_id: courseId,
        embed_url: courseState.presentationUrl,
        file_key: uploaded.objectKey,
        file_name: uploaded.fileName,
        file_content_type: uploaded.contentType,
      });
      if (error) throw error;
      renderCoursePresentationFile();
      setCoursePresentationNote(`Презентація курсу: ${uploaded.fileName}`);
      return;
    }

    const lesson = lessons.find((item) => item.id === target.lessonId);
    if (!lesson) throw new Error('Урок не знайдено.');
    if (target.assetType === 'lesson-presentation') {
      const patch = {
        presentation_file_key: uploaded.objectKey,
        presentation_file_name: uploaded.fileName,
        presentation_file_content_type: uploaded.contentType,
      };
      const { error } = await supabase.from('lessons').update(patch).eq('id', lesson.id);
      if (error) throw error;
      Object.assign(lesson, patch);
      renderMaterials(lesson);
      renderComparison();
      return;
    }

    const { error } = await supabase.from('videos').insert({
      lesson_id: lesson.id,
      youtube_id: '',
      title: uploaded.fileName,
      source_type: 'r2',
      file_key: uploaded.objectKey,
      file_name: uploaded.fileName,
      file_content_type: uploaded.contentType,
      order_index: lesson.videos.length,
    });
    if (error) throw error;
    await load();
  } catch (error) {
    console.error('course asset upload failed', error);
    if (target.assetType === 'course-presentation') setCoursePresentationNote(error.message || 'Не вдалося завантажити файл.');
    else showError(error.message || 'Не вдалося завантажити файл.');
  }
}

document.getElementById('choose-course-presentation').addEventListener('click', () => chooseAsset({ assetType: 'course-presentation', lessonId: null }));
elements.addMaterialFile.addEventListener('click', () => {
  const lesson = selectedLesson();
  if (lesson) chooseAsset({ assetType: 'lesson-material', lessonId: lesson.id });
});
elements.assetFile.addEventListener('change', () => {
  const file = elements.assetFile.files[0];
  // Відео — відео, усе інше вважаємо презентацією уроку.
  if (file && pendingAssetTarget?.assetType === 'lesson-material') {
    pendingAssetTarget.assetType = file.type.startsWith('video/') ? 'lesson-video' : 'lesson-presentation';
  }
  uploadSelectedAsset(file);
});

// Курс видаляється разом з усім, що на ньому висить, тому питаємо двічі:
// підтвердженням і введенням назви.
document.getElementById('delete-course').addEventListener('click', async () => {
  const title = courseState?.title || '';
  const typed = prompt(`Видалити курс «${title}» назавжди?\n\nЗникнуть усі уроки, відео, домашні завдання й доступи учениць.\n\nЩоб підтвердити, впишіть назву курсу:`);
  if (typed === null) return;
  if (typed.trim() !== title.trim()) {
    alert('Назва не збіглася. Курс лишився на місці.');
    return;
  }
  const { error } = await supabase.from('courses').delete().eq('id', courseId);
  if (error) {
    showError('Не вдалося видалити курс.');
    return;
  }
  window.location.href = 'admin-manage.html';
});
elements.lessonSearch.addEventListener('input', renderLessonList);
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
