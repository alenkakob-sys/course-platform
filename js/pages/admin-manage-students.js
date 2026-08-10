import { supabase } from '../supabaseClient.js?v=20260810-7';
import { requireAdmin, wireLogoutButton } from '../auth.js?v=20260810-7';

const auth = await requireAdmin();
if (!auth) throw new Error('not admin');

wireLogoutButton(document.getElementById('logout-btn'));

const listEl = document.getElementById('students-list');
const countEl = document.getElementById('student-count');
const searchEl = document.getElementById('student-search');
const errorEl = document.getElementById('students-error');
const statusEl = document.getElementById('invite-status');
const pendingCourseOptionsEl = document.getElementById('pending-course-options');

let students = [];
let courses = [];
let access = {};

async function load() {
  listEl.innerHTML = '<div class="admin-empty-card">Завантажуємо учениць…</div>';
  const [{ data: studentRows, error }, { data: courseRows }, { data: accessRows }] = await Promise.all([
    supabase.from('profiles').select('id, email, full_name').eq('role', 'student').order('email'),
    supabase.from('courses').select('id, title').order('order_index'),
    supabase.from('course_access').select('student_id, course_id'),
  ]);

  if (error) {
    showError('Не вдалося завантажити список учениць.');
    return;
  }

  students = studentRows || [];
  courses = courseRows || [];
  access = {};
  (accessRows || []).forEach((row) => {
    if (!access[row.student_id]) access[row.student_id] = new Set();
    access[row.student_id].add(row.course_id);
  });
  renderPendingCourseOptions();
  render();
}

function renderPendingCourseOptions() {
  pendingCourseOptionsEl.innerHTML = '';
  if (!courses.length) {
    pendingCourseOptionsEl.textContent = 'Спочатку створіть курс.';
    return;
  }
  // Жодного курсу не позначено наперед: доступ відкривається лише свідомим
  // натисканням, щоб забута галочка не роздала всі курси одразу.
  for (const course of courses) {
    const label = document.createElement('label');
    label.className = 'admin-course-check';
    label.innerHTML = `<input type="checkbox" value="${course.id}" /> <span>${escapeHtml(course.title)}</span>`;
    pendingCourseOptionsEl.appendChild(label);
  }
}

function render() {
  const query = searchEl.value.trim().toLocaleLowerCase('uk');
  const filtered = students.filter((student) =>
    `${student.full_name || ''} ${student.email || ''}`.toLocaleLowerCase('uk').includes(query)
  );
  countEl.textContent = `${filtered.length} ${plural(filtered.length, 'учениця', 'учениці', 'учениць')}`;
  listEl.innerHTML = '';

  if (!filtered.length) {
    listEl.innerHTML = `<div class="admin-empty-card">${query ? 'Нічого не знайдено.' : 'Учениць ще немає. Додайте email для першого входу через Google.'}</div>`;
    return;
  }

  for (const student of filtered) {
    const card = document.createElement('article');
    card.className = 'admin-student-card';
    const displayName = student.full_name || student.email;
    card.innerHTML = `
      <div class="admin-student-main">
        <span class="admin-avatar">${escapeHtml(initials(displayName))}</span>
        <div><h2>${escapeHtml(displayName)}</h2>${student.full_name ? `<p>${escapeHtml(student.email)}</p>` : ''}</div>
      </div>
      <div class="admin-access-list" aria-label="Доступ до курсів"></div>
    `;

    const checks = card.querySelector('.admin-access-list');
    if (!courses.length) checks.innerHTML = '<span class="admin-count">Спочатку створіть курс.</span>';
    for (const course of courses) {
      const label = document.createElement('label');
      label.className = 'admin-course-check';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = access[student.id]?.has(course.id) || false;
      const text = document.createElement('span');
      text.textContent = course.title;
      checkbox.addEventListener('change', () => updateAccess(student.id, course.id, checkbox));
      label.append(checkbox, text);
      checks.appendChild(label);
    }
    listEl.appendChild(card);
  }
}

async function updateAccess(studentId, courseId, checkbox) {
  const shouldGrant = checkbox.checked;
  checkbox.disabled = true;
  const request = shouldGrant
    ? supabase.from('course_access').insert({ student_id: studentId, course_id: courseId })
    : supabase.from('course_access').delete().eq('student_id', studentId).eq('course_id', courseId);
  const { error } = await request;
  checkbox.disabled = false;

  if (error) {
    checkbox.checked = !shouldGrant;
    showError('Не вдалося змінити доступ. Спробуйте ще раз.');
    return;
  }
  if (!access[studentId]) access[studentId] = new Set();
  if (shouldGrant) access[studentId].add(courseId);
  else access[studentId].delete(courseId);
}

document.getElementById('invite-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const emailInput = document.getElementById('invite-email');
  const submitButton = event.currentTarget.querySelector('button[type="submit"]');
  statusEl.hidden = false;
  statusEl.className = '';
  statusEl.textContent = 'Зберігаємо доступ…';
  submitButton.disabled = true;

  try {
    const email = emailInput.value.trim().toLocaleLowerCase('uk');
    const courseIds = [...pendingCourseOptionsEl.querySelectorAll('input:checked')].map((input) => input.value);
    if (!courseIds.length) throw new Error('Оберіть хоча б один курс.');
    const { error: pendingError } = await supabase.from('pending_students').upsert({ email });
    if (pendingError) throw pendingError;
    const { error: clearError } = await supabase.from('pending_course_access').delete().eq('email', email);
    if (clearError) throw clearError;
    const { error: accessError } = await supabase.from('pending_course_access').insert(courseIds.map((course_id) => ({ email, course_id })));
    if (accessError) throw accessError;
    statusEl.className = 'admin-alert success';
    statusEl.textContent = 'Доступ збережено ✓ лист не надсилався';
    emailInput.value = '';
    await load();
  } catch (error) {
    console.error('invite failed', error);
    statusEl.className = 'admin-alert error';
    statusEl.textContent = error.message || 'Не вдалося надіслати запрошення.';
  } finally {
    submitButton.disabled = false;
  }
});

searchEl.addEventListener('input', render);

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function initials(value) {
  return String(value || '?').split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function plural(number, one, few, many) {
  const mod10 = number % 10;
  const mod100 = number % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value || '';
  return div.innerHTML;
}

load();
