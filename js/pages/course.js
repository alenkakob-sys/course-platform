import { supabase } from '../supabaseClient.js';
import { requireAuth } from '../auth.js';
import { mountChatPanel } from '../components/chat-panel.js';
import { mountHomeworkField } from '../components/homework-field.js';

const params = new URLSearchParams(window.location.search);
const courseId = params.get('course');
const isAdminView = params.get('admin') === '1';

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
  supabase.from('lessons').select('id, title, short_label, description, homework_type, homework_description, order_index, videos(youtube_id, order_index)').eq('course_id', courseId).order('order_index'),
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

const lessonList = lessons || [];
let selectedLessonId = lessonList[0]?.id;

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
  const youtubeId = lesson?.videos?.[0]?.youtube_id;
  videoBox.innerHTML = youtubeId
    ? `<iframe src="https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999;font-size:13px;">Відео ще не додано</div>`;

  document.getElementById('lesson-description').textContent = lesson?.description || 'Опис ще не додано.';

  mountHomeworkField(document.getElementById('homework-container'), { lesson, studentId, courseId });
}

renderStrip();
renderLesson();

mountChatPanel(document.getElementById('chat-container'), {
  courseId,
  studentId,
  lessons: lessonList,
  viewerRole: isAdminView ? 'admin' : 'student',
});
