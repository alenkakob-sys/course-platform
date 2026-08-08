import { supabase } from '../supabaseClient.js';
import { requireAdmin, wireLogoutButton } from '../auth.js';

const auth = await requireAdmin();
if (!auth) throw new Error('not admin');

wireLogoutButton(document.getElementById('logout-btn'));

const listEl = document.getElementById('course-list');
const countEl = document.getElementById('course-count');
const searchEl = document.getElementById('course-search');
const errorEl = document.getElementById('course-error');
const addButton = document.getElementById('add-course');

let courses = [];

async function load() {
  setBusy(true);
  const [{ data: courseRows, error }, { data: lessonRows }, { data: accessRows }] = await Promise.all([
    supabase.from('courses').select('id, title, order_index').order('order_index'),
    supabase.from('lessons').select('course_id'),
    supabase.from('course_access').select('course_id'),
  ]);
  setBusy(false);

  if (error) {
    showError('Не вдалося завантажити курси. Оновіть сторінку й спробуйте ще раз.');
    return;
  }

  const lessonCounts = countBy(lessonRows || [], 'course_id');
  const studentCounts = countBy(accessRows || [], 'course_id');
  courses = (courseRows || []).map((course) => ({
    ...course,
    lessonCount: lessonCounts[course.id] || 0,
    studentCount: studentCounts[course.id] || 0,
  }));
  render();
}

function render() {
  const query = searchEl.value.trim().toLocaleLowerCase('uk');
  const filtered = courses.filter((course) => course.title.toLocaleLowerCase('uk').includes(query));
  countEl.textContent = `${filtered.length} ${plural(filtered.length, 'курс', 'курси', 'курсів')}`;
  listEl.innerHTML = '';

  if (!filtered.length) {
    listEl.innerHTML = `<div class="admin-empty-card">${query ? 'За цим запитом курсів не знайдено.' : 'Курсів ще немає. Створіть перший курс.'}</div>`;
    return;
  }

  filtered.forEach((course, index) => {
    const article = document.createElement('article');
    article.className = 'admin-course-card';
    article.tabIndex = 0;
    article.innerHTML = `
      <span class="number">Курс ${String(index + 1).padStart(2, '0')}</span>
      <h2>${escapeHtml(course.title)}</h2>
      <p>${course.lessonCount} ${plural(course.lessonCount, 'урок', 'уроки', 'уроків')}</p>
      <footer><span>${course.studentCount} ${plural(course.studentCount, 'учениця', 'учениці', 'учениць')}</span><span>→</span></footer>
    `;
    const open = () => { window.location.href = `admin-manage-course.html?course=${course.id}`; };
    article.addEventListener('click', open);
    article.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') open(); });
    listEl.appendChild(article);
  });
}

addButton.addEventListener('click', async () => {
  addButton.disabled = true;
  addButton.textContent = 'Створюємо…';
  const { data, error } = await supabase
    .from('courses')
    .insert({ title: 'Новий курс', order_index: courses.length })
    .select('id')
    .single();
  if (error) {
    showError('Не вдалося створити курс. Спробуйте ще раз.');
    addButton.disabled = false;
    addButton.textContent = '＋ Новий курс';
    return;
  }
  window.location.href = `admin-manage-course.html?course=${data.id}`;
});

searchEl.addEventListener('input', render);

function countBy(rows, key) {
  return rows.reduce((result, row) => {
    result[row[key]] = (result[row[key]] || 0) + 1;
    return result;
  }, {});
}

function setBusy(busy) {
  if (busy) listEl.innerHTML = '<div class="admin-empty-card">Завантажуємо курси…</div>';
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
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
