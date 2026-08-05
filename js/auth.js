import { supabase } from './supabaseClient.js';

// Повертає { session, profile } або null, якщо не залогінені.
export async function getSessionAndProfile() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', session.user.id)
    .single();
  return { session, profile };
}

// Викликати на початку кожної сторінки для учениць/адмінки.
// Якщо не залогінені — редіректить на login.html і повертає null.
export async function requireAuth() {
  const result = await getSessionAndProfile();
  if (!result) {
    window.location.href = 'login.html';
    return null;
  }
  return result;
}

// Те саме, але для сторінок адмінки — не-адмінів відправляє на courses.html.
export async function requireAdmin() {
  const result = await requireAuth();
  if (!result) return null;
  if (result.profile?.role !== 'admin') {
    window.location.href = 'courses.html';
    return null;
  }
  return result;
}

export async function logout() {
  await supabase.auth.signOut();
  window.location.href = 'login.html';
}

export function wireLogoutButton(el) {
  if (el) el.addEventListener('click', logout);
}
