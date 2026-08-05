import { supabase } from '../supabaseClient.js';
import { requireAdmin } from '../auth.js';
import { FUNCTIONS_URL } from '../config.js';

const auth = await requireAdmin();
if (auth) {
  const listEl = document.getElementById('students-list');
  const statusEl = document.getElementById('invite-status');

  async function load() {
    const [{ data: students }, { data: courses }, { data: accessData }] = await Promise.all([
      supabase.from('profiles').select('id, email, full_name').eq('role', 'student').order('email'),
      supabase.from('courses').select('id, title').order('order_index'),
      supabase.from('course_access').select('student_id, course_id'),
    ]);

    const access = {};
    (accessData || []).forEach((row) => {
      if (!access[row.student_id]) access[row.student_id] = new Set();
      access[row.student_id].add(row.course_id);
    });

    listEl.innerHTML = '';
    for (const s of students || []) {
      const div = document.createElement('div');
      div.style.padding = '10px 0';
      div.style.borderBottom = '1px solid var(--border)';
      div.innerHTML = `<p style="font-size:14px;margin:0 0 6px;">${escapeHtml(s.full_name || s.email)}</p>`;

      const checksWrap = document.createElement('div');
      checksWrap.style.display = 'flex';
      checksWrap.style.gap = '12px';
      checksWrap.style.flexWrap = 'wrap';

      for (const c of courses || []) {
        const has = access[s.id]?.has(c.id) || false;
        const label = document.createElement('label');
        label.style.fontSize = '12px';
        label.style.display = 'flex';
        label.style.alignItems = 'center';
        label.style.gap = '4px';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = has;
        checkbox.addEventListener('change', async () => {
          if (has) {
            await supabase.from('course_access').delete().eq('student_id', s.id).eq('course_id', c.id);
          } else {
            await supabase.from('course_access').insert({ student_id: s.id, course_id: c.id });
          }
          load();
        });
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(c.title));
        checksWrap.appendChild(label);
      }

      div.appendChild(checksWrap);
      listEl.appendChild(div);
    }
  }

  document.getElementById('invite-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById('invite-email');
    statusEl.style.display = 'block';
    statusEl.className = '';
    statusEl.textContent = 'Надсилаємо…';

    try {
      const res = await fetch(`${FUNCTIONS_URL}/invite-student`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput.value }),
      });
      if (!res.ok) throw new Error('failed');
      statusEl.className = 'success-text';
      statusEl.textContent = 'Запрошення надіслано ✓';
      emailInput.value = '';
      load();
    } catch (err) {
      console.error(err);
      statusEl.className = 'error-text';
      statusEl.textContent = 'Не вдалось надіслати. Можливо, ця пошта вже зареєстрована.';
    }
  });

  load();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
