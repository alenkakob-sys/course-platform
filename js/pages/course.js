import { supabase } from '../supabaseClient.js';
import { requireAuth } from '../auth.js';
import { mountChatPanel } from '../components/chat-panel.js';
import { mountHomeworkField } from '../components/homework-field.js?v=20260810-4';
import { STUDENT_LESSON_SELECT, normalizeLesson } from '../models/lesson.js';
import { getCourseAssetUrl, openCourseAsset } from '../course-assets.js';

const urlParams = new URLSearchParams(window.location.search);
const courseId = urlParams.get('course');
const isAdminView = urlParams.get('admin') === '1';
const requestedLessonId = urlParams.get('lesson');

const authenticatedUser = await requireAuth();
if (!authenticatedUser) throw new Error('not authenticated');

if (isAdminView && authenticatedUser.profile.role !== 'admin') {
  window.location.href = 'courses.html';
  throw new Error('not admin');
}

const studentId = isAdminView ? urlParams.get('student') : authenticatedUser.profile.id;

document.getElementById('back-link').href = isAdminView ? 'admin.html' : 'courses.html';

const [{ data: courseRecord, error: courseError }, { data: coursePresentation }, { data: lessonRows, error: lessonsError }, studentProfile] = await Promise.all([
  supabase.from('courses').select('id, title').eq('id', courseId).single(),
  supabase.from('presentations').select('embed_url, file_key, file_name').eq('course_id', courseId).maybeSingle(),
  supabase.from('lessons').select(STUDENT_LESSON_SELECT).eq('course_id', courseId).order('order_index'),
  isAdminView ? supabase.from('profiles').select('full_name, email').eq('id', studentId).single().then((r) => r.data) : null,
]);

if (courseError || lessonsError || !courseRecord) throw new Error('Course data could not be loaded');

document.getElementById('course-title').textContent = courseRecord.title;
if (isAdminView && studentProfile) {
  const studentContext = document.getElementById('student-context');
  studentContext.textContent = `Перегляд: ${studentProfile.full_name || studentProfile.email}`;
  studentContext.style.display = 'block';
}

if (coursePresentation?.embed_url || coursePresentation?.file_key) {
  document.getElementById('presentation-block').hidden = false;
  wirePresentationLinks({
    link: document.getElementById('presentation-link'),
    downloadButton: document.getElementById('presentation-download'),
    url: coursePresentation.embed_url,
    fileKey: coursePresentation.file_key,
    fileName: coursePresentation.file_name,
  });
}

const lessonList = (lessonRows || []).map(normalizeLesson);
let lessonProgress = new Map();
const { data: progressRows } = lessonList.length
  ? await supabase.from('lesson_progress').select('lesson_id, first_opened_at, homework_submitted_at, homework_review_status').eq('student_id', studentId).in('lesson_id', lessonList.map((lesson) => lesson.id))
  : { data: [] };
lessonProgress = new Map((progressRows || []).map((row) => [row.lesson_id, row]));

let selectedLessonId = lessonList.some((lesson) => lesson.id === requestedLessonId) ? requestedLessonId : lessonList[0]?.id;
if (!isLessonUnlocked(selectedLessonId)) selectedLessonId = lessonList.find((lesson) => isLessonUnlocked(lesson.id))?.id || lessonList[0]?.id;
const selectedVideoIndexByLesson = new Map();
let videoRenderToken = 0;

function renderStrip() {
  const lessonStrip = document.getElementById('lesson-strip');
  lessonStrip.innerHTML = '';
  for (const lesson of lessonList) {
    const lessonButton = document.createElement('button');
    const unlocked = isLessonUnlocked(lesson.id);
    // Назва словами, а не номер у кружечку: мітка, якщо вона є, інакше назва уроку.
    const label = lesson.short_label || lesson.title || 'Урок';
    lessonButton.className = `lesson-pill${lesson.id === selectedLessonId ? ' active' : ''}${unlocked ? '' : ' locked'}`;
    lessonButton.textContent = unlocked ? label : `🔒 ${label}`;
    lessonButton.disabled = !unlocked;
    lessonButton.title = unlocked ? lesson.title : accessHint(lesson.id);
    lessonButton.addEventListener('click', () => { selectedLessonId = lesson.id; renderStrip(); renderLesson(); });
    lessonStrip.appendChild(lessonButton);
  }
}

function isLessonUnlocked(lessonId) {
  const index = lessonList.findIndex((lesson) => lesson.id === lessonId);
  if (index <= 0) return true;
  const previousLesson = lessonList[index - 1];
  const progress = lessonProgress.get(previousLesson.id);
  switch (previousLesson.next_lesson_access_rule) {
    case 'after_submission': return Boolean(progress?.homework_submitted_at);
    case 'after_review': return progress?.homework_review_status === 'accepted';
    case 'after_delay': return Boolean(progress?.first_opened_at) && Date.now() >= new Date(progress.first_opened_at).getTime() + previousLesson.next_lesson_delay_hours * 60 * 60 * 1000;
    case 'scheduled': return Boolean(progress?.first_opened_at) && Date.now() >= scheduledUnlockTime(progress.first_opened_at, previousLesson.next_lesson_delay_days, previousLesson.next_lesson_unlock_time);
    default: return true;
  }
}

function scheduledUnlockTime(firstOpenedAt, days, time) {
  const result = new Date(firstOpenedAt);
  result.setDate(result.getDate() + days);
  const [hours, minutes] = String(time || '09:00').split(':').map(Number);
  result.setHours(hours || 0, minutes || 0, 0, 0);
  return result.getTime();
}

