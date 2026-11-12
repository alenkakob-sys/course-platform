import { supabase } from '../supabaseClient.js?v=20261112-1';
import { requireAdmin, wireLogoutButton } from '../auth.js?v=20261112-1';
import { FUNCTIONS_URL } from '../config.js?v=20261112-1';

const auth = await requireAdmin();
if (!auth) throw new Error('not admin');

wireLogoutButton(document.getElementById('logout-btn'));

const listEl = document.getElementById('students-list');
const countEl = document.getElementById('student-count');
const searchEl = document.getElementById('student-search');
const errorEl = document.getElementById('students-error');
const statusEl = document.getElementById('invite-status');
const pendingCourseOptionsEl = document.getElementById('pending-course-options');
const filterEl = document.getElementById('student-filter');
const courseFilterEl = document.getElementById('student-course');
const sortEl = document.getElementById('student-sort');

let students = [];
let pendingStudents = [];
let courses = [];
let access = {};

// invited_at зʼявляється лише після міграції 20260827_invited_at.sql. Поки її
// не виконано, запитуємо без цього стовпця — сторінка не мусить падати через
// те, що база ще на крок позаду.
let invitedAtAvailable = true;

async function loadStudents() {
  if (invitedAtAvailable) {
    const withInvited = await supabase
      .from('profiles').select('id, email, full_name, created_at, invited_at')
      .eq('role', 'student').order('invited_at', { ascending: false });
    if (!withInvited.error) return withInvited;
    invitedAtAvailable = false;
    console.warn('Стовпця invited_at ще немає — виконайте міграцію 20260827_invited_at.sql');
  }
  return supabase
    .from('profiles').select('id, email, full_name, created_at')
    .eq('role', 'student').order('created_at', { ascending: false });
}

