import { supabase } from '../supabaseClient.js?v=20261113-2';
import { requireAdmin, wireLogoutButton } from '../auth.js?v=20261113-2';

const auth = await requireAdmin();
if (!auth) throw new Error('not admin');

wireLogoutButton(document.getElementById('logout-btn'));

const courseEl = document.getElementById('review-course');
const studentsEl = document.getElementById('review-students');
const lessonsEl = document.getElementById('review-lessons');
const lessonsTitleEl = document.getElementById('review-lessons-title');
const errorEl = document.getElementById('review-error');

let courses = [];
let lessons = [];
let students = [];
let progress = new Map();   // "student|lesson" -> рядок lesson_progress
let unlocked = new Set();   // "student|lesson" — відкрито вручну
let studentId = null;

const key = (student, lesson) => `${student}|${lesson}`;

function showError(text) {
  errorEl.textContent = text;
  errorEl.hidden = false;
}

async function loadCourses() {
  const { data, error } = await supabase.from('courses').select('id, title').order('order_index');
  if (error) {
    showError('Не вдалося завантажити курси.');
    return;
  }
  courses = data || [];
  courseEl.innerHTML = '';
  for (const course of courses) {
    const option = document.createElement('option');
    option.value = course.id;
    option.textContent = course.title;
    courseEl.appendChild(option);
  }
  if (courses.length) await loadCourse(courses[0].id);
  else studentsEl.innerHTML = '<div class="admin-empty-card">Спочатку створіть курс.</div>';
}

async function loadCourse(courseId) {
  studentsEl.innerHTML = '<div class="admin-empty-card">Завантажуємо…</div>';
  lessonsEl.innerHTML = '';
  const [{ data: lessonRows }, { data: accessRows }] = await Promise.all([
    supabase.from('lessons')
      .select('id, title, short_label, order_index, next_lesson_access_rule, next_lesson_delay_hours, next_lesson_delay_days, next_lesson_unlock_time')
      .eq('course_id', courseId).order('order_index'),
    supabase.from('course_access')
      .select('student_id, expires_at, profiles(id, email, full_name)')
      .eq('course_id', courseId),
  ]);

  lessons = lessonRows || [];
  students = (accessRows || [])
    .map((row) => ({
      id: row.student_id,
      email: row.profiles?.email || '',
      name: row.profiles?.full_name || '',
      expiresAt: row.expires_at,
    }))
    .filter((student) => student.email)
    .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, 'uk'));

  const lessonIds = lessons.map((lesson) => lesson.id);
  if (lessonIds.length && students.length) {
    const [{ data: progressRows }, { data: unlockRows }] = await Promise.all([
      supabase.from('lesson_progress')
        .select('student_id, lesson_id, first_opened_at, homework_submitted_at, homework_review_status')
        .in('lesson_id', lessonIds),
      supabase.from('lesson_unlocks').select('student_id, lesson_id').in('lesson_id', lessonIds),
    ]);
    progress = new Map((progressRows || []).map((row) => [key(row.student_id, row.lesson_id), row]));
    unlocked = new Set((unlockRows || []).map((row) => key(row.student_id, row.lesson_id)));
  } else {
    progress = new Map();
    unlocked = new Set();
  }

  studentId = students.some((student) => student.id === studentId) ? studentId : students[0]?.id || null;
  renderStudents();
  renderLessons();
}

function renderStudents() {
  studentsEl.innerHTML = '';
  if (!students.length) {
    studentsEl.innerHTML = '<div class="admin-empty-card">На цей курс ще нікого не записано.</div>';
    return;
  }
  for (const student of students) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `review-student${student.id === studentId ? ' active' : ''}`;
    button.innerHTML = `<span>${escapeHtml(student.name || student.email)}</span><span class="review-open-count">${openCount(student.id)} з ${lessons.length}</span>`;
    button.addEventListener('click', () => {
      studentId = student.id;
      renderStudents();
      renderLessons();
    });
    studentsEl.appendChild(button);
  }
}

