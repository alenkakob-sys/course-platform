-- Ручне відкриття уроку адміністраторкою.
--
-- Навіщо окрема таблиця, а не поле в lesson_progress: рядок lesson_progress
-- означає «учениця відкривала урок», і його first_opened_at запускає відлік
-- для правил «через час» та «за графіком». Якби ручне відкриття писалось туди,
-- воно мовчки стартувало б цей відлік для наступного уроку.
--
-- Домашнє завдання може прийти в Інстаграм, а не через сайт, тому відкриття
-- не залежить від того, чи щось завантажено на платформу.

create table if not exists public.lesson_unlocks (
  student_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (student_id, lesson_id)
);

alter table public.lesson_unlocks enable row level security;

drop policy if exists "lesson unlocks: own or admin read" on public.lesson_unlocks;
create policy "lesson unlocks: own or admin read" on public.lesson_unlocks
  for select using (student_id = auth.uid() or public.is_admin());

drop policy if exists "lesson unlocks: admin writes" on public.lesson_unlocks;
create policy "lesson unlocks: admin writes" on public.lesson_unlocks
  for all using (public.is_admin()) with check (public.is_admin());
