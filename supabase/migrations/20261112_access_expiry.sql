-- Доступ на обмежений строк (місячна підписка).
--
-- Правило дати: купила 12-го → доступ працює весь день 12-го наступного
-- місяця, а 13-го вже закритий. Тому в expires_at лежить ПОЧАТОК 13-го:
-- порівняння expires_at > now() саме це й означає.
-- 31 січня + 1 місяць Postgres сам підтягує до 28/29 лютого.

alter table public.course_access
  add column if not exists expires_at timestamptz;

-- Для тих, хто ще не заходив, дати початку немає: зберігаємо лише НАМІР.
-- Реальний строк рахуємо в момент першого входу.
alter table public.pending_course_access
  add column if not exists months integer;

-- ---------------------------------------------------------------------------
-- Головне: строк мусить перевірятися в самій базі.
-- Якщо лишити перевірку тільки на сторінці, учениця з простроченим доступом
-- просто не оновить вкладку — і курс лишиться в неї відкритим.
-- ---------------------------------------------------------------------------
create or replace function public.has_course_access(target uuid)
returns boolean as $$
  select exists (
    select 1 from public.course_access ca
    where ca.course_id = target
      and ca.student_id = auth.uid()
      and (ca.expires_at is null or ca.expires_at > now())
  );
$$ language sql security definer stable set search_path = public;

drop policy if exists "courses: accessible or admin" on public.courses;
create policy "courses: accessible or admin" on public.courses
  for select using (public.is_admin() or public.has_course_access(courses.id));

drop policy if exists "lessons: accessible or admin" on public.lessons;
create policy "lessons: accessible or admin" on public.lessons
  for select using (public.is_admin() or public.has_course_access(lessons.course_id));

drop policy if exists "videos: accessible or admin" on public.videos;
create policy "videos: accessible or admin" on public.videos
  for select using (
    public.is_admin() or exists (
      select 1 from public.lessons l
      where l.id = videos.lesson_id and public.has_course_access(l.course_id)
    )
  );

drop policy if exists "presentations: accessible or admin" on public.presentations;
create policy "presentations: accessible or admin" on public.presentations
  for select using (public.is_admin() or public.has_course_access(presentations.course_id));

-- ---------------------------------------------------------------------------
-- Перший вхід: намір із черги перетворюємо на конкретну дату.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
declare invited timestamptz;
begin
  select created_at into invited
  from public.pending_students
  where email = lower(new.email);

  insert into public.profiles (id, email, invited_at)
  values (new.id, new.email, coalesce(invited, now()));

  insert into public.course_access (student_id, course_id, expires_at)
  select
    new.id,
    pending.course_id,
    case
      when pending.months is null then null
      else date_trunc('day', now())
           + (pending.months || ' months')::interval
           + interval '1 day'
    end
  from public.pending_course_access as pending
  where pending.email = lower(new.email)
  on conflict do nothing;

  delete from public.pending_students where email = lower(new.email);
  return new;
end;
$$ language plpgsql security definer set search_path = public;
