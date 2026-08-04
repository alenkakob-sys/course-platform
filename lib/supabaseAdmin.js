import { createClient } from '@supabase/supabase-js';

// УВАГА: використовувати лише в серверному коді (pages/api/**),
// ніколи не імпортувати в компоненти, що виконуються в браузері —
// service role key обходить RLS і дає повний доступ до бази.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
