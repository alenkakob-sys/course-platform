import { supabase } from '../supabaseClient.js';
import { requireAuth } from '../auth.js';
import { mountChatPanel } from '../components/chat-panel.js';
import { mountHomeworkField } from '../components/homework-field.js';

const params = new URLSearchParams(window.location.search);
const courseId = params.get('course');
const isAdminView = params.get('admin') === '1';
const requestedLessonId = params.get('lesson');

const auth = await requireAuth();
if (!auth) throw new Error('not authenticated');

if (isAdminView && auth.profile.role !== 'admin') {
  window.location.href = 'courses.html';
  throw new Error('not admin');
}

const studentId = isAdminView ? params.get('student') : auth.profile.id;

document.getElementById('back-link').href = isAdminView ? 'admin.html' : 'courses.html';

const [{ data: course }, { data: presentation }, { data: lessons }, studentProfile] = await Promise.all([
  supabase.from('courses').select('id, title').eq('id', courseId).single(),
  supabase.from('presentations').select('embed_url').eq('course_id', courseId).maybeSingle(),
  supabase.from('lessons').select('id, title, short_label, description, homework_type, homework_description, order_index, videos(youtube_id, title, order_index)').eq('course_id', courseId).order('order_index'),
  isAdminView ? supabase.from('profiles').select('full_name, email').eq('id', studentId).single().then((r) => r.data) : null,
]);

document.getElementById('course-title').textContent = course?.title || '';
if (isAdminView && studentProfile) {
  const sub = document.getElementById('student-context');
  sub.textContent = `Перегляд: ${studentProfile.full_name || studentProfile.email}`;
  sub.style.display = 'block';
}

if (presentation?.embed_url) {
  const block = document.getElementById('presentation-block');
  block.style.display = 'block';
  document.getElementById('presentation-link').href = presentation.embed_url;
}

const lessonList = (lessons || []).map((lesson) => ({
  ...lesson,
  videos: [...(lesson.videos || [])].sort((a, b) => a.order_index - b.order_index),
}));
let selectedLessonId = lessonList.some((lesson) => lesson.id === requestedLessonId) ? requestedLessonId : lessonList[0]?.id;
const selectedVideoByLesson = new Map();

function renderStrip() {
  const stripEl = document.getElementById('lesson-strip');
  stripEl.innerHTML = '';
  for (const l of lessonList) {
    const btn = document.createElement('button');
    btn.className = 'lesson-circle' + (l.id === selectedLessonId ? ' active' : '');
    btn.textContent = l.short_label || l.title.slice(0, 3);
    btn.addEventListener('click', () => { selectedLessonId = l.id; renderStrip(); renderLesson(); });
    stripEl.appendChild(btn);
  }
}

function renderLesson() {
  const lesson = lessonList.find((l) => l.id === selectedLessonId);
  const videoBox = document.getElementById('video-box');
  const videos = lesson?.videos || [];
  const selectedVideoIndex = Math.min(selectedVideoByLesson.get(lesson?.id) || 0, Math.max(videos.length - 1, 0));
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
      selectedVideoByLesson.set(lesson.id, index);
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
