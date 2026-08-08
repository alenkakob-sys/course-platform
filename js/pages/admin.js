import { supabase } from '../supabaseClient.js';
import { requireAdmin, wireLogoutButton } from '../auth.js';
import { fetchUnreadCounts } from '../chat.js';

const auth = await requireAdmin();
if (!auth) throw new Error('not admin');

wireLogoutButton(document.getElementById('logout-btn'));

const listEl = document.getElementById('student-list');
const searchEl = document.getElementById('message-search');
const unreadOnlyEl = document.getElementById('unread-only');
const unreadTotalEl = document.getElementById('unread-total');
const errorEl = document.getElementById('messages-error');

let rooms = [];

async function load() {
  listEl.innerHTML = '<div class="admin-empty-card">Завантажуємо чати…</div>';
  const { data: accessRows, error } = await supabase
    .from('course_access')
    .select('student_id, course_id, profiles(full_name, email), courses(id, title, lessons(id, title, short_label))');

  if (error) {
    showError('Не вдалося завантажити повідомлення.');
    return;
  }

  rooms = await Promise.all((accessRows || []).map(async (row) => {
    const unread = await fetchUnreadCounts(row.course_id, 'admin', row.student_id);
    const total = Object.values(unread).reduce((sum, value) => sum + value, 0);
    const firstUnread = Object.entries(unread).find(([, value]) => value > 0)?.[0] || 'general';
    const lesson = firstUnread === 'general'
      ? null
      : row.courses?.lessons?.find((item) => item.id === firstUnread);
    return {
      studentId: row.student_id,
      courseId: row.course_id,
      studentName: row.profiles?.full_name || row.profiles?.email || 'Учениця',
      studentEmail: row.profiles?.email || '',
      courseTitle: row.courses?.title || 'Курс',
      unreadTotal: total,
      firstUnread,
      unreadLabel: lesson ? `Непрочитане: ${lesson.short_label || lesson.title}` : total ? 'Непрочитане: загальний чат' : 'Усі повідомлення прочитані',
    };
  }));
  render();
}

function render() {
  const query = searchEl.value.trim().toLocaleLowerCase('uk');
  const filtered = rooms.filter((room) => {
    const matchesSearch = `${room.studentName} ${room.studentEmail} ${room.courseTitle}`.toLocaleLowerCase('uk').includes(query);
    return matchesSearch && (!unreadOnlyEl.checked || room.unreadTotal > 0);
  });

  const totalUnread = rooms.reduce((sum, room) => sum + room.unreadTotal, 0);
  unreadTotalEl.hidden = totalUnread === 0;
  unreadTotalEl.textContent = `${totalUnread} непрочитаних`;
  listEl.innerHTML = '';

  if (!filtered.length) {
    listEl.innerHTML = `<div class="admin-empty-card">${rooms.length ? 'За вибраними фільтрами чатів немає.' : 'Чати з’являться після надання ученицям доступу до курсів.'}</div>`;
    return;
  }

  const grouped = filtered.reduce((result, room) => {
    if (!result.has(room.courseTitle)) result.set(room.courseTitle, []);
    result.get(room.courseTitle).push(room);
    return result;
  }, new Map());
  for (const [courseTitle, courseRooms] of grouped) {
    const section = document.createElement('section');
    section.className = 'admin-message-group';
    section.innerHTML = `<h2>${escapeHtml(courseTitle)}</h2><div class="admin-room-list"></div>`;
    const roomList = section.querySelector('.admin-room-list');
    for (const room of courseRooms.sort((a, b) => b.unreadTotal - a.unreadTotal || a.studentName.localeCompare(b.studentName, 'uk'))) {
      const card = document.createElement('article');
      card.className = 'admin-room-card';
      card.tabIndex = 0;
      card.innerHTML = `
        <span class="admin-avatar">${escapeHtml(initials(room.studentName))}</span>
        <div><h3>${escapeHtml(room.studentName)}</h3><p>${escapeHtml(room.unreadLabel)}</p></div>
        ${room.unreadTotal ? `<span class="badge">${room.unreadTotal}</span>` : '<span class="admin-count">Відкрити →</span>'}
      `;
      const open = () => {
        window.location.href = `course.html?course=${room.courseId}&student=${room.studentId}&admin=1&lesson=${room.firstUnread}`;
      };
      card.addEventListener('click', open);
      card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') open(); });
      roomList.appendChild(card);
    }
    listEl.appendChild(section);
  }
}

searchEl.addEventListener('input', render);
unreadOnlyEl.addEventListener('change', render);

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function initials(value) {
  return String(value || '?').split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value || '';
  return div.innerHTML;
}

load();