function accessHint(lessonId) {
  const index = lessonList.findIndex((lesson) => lesson.id === lessonId);
  const previousLesson = lessonList[index - 1];
  const labels = {
    after_submission: 'Відкриється після здачі ДЗ',
    after_review: 'Відкриється після перевірки ДЗ',
    after_delay: `Відкриється через ${previousLesson.next_lesson_delay_hours} год. після попереднього уроку`,
    scheduled: `Відкриється через ${previousLesson.next_lesson_delay_days} дн. о ${previousLesson.next_lesson_unlock_time}`,
  };
  return labels[previousLesson.next_lesson_access_rule] || 'Урок поки закритий';
}

async function trackLessonOpened(lesson) {
  if (isAdminView || !lesson) return;
  const { error } = await supabase.from('lesson_progress').upsert({
    student_id: studentId,
    lesson_id: lesson.id,
  }, { onConflict: 'student_id,lesson_id', ignoreDuplicates: true });
  if (!error && !lessonProgress.has(lesson.id)) {
    lessonProgress.set(lesson.id, { lesson_id: lesson.id, first_opened_at: new Date().toISOString() });
    renderStrip();
  }
}

async function reloadProgress() {
  if (isAdminView || !lessonList.length) return;
  const { data } = await supabase.from('lesson_progress').select('lesson_id, first_opened_at, homework_submitted_at, homework_review_status').eq('student_id', studentId).in('lesson_id', lessonList.map((lesson) => lesson.id));
  lessonProgress = new Map((data || []).map((row) => [row.lesson_id, row]));
  renderStrip();
}

async function renderLesson() {
  const lesson = lessonList.find((l) => l.id === selectedLessonId);
  trackLessonOpened(lesson);
  const videoBox = document.getElementById('video-box');
  const videos = lesson?.videos || [];
  const selectedVideoIndex = Math.min(selectedVideoIndexByLesson.get(lesson?.id) || 0, Math.max(videos.length - 1, 0));
  const video = videos[selectedVideoIndex];
  const renderToken = ++videoRenderToken;
  if (video?.source_type === 'r2' && video.file_key) {
    videoBox.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999;font-size:13px;">Завантажуємо відео…</div>`;
    try {
      const url = await getCourseAssetUrl({ courseId, objectKey: video.file_key, fileName: video.file_name });
      if (renderToken !== videoRenderToken) return;
      videoBox.innerHTML = `<video controls playsinline src="${escapeAttribute(url)}" style="width:100%;height:100%;background:#000;"></video>`;
    } catch (error) {
      if (renderToken !== videoRenderToken) return;
      videoBox.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999;font-size:13px;">Не вдалося відкрити відео</div>`;
    }
  } else if (video?.youtube_id) {
    videoBox.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${video.youtube_id}?rel=0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  } else {
    videoBox.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999;font-size:13px;">Відео ще не додано</div>`;
  }

  const selector = document.getElementById('video-selector');
  selector.hidden = videos.length < 2;
  selector.innerHTML = '';
  videos.forEach((video, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = index === selectedVideoIndex ? 'active' : '';
    button.textContent = video.title || `Відео ${index + 1}`;
    button.addEventListener('click', () => {
      selectedVideoIndexByLesson.set(lesson.id, index);
      renderLesson();
    });
    selector.appendChild(button);
  });

  // Опис і ДЗ показуємо лише тоді, коли вони справді є: порожній розділ нічого
  // не пояснює, а місце на екрані займає.
  const descriptionBlock = document.getElementById('description-block');
  const descriptionText = (lesson?.description || '').trim();
  descriptionBlock.hidden = !descriptionText;
  document.getElementById('lesson-description').textContent = descriptionText;

  const homeworkBlock = document.getElementById('homework-block');
  homeworkBlock.hidden = !lesson?.homework_enabled;

  const lessonPresentationBlock = document.getElementById('lesson-presentation-block');
  const hasLessonPresentation = Boolean(lesson?.presentation_url || lesson?.presentation_file_key);
  lessonPresentationBlock.hidden = !hasLessonPresentation;
  if (hasLessonPresentation) {
    wirePresentationLinks({
      link: document.getElementById('lesson-presentation-link'),
      downloadButton: document.getElementById('lesson-presentation-download'),
      url: lesson.presentation_url,
      fileKey: lesson.presentation_file_key,
      fileName: lesson.presentation_file_name,
    });
  }

  if (lesson?.homework_enabled) {
    mountHomeworkField(document.getElementById('homework-container'), { lesson, studentId, courseId, readOnly: isAdminView, onSubmitted: reloadProgress });
  }
}

function wirePresentationLinks({ link, downloadButton, url, fileKey, fileName }) {
  link.onclick = null;
  downloadButton.onclick = null;
  if (url) {
    link.href = url;
    link.textContent = 'Презентація';
    downloadButton.hidden = true;
    return;
  }
  link.href = '#';
  link.textContent = fileName || 'Презентація';
  link.onclick = async (event) => {
    event.preventDefault();
    try { await openCourseAsset({ courseId, objectKey: fileKey, fileName }); } catch (error) { alert(error.message); }
  };
  downloadButton.hidden = false;
  downloadButton.onclick = async () => {
    try { await openCourseAsset({ courseId, objectKey: fileKey, fileName, download: true }); } catch (error) { alert(error.message); }
  };
}

function escapeAttribute(value) {
  const div = document.createElement('div');
  div.textContent = value || '';
  return div.innerHTML.replace(/"/g, '&quot;');
}

renderStrip();
renderLesson();

mountChatPanel(document.getElementById('chat-container'), {
  courseId,
  studentId,
  lessons: lessonList,
  viewerRole: isAdminView ? 'admin' : 'student',
  initialLessonId: requestedLessonId,
});
