import { supabase } from '../supabaseClient.js';
import { requireAuth, wireLogoutButton } from '../auth.js';
import { fetchUnreadCounts } from '../chat.js';

const result = await requireAuth();
if (result) {
  wireLogoutButton(document.getElementById('logout-btn'));

  const { data: courses } = await supabase.from('courses').select('id, title').order('order_index');
  const listEl = document.getElementById('course-list');

  if (!courses || courses.length === 0) {
    listEl.innerHTML = '<p class="muted">Поки що немає доступних курсів.</p>';
  } else {
    for (const c of courses) {
      const counts = await fetchUnreadCounts(c.id, 'student', result.profile.id);
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      const row = document.createElement('div');
      row.className = 'card-row';
      row.innerHTML = `
        <span style="flex:1;font-size:15px;">${escapeHtml(c.title)}</span>
        ${total > 0 ? `<span class="badge">${total}</span>` : ''}
        <span class="muted">›</span>
      `;
      row.addEventListener('click', () => {
        window.location.href = `course.html?course=${c.id}`;
      });
      listEl.appendChild(row);
    }
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
