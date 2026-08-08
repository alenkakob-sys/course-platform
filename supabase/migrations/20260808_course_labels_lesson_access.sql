-- Editable display label for the course card and lesson-level access rules.
alter table public.courses
  add column if not exists short_label text not null default '';

alter table public.lessons
  add column if not exists presentation_url text not null default '',
  add column if not exists next_lesson_access_rule text not null default 'free',
  add column if not exists next_lesson_delay_hours integer not null default 24,
  add column if not exists next_lesson_delay_days integer not null default 1,
  add column if not exists next_lesson_unlock_time time without time zone not null default time '09:00';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'lessons_next_lesson_access_rule_check'
  ) then
    alter table public.lessons
      add constraint lessons_next_lesson_access_rule_check
      check (next_lesson_access_rule in ('free', 'after_submission', 'after_review', 'after_delay', 'scheduled'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'lessons_next_lesson_delay_hours_check'
  ) then
    alter table public.lessons
      add constraint lessons_next_lesson_delay_hours_check check (next_lesson_delay_hours >= 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'lessons_next_lesson_delay_days_check'
  ) then
    alter table public.lessons
      add constraint lessons_next_lesson_delay_days_check check (next_lesson_delay_days >= 1);
  end if;
end $$;
