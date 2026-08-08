import { supabase } from '../supabaseClient.js';
import { requireAuth } from '../auth.js';
import { mountChatPanel } from '../components/chat-panel.js';
import { mountHomeworkField } from '../components/homework-field.js?v=20260808-3';
import { STUDENT_LESSON_SELECT, normalizeLesson } from '../models/lesson.js';

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
  supabase.from('presentations').select('embed_url').eq('course_id', courseId).maybeSingle(),
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

if (coursePresentation?.embed_url) {
  const presentationBlock = document.getElementById('presentation-block');
  presentationBlock.style.display = 'block';
  document.getElementById('presentation-link').href = coursePresentation.embed_url;
}

const lessonList = (lessonRows || []).map(normalizeLesson);
let selectedLessonId = lessonList.some((lesson) => lesson.id === requestedLessonId) ? requestedLessonId : lessonList[0]?.id;
const selectedVideoIndexByLesson = new Map();

function renderStrip() {
  const lessonStrip = document.getElementById('lesson-strip');
  lessonStrip.innerHTML = '';
  for (const lesson of lessonList) {
    const lessonButton = document.createElement('button');
    lessonButton.className = `lesson-circle${lesson.id === selectedLessonId ? ' active' : ''}`;
    lessonButton.textContent = lesson.short_label || lesson.title.slice(0, 3);
    lessonButton.addEventListener('click', () => { selectedLessonId = lesson.id; renderStrip(); renderLesson(); });
    lessonStrip.appendChild(lessonButton);
  }
}

function renderLesson() {
  const lesson = lessonList.find((l) => l.id === selectedLessonId);
  const videoBox = document.getElementById('video-box');
  const videos = lesson?.videos || [];
  const selectedVideoIndex = Math.min(selectedVideoIndexByLesson.get(lesson?.id) || 0, Math.max(videos.length - 1, 0));
  const youtubeId = videos[selectedVideoIndex]?.youtube_id;
  videoBox.innerHTML = youtubeId
    ? `<iframe src="https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999;font-size:13px;">Відео ще не додано</div>`;

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

  document.getElementById('lesson-description').textContent = lesson?.description || 'Опис ще не додано.';

  mountHomeworkField(document.getElementById('homework-container'), { lesson, studentId, courseId, readOnly: isAdminView });
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
