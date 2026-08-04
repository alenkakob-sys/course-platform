import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Використовує Admin API Supabase (потребує service_role, тому лише сервер).
// Створює користувача і одразу шле лист-запрошення з посиланням для входу
// (той самий принцип без паролів, що й у звичайному magic link) — п.3.2 ТЗ.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });

  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL}/courses`;

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (error) {
    return res.status(400).json({ error: error.message });
  }
  return res.status(200).json({ ok: true, userId: data.user.id });
}
