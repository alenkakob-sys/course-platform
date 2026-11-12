import { supabase } from './supabaseClient.js?v=20261112-2';
import { INSTAGRAM_HANDLE } from './config.js?v=20261112-2';
import { accessDaysLeft } from './access-term.js?v=20261112-2';

// Попередження про закінчення доступу. Показуємо за тиждень: раніше воно
// просто набридає, пізніше вже немає часу щось зробити.
const WARN_DAYS = 7;

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) });
}

function pluralDays(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дні';
  return 'днів';
}

function noticeText(days, lastDay) {
  const when = days <= 0 ? 'сьогодні'
    : days === 1 ? 'завтра'
    : `через ${days} ${pluralDays(days)}`;
  return `Доступ до курсу закривається ${when}. Останній день: ${lastDay}. `
    + 'Встигніть переглянути уроки або напишіть, щоб подовжити підписку чи відкрити курс назавжди.';
}

// courseIds: якщо передано, беремо лише ці курси (сторінка одного курсу).
export async function mountAccessNotice(container, studentId, courseIds = null) {
  if (!container || !studentId) return;
  let query = supabase.from('course_access').select('course_id, expires_at').eq('student_id', studentId);
  if (courseIds?.length) query = query.in('course_id', courseIds);
  const { data, error } = await query;
  if (error || !data?.length) return;

  const soon = data
    .filter((row) => row.expires_at)
    .map((row) => ({ ...row, left: accessDaysLeft(row.expires_at) }))
    .filter((row) => row.left <= WARN_DAYS)
    .sort((a, b) => a.left - b.left)[0];
  if (!soon) return;

  const lastDay = new Date(soon.expires_at);
  lastDay.setDate(lastDay.getDate() - 1);

  const box = document.createElement('div');
  box.className = 'access-notice';
  box.innerHTML = `<p>${noticeText(soon.left, formatDate(lastDay))}</p>`;
  const link = document.createElement(INSTAGRAM_HANDLE ? 'a' : 'span');
  link.className = 'access-notice-link';
  link.textContent = INSTAGRAM_HANDLE ? `Написати в Instagram @${INSTAGRAM_HANDLE}` : 'Напишіть в Instagram';
  if (INSTAGRAM_HANDLE) {
    link.href = `https://instagram.com/${INSTAGRAM_HANDLE}`;
    link.target = '_blank';
    link.rel = 'noreferrer';
  }
  box.appendChild(link);
  container.prepend(box);
}