function openCount(id) {
  return lessons.filter((lesson, index) => isOpen(id, index)).length;
}

// Та сама перевірка, що й на сторінці учениці. Ручне відкриття сильніше за
// будь-яке правило курсу: ДЗ могло прийти в Інстаграм.
function isOpen(student, index) {
  const lesson = lessons[index];
  if (unlocked.has(key(student, lesson.id))) return true;
  if (index <= 0) return true;
  const previous = lessons[index - 1];
  const row = progress.get(key(student, previous.id));
  switch (previous.next_lesson_access_rule) {
    case 'after_submission': return Boolean(row?.homework_submitted_at);
    case 'after_review': return row?.homework_review_status === 'accepted';
    case 'after_delay': return Boolean(row?.first_opened_at)
      && Date.now() >= new Date(row.first_opened_at).getTime() + (previous.next_lesson_delay_hours || 0) * 3600000;
    case 'scheduled': return Boolean(row?.first_opened_at)
      && Date.now() >= scheduledTime(row.first_opened_at, previous.next_lesson_delay_days, previous.next_lesson_unlock_time);
    default: return true;
  }
}

function scheduledTime(from, days, time) {
  const date = new Date(from);
  date.setDate(date.getDate() + (days || 0));
  const [hours, minutes] = String(time || '09:00').split(':').map(Number);
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return date.getTime();
}

function renderLessons() {
  lessonsEl.innerHTML = '';
  const student = students.find((item) => item.id === studentId);
  lessonsTitleEl.textContent = student ? `Уроки · ${student.name || student.email}` : 'Уроки';
  if (!student) return;
  if (!lessons.length) {
    lessonsEl.innerHTML = '<div class="admin-empty-card">У цьому курсі ще немає уроків.</div>';
    return;
  }

  lessons.forEach((lesson, index) => {
    const open = isOpen(student.id, index);
    const byHand = unlocked.has(key(student.id, lesson.id));
    const row = document.createElement('div');
    row.className = `review-lesson${open ? ' open' : ''}`;
    const submitted = progress.get(key(student.id, lesson.id))?.homework_submitted_at;
    row.innerHTML = `
      <span class="review-lesson-name">${index + 1}. ${escapeHtml(lesson.short_label || lesson.title || 'Урок')}</span>
      <span class="review-lesson-note">${submitted ? 'ДЗ надіслано через сайт' : ''}</span>
      <button type="button" class="review-lock" aria-label="${open ? 'Закрити урок' : 'Відкрити урок'}">${open ? '🔓' : '🔒'}</button>
    `;
    const button = row.querySelector('.review-lock');
    // Перший урок відкритий завжди, і правило курсу теж може відкрити урок
    // саме. Рукою закриваємо лише те, що рукою й відкрили.
    if (index === 0 || (open && !byHand)) {
      button.disabled = true;
      button.title = index === 0 ? 'Перший урок відкритий завжди' : 'Відкрився за правилом курсу';
    } else {
      button.title = open ? 'Закрити доступ' : 'Відкрити доступ';
      button.addEventListener('click', () => toggleLesson(student.id, lesson, !open, button));
    }
    lessonsEl.appendChild(row);
  });
}

async function toggleLesson(student, lesson, shouldOpen, button) {
  button.disabled = true;
  const request = shouldOpen
    ? supabase.from('lesson_unlocks').upsert({ student_id: student, lesson_id: lesson.id }, { onConflict: 'student_id,lesson_id' })
    : supabase.from('lesson_unlocks').delete().eq('student_id', student).eq('lesson_id', lesson.id);
  const { error } = await request;
  button.disabled = false;
  if (error) {
    showError('Не вдалося змінити доступ до уроку. Спробуйте ще раз.');
    return;
  }
  errorEl.hidden = true;
  if (shouldOpen) unlocked.add(key(student, lesson.id));
  else unlocked.delete(key(student, lesson.id));
  renderStudents();
  renderLessons();
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

courseEl.addEventListener('change', () => loadCourse(courseEl.value));
await loadCourses();
