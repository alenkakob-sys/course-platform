-- ============================================================================
-- СХЕМА БАЗИ ДАНИХ ДЛЯ САЙТУ КУРСІВ
-- Виконати повністю у Supabase -> SQL Editor одним запуском.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. ПРОФІЛІ (розширення auth.users)
-- role: 'student' | 'admin'. Власниця курсів отримує role = 'admin' вручну
-- (одним SQL-запитом після реєстрації, див. README).
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'student' check (role in ('student', 'admin')),
  created_at timestamptz not null default now()
);

-- Автоматично створює профіль при реєстрації нового користувача
create function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Допоміжна функція: чи є поточний користувач адміном
create function is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable set search_path = public;

-- ---------------------------------------------------------------------------
-- 2. КУРСИ ТА УРОКИ (структуру повністю задає адмінка, нічого не зашито)
-- ---------------------------------------------------------------------------
create table courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

create table lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id) on delete cascade,
  parent_lesson_id uuid references lessons (id) on delete cascade, -- для частин (7.1 / 7.2)
  title text not null,
  short_label text not null default '', -- коротка мітка для стрічки уроків, напр. "7.1"
  description text default '',
  homework_type text check (homework_type in ('text', 'photo', 'video')), -- null = без ДЗ
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

create table videos (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons (id) on delete cascade,
  youtube_id text not null, -- лише ID відео, без повного посилання
  title text default '',
  order_index integer not null default 0
);

-- опціональна презентація курсу (п. 2.1 ТЗ) — embed-посилання Google Slides
create table presentations (
  course_id uuid primary key references courses (id) on delete cascade,
  embed_url text not null
);

