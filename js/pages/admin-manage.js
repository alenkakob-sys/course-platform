import { supabase } from '../supabaseClient.js';
import { requireAdmin } from '../auth.js';

const auth = await requireAdmin();
if (auth) {
  const listEl = document.getElementById('course-list');

  async function load() {
    const { data: courses } = await supabase.from('courses').select('id, title, order_index').order('order_index');
    listEl.innerHTML = '';
    for (const c of courses || []) {
      const row = document.createElement('div');
      row.className = 'card-row';
      row.innerHTML = `<span style="flex:1;font-size:14px;">${escapeHtml(c.title)}</span><span class="muted">›</span>`;
      row.addEventListener('click', () => { window.location.href = `admin-manage-course.html?course=${c.id}`; });
      listEl.appendChild(row);
    }
    return courses || [];
  }

  const courses = await load();

  document.getElementById('add-course').addEventListener('click', async () => {
    const { data, error } = await supabase.from('courses').insert({ title: 'Новий курс', order_index: courses.length }).select('id').single();
    if (!error) window.location.href = `admin-manage-course.html?course=${data.id}`;
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
