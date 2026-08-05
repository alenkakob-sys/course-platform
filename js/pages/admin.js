import { supabase } from '../supabaseClient.js';
import { requireAdmin, wireLogoutButton } from '../auth.js';
import { fetchUnreadCounts } from '../chat.js';

const auth = await requireAdmin();
if (auth) {
  wireLogoutButton(document.getElementById('logout-btn'));

  const { data: access } = await supabase
    .from('course_access')
    .select('student_id, course_id, profiles(full_name, email), courses(id, title)');

  const listEl = document.getElementById('student-list');
  for (const row of access || []) {
    const counts = await fetchUnreadCounts(row.course_id, 'admin', row.student_id);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const div = document.createElement('div');
    div.className = 'card-row';
    div.innerHTML = `
      <div style="flex:1;">
        <p style="font-size:14px;margin:0;">${escapeHtml(row.profiles?.full_name || row.profiles?.email || '')}</p>
        <p class="muted" style="font-size:12px;margin:0;">${escapeHtml(row.courses?.title || '')}</p>
      </div>
      ${total > 0 ? `<span class="badge">${total}</span>` : ''}
    `;
    div.addEventListener('click', () => {
      window.location.href = `course.html?course=${row.course_id}&student=${row.student_id}&admin=1`;
    });
    listEl.appendChild(div);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
