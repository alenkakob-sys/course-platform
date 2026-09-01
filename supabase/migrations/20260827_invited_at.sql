-- Дата, коли адміністраторка внесла пошту в систему.
-- Досі зберігалась лише created_at профілю — тобто момент ПЕРШОГО ВХОДУ, а
-- запис у черзі з реальною датою додавання зникав саме тоді ж. Тепер дата
-- переїжджає в профіль і переживає перший вхід.
alter table public.profiles
  add column if not exists invited_at timestamptz;

-- Заповнюємо для тих, хто вже є: беремо дату з черги, якщо запис ще лежить,
-- інакше — дату створення профілю як найкраще наближення.
update public.profiles p
set invited_at = coalesce(
  (select ps.created_at from public.pending_students ps where lower(ps.email) = lower(p.email)),
  p.created_at
)
where p.invited_at is null;

-- Адміністраторка має право проставити дату вже наявній учениці.
-- Досі в profiles була лише політика читання, тож будь-яка спроба запису
-- мовчки відхилялась.
drop policy if exists "profiles: admin updates" on public.profiles;
create policy "profiles: admin updates" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- При першому вході переносимо дату з черги в профіль.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  invited timestamptz;
begin
  select created_at into invited
  from public.pending_students
  where email = lower(new.email);

  insert into public.profiles (id, email, invited_at)
  values (new.id, new.email, coalesce(invited, now()));

  insert into public.course_access (student_id, course_id)
  select new.id, pending.course_id
  from public.pending_course_access as pending
  where pending.email = lower(new.email)
  on conflict do nothing;

  delete from public.pending_students where email = lower(new.email);
  return new;
end;
$$ language plpgsql security definer set search_path = public;
