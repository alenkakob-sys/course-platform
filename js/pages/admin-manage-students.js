import { supabase } from '../supabaseClient.js?v=20260827-2';
import { requireAdmin, wireLogoutButton } from '../auth.js?v=20260827-2';

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
let pendingStudents = [];
let courses = [];
let access = {};

async function load() {
  listEl.innerHTML = '<div class="admin-empty-card">Завантажуємо учениць…</div>';
  const [
    { data: studentRows, error },
    { data: courseRows },
    { data: accessRows },
    { data: pendingRows },
    { data: pendingAccessRows },
  ] = await Promise.all([
    supabase.from('profiles').select('id, email, full_name').eq('role', 'student').order('email'),
    supabase.from('courses').select('id, title').order('order_index'),
    supabase.from('course_access').select('student_id, course_id'),
    supabase.from('pending_students').select('email, created_at').order('created_at'),
    supabase.from('pending_course_access').select('email, course_id'),
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

  // Учениця, яка ще жодного разу не заходила, живе в pending_students і не має
  // профілю. Раніше її не було видно ніде — здавалось, що додавання не працює.
  const registeredEmails = new Set(students.map((student) => (student.email || '').toLowerCase()));
  const pendingAccess = {};
  (pendingAccessRows || []).forEach((row) => {
    if (!pendingAccess[row.email]) pendingAccess[row.email] = new Set();
    pendingAccess[row.email].add(row.course_id);
  });
  pendingStudents = (pendingRows || [])
    .filter((row) => !registeredEmails.has((row.email || '').toLowerCase()))
    .map((row) => ({ email: row.email, courses: pendingAccess[row.email] || new Set() }));

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
  const matches = (value) => value.toLocaleLowerCase('uk').includes(query);
  const filteredPending = pendingStudents.filter((item) => matches(item.email));
  const filtered = students.filter((student) => matches(`${student.full_name || ''} ${student.email || ''}`));
  const total = filteredPending.length + filtered.length;

  countEl.textContent = `${total} ${plural(total, 'учениця', 'учениці', 'учениць')}`;
  listEl.innerHTML = '';

  if (!total) {
    listEl.innerHTML = `<div class="admin-empty-card">${query ? 'Нічого не знайдено.' : 'Учениць ще немає. Додайте email для першого входу через Google.'}</div>`;
    return;
  }

  // Ті, хто ще не заходив, — угорі: саме з ними зазвичай щось роблять.
  for (const item of filteredPending) listEl.appendChild(pendingCard(item));
  for (const student of filtered) listEl.appendChild(studentCard(student));
}

function studentCard(student) {
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
  fillCourseChecks(card.querySelector('.admin-access-list'), {
    isChecked: (course) => access[student.id]?.has(course.id) || false,
    onToggle: (course, checkbox) => updateAccess(student.id, course.id, checkbox),
  });
  return card;
}

function pendingCard(item) {
  const card = document.createElement('article');
  card.className = 'admin-student-card pending';
  card.innerHTML = `
    <div class="admin-student-main">
      <span class="admin-avatar">${escapeHtml(initials(item.email))}</span>
      <div><h2>${escapeHtml(item.email)}</h2><p>Ще не заходила — доступ застосується при першому вході</p></div>
      <button type="button" class="admin-danger-link" data-remove>Прибрати</button>
    </div>
    <div class="admin-access-list" aria-label="Доступ до курсів"></div>
  `;
  fillCourseChecks(card.querySelector('.admin-access-list'), {
    isChecked: (course) => item.courses.has(course.id),
    onToggle: (course, checkbox) => updatePendingAccess(item, course.id, checkbox),
  });
  card.querySelector('[data-remove]').addEventListener('click', async () => {
    if (!confirm(`Прибрати ${item.email} зі списку очікування?`)) return;
    const { error } = await supabase.from('pending_students').delete().eq('email', item.email);
    if (error) {
      showError('Не вдалося прибрати запис. Спробуйте ще раз.');
      return;
    }
    await load();
  });
  return card;
}

function fillCourseChecks(container, { isChecked, onToggle }) {
  if (!courses.length) {
    container.innerHTML = '<span class="admin-count">Спочатку створіть курс.</span>';
    return;
  }
  for (const course of courses) {
    const label = document.createElement('label');
    label.className = 'admin-course-check';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isChecked(course);
    const text = document.createElement('span');
    text.textContent = course.title;
    checkbox.addEventListener('change', () => onToggle(course, checkbox));
    label.append(checkbox, text);
    container.appendChild(label);
  }
}

async function updatePendingAccess(item, courseId, checkbox) {
  const shouldGrant = checkbox.checked;
  checkbox.disabled = true;
  const request = shouldGrant
    ? supabase.from('pending_course_access').insert({ email: item.email, course_id: courseId })
    : supabase.from('pending_course_access').delete().eq('email', item.email).eq('course_id', courseId);
  const { error } = await request;
  checkbox.disabled = false;

  if (error) {
    checkbox.checked = !shouldGrant;
    showError('Не вдалося змінити доступ. Спробуйте ще раз.');
    return;
  }
  if (shouldGrant) item.courses.add(courseId);
  else item.courses.delete(courseId);
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

// Це не <form>, тому браузер сам нічого не перевіряє — формат пошти й
// обовʼязковість поля перевіряємо тут.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function saveAccess() {
  const emailInput = document.getElementById('invite-email');
  const submitButton = document.getElementById('invite-submit');
  statusEl.hidden = false;
  statusEl.className = '';
  statusEl.textContent = 'Зберігаємо доступ…';
  submitButton.disabled = true;

  try {
    const email = emailInput.value.trim().toLocaleLowerCase('uk');
    if (!EMAIL_PATTERN.test(email)) throw new Error('Вкажіть пошту у вигляді ім’я@сайт.com');
    const courseIds = [...pendingCourseOptionsEl.querySelectorAll('input:checked')].map((input) => input.value);
    if (!courseIds.length) throw new Error('Оберіть хоча б один курс.');

    // Якщо ця людина вже заходила, у неї є профіль — і доступ треба видавати
    // одразу. Черга очікування розрахована лише на новачків: для наявного
    // акаунта тригер першого входу вже не спрацює, і запис завис би назавжди.
    const { data: existing, error: lookupError } = await supabase
      .from('profiles').select('id').eq('email', email).maybeSingle();
    if (lookupError) throw lookupError;

    if (existing) {
      const { error: grantError } = await supabase
        .from('course_access')
        .upsert(courseIds.map((course_id) => ({ student_id: existing.id, course_id })), { onConflict: 'student_id,course_id' });
      if (grantError) throw grantError;
      await supabase.from('pending_students').delete().eq('email', email);
      statusEl.className = 'admin-alert success';
      statusEl.textContent = 'Ця учениця вже має акаунт — доступ відкрито одразу ✓';
    } else {
      const { error: pendingError } = await supabase.from('pending_students').upsert({ email });
      if (pendingError) throw pendingError;
      const { error: clearError } = await supabase.from('pending_course_access').delete().eq('email', email);
      if (clearError) throw clearError;
      const { error: accessError } = await supabase.from('pending_course_access').insert(courseIds.map((course_id) => ({ email, course_id })));
      if (accessError) throw accessError;
      statusEl.className = 'admin-alert success';
      statusEl.textContent = 'Додано до списку очікування ✓ доступ відкриється при першому вході';
    }

    emailInput.value = '';
    await load();
  } catch (error) {
    console.error('invite failed', error);
    statusEl.className = 'admin-alert error';
    statusEl.textContent = error.message || 'Не вдалося надіслати запрошення.';
  } finally {
    submitButton.disabled = false;
  }
}

document.getElementById('invite-submit').addEventListener('click', saveAccess);
document.getElementById('invite-email').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') { event.preventDefault(); saveAccess(); }
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
