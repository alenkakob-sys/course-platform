alter table public.lessons
  add column if not exists homework_enabled boolean not null default false,
  add column if not exists homework_require_text boolean not null default false,
  add column if not exists homework_require_photo boolean not null default false,
  add column if not exists homework_require_video boolean not null default false;

update public.lessons
set
  homework_enabled = true,
  homework_require_text = homework_require_text or homework_type = 'text',
  homework_require_photo = homework_require_photo or homework_type = 'photo',
  homework_require_video = homework_require_video or homework_type = 'video'
where homework_type is not null;
