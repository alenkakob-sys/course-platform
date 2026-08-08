-- Private R2 metadata for course materials and student progress used by lesson access rules.
alter table public.presentations
  add column if not exists file_key text not null default '',
  add column if not exists file_name text not null default '',
  add column if not exists file_content_type text not null default '';

alter table public.lessons
  add column if not exists presentation_file_key text not null default '',
  add column if not exists presentation_file_name text not null default '',
  add column if not exists presentation_file_content_type text not null default '';

alter table public.videos
  add column if not exists source_type text not null default 'youtube',
  add column if not exists file_key text not null default '',
  add column if not exists file_name text not null default '',
  add column if not exists file_content_type text not null default '';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'videos_source_type_check') then
    alter table public.videos
      add constraint videos_source_type_check check (source_type in ('youtube', 'r2'));
  end if;
end $$;

create table if not exists public.lesson_progress (
  student_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  first_opened_at timestamptz not null default now(),
  homework_submitted_at timestamptz,
  homework_review_status text not null default 'pending' check (homework_review_status in ('pending', 'accepted', 'revision')),
  reviewed_at timestamptz,
  primary key (student_id, lesson_id)
);

alter table public.lesson_progress enable row level security;

drop policy if exists "lesson progress: student or admin read" on public.lesson_progress;
create policy "lesson progress: student or admin read" on public.lesson_progress
  for select using (student_id = auth.uid() or public.is_admin());

drop policy if exists "lesson progress: student starts and submits" on public.lesson_progress;
create policy "lesson progress: student starts and submits" on public.lesson_progress
  for insert with check (student_id = auth.uid());

drop policy if exists "lesson progress: student updates own" on public.lesson_progress;
create policy "lesson progress: student updates own" on public.lesson_progress
  for update using (student_id = auth.uid() or public.is_admin())
  with check (student_id = auth.uid() or public.is_admin());