async function load() {
  listEl.innerHTML = '<div class="admin-empty-card">Завантажуємо учениць…</div>';
  const [
    { data: studentRows, error },
    { data: courseRows },
    { data: accessRows },
    { data: pendingRows },
    { data: pendingAccessRows },
  ] = await Promise.all([
    loadStudents(),
    supabase.from('courses').select('id, title').order('order_index'),
    supabase.from('course_access').select('student_id, course_id'),
    supabase.from('pending_students').select('email, created_at').order('created_at', { ascending: false }),
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
    .map((row) => ({ email: row.email, createdAt: row.created_at, courses: pendingAccess[row.email] || new Set() }));

  renderPendingCourseOptions();
  renderCourseFilter();
  render();
}

function renderCourseFilter() {
  const previous = courseFilterEl.value;
  courseFilterEl.innerHTML = '<option value="all">Будь-який курс</option>';
  for (const course of courses) {
    const option = document.createElement('option');
    option.value = course.id;
    option.textContent = course.title;
    courseFilterEl.appendChild(option);
  }
  // Якщо обраний курс нікуди не подівся — лишаємо вибір користувачки.
  courseFilterEl.value = [...courseFilterEl.options].some((o) => o.value === previous) ? previous : 'all';
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
  const state = filterEl.value;
  const courseId = courseFilterEl.value;
  const order = sortEl.value;

  let filteredPending = state === 'registered' ? [] : pendingStudents.filter((item) => matches(item.email));
  let filtered = state === 'pending' ? [] : students.filter((student) => matches(`${student.full_name || ''} ${student.email || ''}`));

  if (courseId !== 'all') {
    filteredPending = filteredPending.filter((item) => item.courses.has(courseId));
    filtered = filtered.filter((student) => access[student.id]?.has(courseId));
  }

  // Дата для сортування: у черзі — коли додана, у профілі — invited_at, а якщо
  // міграцію ще не виконано, лишається дата першого входу.
  const dateOf = (row) => new Date(row.createdAt || row.invited_at || row.created_at || 0).getTime();
  // Сортуємо за тим, що написано в картці: у зареєстрованої це імʼя, якщо воно є.
  const emailOf = (row) => (row.full_name || row.email || '').toLocaleLowerCase('uk');
  const sorter = order === 'email'
    ? (a, b) => emailOf(a).localeCompare(emailOf(b), 'uk')
    : order === 'old' ? (a, b) => dateOf(a) - dateOf(b) : (a, b) => dateOf(b) - dateOf(a);
  filteredPending.sort(sorter);
  filtered.sort(sorter);

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
      <div><h2>${escapeHtml(displayName)}</h2><p>${student.full_name ? `${escapeHtml(student.email)} · ` : ''}${student.invited_at ? `додана ${formatDate(student.invited_at)}` : `перший вхід ${formatDate(student.created_at)}`}</p></div>
      <button type="button" class="admin-danger-link" data-delete>Видалити акаунт</button>
    </div>
    <div class="admin-access-list" aria-label="Доступ до курсів"></div>
  `;
  fillCourseChecks(card.querySelector('.admin-access-list'), {
    isChecked: (course) => access[student.id]?.has(course.id) || false,
    onToggle: (course, checkbox) => updateAccess(student.id, course.id, checkbox),
  });
  card.querySelector('[data-delete]').addEventListener('click', () => deleteStudent(student, card));
  return card;
}

function pendingCard(item) {
  const card = document.createElement('article');
  card.className = 'admin-student-card pending';
  card.innerHTML = `
    <div class="admin-student-main">
      <span class="admin-avatar">${escapeHtml(initials(item.email))}</span>
      <div><h2>${escapeHtml(item.email)}</h2><p>Додана ${formatDate(item.createdAt)} · ще не заходила</p></div>
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

// Акаунт видаляє серверна функція: у браузері немає (і не може бути) ключа,
// яким дозволено чіпати auth.users. Разом з акаунтом зникають доступи, прогрес
// і листування — тому питаємо підтвердження з переліком того, що втратиться.
async function deleteStudent(student, card) {
  const label = student.full_name || student.email;
  const confirmed = confirm(
    `Видалити акаунт ${label}?\n\n`
    + 'Зникнуть назавжди: доступи до курсів, прогрес уроків, здані домашні завдання та все листування в чаті.\n\n'
    + 'Скасувати це буде неможливо.'
  );
  if (!confirmed) return;

  const button = card.querySelector('[data-delete]');
  button.disabled = true;
  button.textContent = 'Видаляємо…';
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Сесія завершилася. Увійдіть знову.');
    const response = await fetch(`${FUNCTIONS_URL}/delete-student`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ studentId: student.id }),
    });
    if (response.status === 404) throw new Error('Функцію видалення ще не задеплоєно на Netlify.');
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Не вдалося видалити акаунт.');
    errorEl.hidden = true;
    await load();
  } catch (error) {
    console.error('delete student failed', error);
    // TypeError від fetch = запит навіть не дійшов: найчастіше тому, що функції
    // з такою назвою на Netlify ще немає, і її 404 приходить без CORS-заголовків.
    const message = error instanceof TypeError
      ? 'Сервер видалення не відповідає. Найімовірніше, репозиторій course-platform-functions ще не задеплоєний.'
      : error.message;
    showError(message);
    button.disabled = false;
    button.textContent = 'Видалити акаунт';
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
  const emailInput = document.getElementById('invite-target');
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
      await supabase.from('profiles').update({ invited_at: new Date().toISOString() })
        .eq('id', existing.id).is('invited_at', null);
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

// Знімаємо readonly аж коли в поле справді клацнули: до того браузеру нічого
// підставляти, бо readonly-поля він не чіпає.
const inviteInput = document.getElementById('invite-target');
for (const eventName of ['focus', 'pointerdown']) {
  inviteInput.addEventListener(eventName, () => inviteInput.removeAttribute('readonly'));
}

document.getElementById('invite-submit').addEventListener('click', saveAccess);
document.getElementById('invite-target').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') { event.preventDefault(); saveAccess(); }
});

searchEl.addEventListener('input', render);
for (const control of [filterEl, courseFilterEl, sortEl]) control.addEventListener('change', render);

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

// Дата коротко: «27 серпня», а торішня — з роком.
function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) });
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
