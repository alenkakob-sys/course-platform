-- Email-only access plans: no Auth email is sent and no Auth user is created.
create table if not exists public.pending_students (
  email text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.pending_course_access (
  email text not null references public.pending_students (email) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  primary key (email, course_id)
);

alter table public.pending_students enable row level security;
alter table public.pending_course_access enable row level security;

drop policy if exists "pending students: admin manages" on public.pending_students;
create policy "pending students: admin manages" on public.pending_students
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "pending course access: admin manages" on public.pending_course_access;
create policy "pending course access: admin manages" on public.pending_course_access
  for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);

  insert into public.course_access (student_id, course_id)
  select new.id, pending.course_id
  from public.pending_course_access as pending
  where pending.email = lower(new.email)
  on conflict do nothing;

  delete from public.pending_students where email = lower(new.email);
  return new;
end;
$$ language plpgsql security definer set search_path = public;