-- ---------------------------------------------------------------------------
-- 3. ДОСТУП УЧНІВ ДО КУРСІВ (окремо по кожному курсу)
-- ---------------------------------------------------------------------------
create table course_access (
  student_id uuid not null references profiles (id) on delete cascade,
  course_id uuid not null references courses (id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (student_id, course_id)
);

-- ---------------------------------------------------------------------------
-- 4. ЧАТ: треди + повідомлення. lesson_id = null означає "Загальний" тред.
-- Один тред на пару (учень, курс, урок/загальний) — незалежний від того,
-- яке відео зараз відкрите (див. п.10 ТЗ).
-- ---------------------------------------------------------------------------
create table chat_threads (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles (id) on delete cascade,
  course_id uuid not null references courses (id) on delete cascade,
  lesson_id uuid references lessons (id) on delete cascade, -- null = загальний
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  unique (student_id, course_id, lesson_id)
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references chat_threads (id) on delete cascade,
  sender_role text not null check (sender_role in ('student', 'admin')),
  body text default '',
  attachment_url text,
  created_at timestamptz not null default now()
);

-- Простий трекер прочитаного: коли хто востаннє відкривав тред
create table thread_reads (
  thread_id uuid not null references chat_threads (id) on delete cascade,
  reader_role text not null check (reader_role in ('student', 'admin')),
  last_read_at timestamptz not null default now(),
  primary key (thread_id, reader_role)
);

-- Відповідність "повідомлення в Telegram -> тред на сайті" (п.6 ТЗ),
-- потрібна щоб реплаї адмінки в Telegram потрапляли у правильний чат.
create table telegram_message_map (
  telegram_message_id bigint primary key,
  thread_id uuid not null references chat_threads (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- оновлює last_message_at треду при новому повідомленні
create function touch_thread()
returns trigger as $$
begin
  update chat_threads set last_message_at = now() where id = new.thread_id;
  return new;
end;
$$ language plpgsql;

create trigger on_new_message
  after insert on chat_messages
  for each row execute procedure touch_thread();

-- ---------------------------------------------------------------------------
-- 5. ДОМАШНІ ЗАВДАННЯ (фаза 2, п.7 ТЗ) — таблиця закладена одразу,
-- щоб не міняти схему пізніше.
-- ---------------------------------------------------------------------------
create table homework_submissions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles (id) on delete cascade,
  lesson_id uuid not null references lessons (id) on delete cascade,
  submission_type text not null check (submission_type in ('text', 'photo', 'video')),
  text_content text,
  file_url text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  review_note text,
  unique (student_id, lesson_id)
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table profiles enable row level security;
alter table courses enable row level security;
alter table lessons enable row level security;
alter table videos enable row level security;
alter table presentations enable row level security;
alter table course_access enable row level security;
alter table chat_threads enable row level security;
alter table chat_messages enable row level security;
alter table thread_reads enable row level security;
alter table homework_submissions enable row level security;

-- profiles
create policy "profiles: self or admin can read" on profiles
  for select using (id = auth.uid() or is_admin());

-- courses: видно лише ті, до яких є доступ (або все, якщо адмін)
create policy "courses: accessible or admin" on courses
  for select using (
    is_admin() or exists (
      select 1 from course_access ca
      where ca.course_id = courses.id and ca.student_id = auth.uid()
    )
  );
create policy "courses: admin manages" on courses
  for all using (is_admin()) with check (is_admin());

-- lessons / videos / presentations: той самий принцип через курс
create policy "lessons: accessible or admin" on lessons
  for select using (
    is_admin() or exists (
      select 1 from course_access ca
      where ca.course_id = lessons.course_id and ca.student_id = auth.uid()
    )
  );
create policy "lessons: admin manages" on lessons
  for all using (is_admin()) with check (is_admin());

create policy "videos: accessible or admin" on videos
  for select using (
    is_admin() or exists (
      select 1 from lessons l
      join course_access ca on ca.course_id = l.course_id
      where l.id = videos.lesson_id and ca.student_id = auth.uid()
    )
  );
create policy "videos: admin manages" on videos
  for all using (is_admin()) with check (is_admin());

create policy "presentations: accessible or admin" on presentations
  for select using (
    is_admin() or exists (
      select 1 from course_access ca
      where ca.course_id = presentations.course_id and ca.student_id = auth.uid()
    )
  );
create policy "presentations: admin manages" on presentations
  for all using (is_admin()) with check (is_admin());

-- course_access: учень бачить лише свій доступ; керує тільки адмін
create policy "course_access: self or admin read" on course_access
  for select using (student_id = auth.uid() or is_admin());
create policy "course_access: admin manages" on course_access
  for all using (is_admin()) with check (is_admin());

-- chat_threads: учень бачить лише свої треди; адмін бачить усі
create policy "threads: self or admin" on chat_threads
  for select using (student_id = auth.uid() or is_admin());
create policy "threads: self or admin create" on chat_threads
  for insert with check (student_id = auth.uid() or is_admin());

-- chat_messages: доступ через приналежність треду
create policy "messages: read own thread" on chat_messages
  for select using (
    is_admin() or exists (
      select 1 from chat_threads t
      where t.id = chat_messages.thread_id and t.student_id = auth.uid()
    )
  );
create policy "messages: write to own thread" on chat_messages
  for insert with check (
    (sender_role = 'student' and exists (
      select 1 from chat_threads t
      where t.id = chat_messages.thread_id and t.student_id = auth.uid()
    ))
    or (sender_role = 'admin' and is_admin())
  );

create policy "thread_reads: self or admin" on thread_reads
  for all using (
    is_admin() or exists (
      select 1 from chat_threads t
      where t.id = thread_reads.thread_id and t.student_id = auth.uid()
    )
  ) with check (
    is_admin() or exists (
      select 1 from chat_threads t
      where t.id = thread_reads.thread_id and t.student_id = auth.uid()
    )
  );

-- homework_submissions: учень працює лише зі своїми, адмін бачить/оцінює всі
create policy "homework: self or admin read" on homework_submissions
  for select using (student_id = auth.uid() or is_admin());
create policy "homework: self insert" on homework_submissions
  for insert with check (student_id = auth.uid());
create policy "homework: admin review" on homework_submissions
  for update using (is_admin());

-- ---------------------------------------------------------------------------
-- 6. VIEW: непрочитані повідомлення по кожному треду, для обох сторін.
-- security_invoker = вьюха виконується з правами того, хто робить запит,
-- тобто RLS таблиці chat_threads сама розмежовує, хто що побачить:
-- учень отримає рядки лише своїх тредів, адмін — усі.
-- ---------------------------------------------------------------------------
create view thread_unread_counts
with (security_invoker = true) as
select
  t.id as thread_id,
  t.student_id,
  t.course_id,
  t.lesson_id,
  coalesce(sc.cnt, 0) as unread_for_student,
  coalesce(ac.cnt, 0) as unread_for_admin
from chat_threads t
left join lateral (
  select count(*) as cnt
  from chat_messages m
  left join thread_reads r on r.thread_id = t.id and r.reader_role = 'student'
  where m.thread_id = t.id
    and m.sender_role = 'admin'
    and m.created_at > coalesce(r.last_read_at, 'epoch'::timestamptz)
) sc on true
left join lateral (
  select count(*) as cnt
  from chat_messages m
  left join thread_reads r on r.thread_id = t.id and r.reader_role = 'admin'
  where m.thread_id = t.id
    and m.sender_role = 'student'
    and m.created_at > coalesce(r.last_read_at, 'epoch'::timestamptz)
) ac on true;

-- telegram_message_map навмисно без RLS-читання для клієнта:
-- до неї звертається лише сервер (service role) із webhook-функції.
alter table telegram_message_map enable row level security;
create policy "telegram_map: admin only" on telegram_message_map
  for all using (is_admin()) with check (is_admin());

-- ============================================================================
-- REALTIME: без цього повідомлення в чаті зберігаються, але екран
-- про них не дізнається без перезавантаження сторінки.
-- ============================================================================
alter publication supabase_realtime add table chat_messages;
