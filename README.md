# Сайт курсів — стартовий код

Реалізовано відповідно до ТЗ: гнучкі курси/уроки, вхід за magic link,
незалежний чат по кожному уроку з непрочитаними, Telegram-інтеграція,
мобільний інтерфейс.

## Що вже працює

- Вхід через email (magic link, без паролів) — `pages/login.js`
- Екран вибору курсу з бейджами непрочитаних — `pages/courses/index.js`
- Мобільний екран курсу: горизонтальна стрічка уроків, відео (YouTube,
  режим без cookie), незалежні розділи "Опис" / "Домашнє завдання" / "Чат"
  — `components/CourseView.js`
- Чат: окремий тред на кожну пару учениця+урок, свій перемикач вкладок
  всередині чату (не залежить від того, яке відео відкрите), непрочитані
  по кожній вкладці, realtime — `components/ChatPanel.js`, `lib/chat.js`
- Адмінка: список учениць з непрочитаними → той самий екран курсу в
  режимі перегляду конкретної учениці — `pages/admin/**`
- **Керування курсами й уроками з інтерфейсу сайту** (без Table Editor):
  створення/редагування курсів, презентації, уроків (назва, мітка, опис,
  тип ДЗ), відео, а також запрошення нових учениць по email і видача
  доступу до курсів — `pages/admin/manage/**`
- Telegram: пересилання нового повідомлення учениці боту з deep link на
  чат при першому повідомленні треду, приймання відповідей адмінки
  реплаєм — `pages/api/telegram/*.js`, `lib/telegram.js`
- Повна схема бази з розмежуванням доступу (RLS) — `supabase/schema.sql`
- Домашнє завдання — базове поле для відправки (текст/фото/відео),
  **без** автоматичного відкриття наступного уроку — це навмисно
  Фаза 2 за ТЗ, не поточний обсяг.

## Чого ще немає (наступні кроки)

- Логіка Фази 2 (автоматичне відкриття наступного уроку після ДЗ).
- Візуальне полірування (зараз — робочі, але мінімально оформлені екрани).
- Продакшн-надійна пошта: за замовчуванням Supabase шле листи входу через
  вбудований сервіс, обмежений 2 листами/годину на весь проєкт — цього не
  вистачить на кількох одночасних учениць. Потрібно підключити безкоштовний
  SMTP (Mailtrap або Resend) через Authentication → SMTP Settings.

## 1. Встановлення локально

```bash
npm install
cp .env.local.example .env.local
# заповнити .env.local значеннями з кроку 2 і 3 нижче
npm run dev
```

## 2. Налаштування Supabase (безкоштовний тариф)

1. Створіть проєкт на [supabase.com](https://supabase.com) (безкоштовно).
2. Project Settings → API → скопіюйте `Project URL` і `anon public key`
   у `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`),
   а `service_role key` — у `SUPABASE_SERVICE_ROLE_KEY`.
3. SQL Editor → вставте весь вміст `supabase/schema.sql` → Run.
4. Authentication → Providers → переконайтесь, що Email увімкнено, а
   "Confirm email" вимкнено або налаштовано під magic link (за
   замовчуванням Supabase Auth вже підтримує `signInWithOtp`, який
   використовує `pages/login.js`).
5. Storage → створіть два публічні бакети: `chat-attachments` та
   `homework` (для вкладень у чаті й файлів домашніх завдань).
6. Щоб зробити себе адміном: зареєструйтесь через `/login` на сайті
   (отримайте лист і увійдіть), а тоді в SQL Editor виконайте:
   ```sql
   update profiles set role = 'admin' where email = 'ваш-email@приклад.com';
   ```
7. Наповніть курси й уроки через Table Editor: таблиці `courses`,
   `lessons`, `videos`, `presentations`, `course_access` (останню — щоб
   видати учениці доступ до курсу).

### Проти "засинання" безкоштовного тарифу

Безкоштовний Supabase призупиняє проєкт після 7 днів без запитів.
Безкоштовне рішення: налаштуйте пінг сайту раз на 2-3 дні через
[cron-job.org](https://cron-job.org) (безкоштовно) — просто відкриває
головну сторінку сайту за розкладом.

## 3. Налаштування Telegram-бота

1. У Telegram напишіть [@BotFather](https://t.me/BotFather) → `/newbot`
   → отримаєте токен → у `.env.local` як `TELEGRAM_BOT_TOKEN`.
2. Дізнайтесь свій `chat_id`: напишіть боту що-небудь, потім відкрийте
   `https://api.telegram.org/bot<ТОКЕН>/getUpdates` у браузері — там
   буде `"chat":{"id": ...}` → це `TELEGRAM_ADMIN_CHAT_ID`.
3. Придумайте випадковий рядок для `TELEGRAM_WEBHOOK_SECRET` (будь-які
   символи, це просто пароль для перевірки, що запит справді від Telegram).
4. **Після деплою сайту** (крок 4) зареєструйте webhook — просто відкрийте
   в браузері таку адресу (підставивши свій токен, адресу сайту й секрет):
   ```
   https://api.telegram.org/bot<ТОКЕН>/setWebhook?url=https://ваш-сайт.netlify.app/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>
   ```
   Якщо все правильно, побачите на сторінці `{"ok":true,"result":true,...}`.

## 4. Розгортання (Netlify або Vercel)

1. Заведіть git-репозиторій і запуште цей код (наприклад, на GitHub).
2. На [netlify.com](https://netlify.com) або [vercel.com](https://vercel.com):
   "New site from Git" → оберіть репозиторій → фреймворк визначиться
   автоматично (Next.js).
3. У налаштуваннях проєкту додайте всі змінні з `.env.local` (крім
   коментарів) — Environment variables.
4. Deploy. Після першого успішного деплою виконайте крок 4 з розділу
   Telegram вище (setWebhook), підставивши реальну адресу сайту.

## Структура проєкту

```
supabase/schema.sql       — уся база даних одним файлом
lib/                       — supabase-клієнти, чат, telegram, авторизація
components/                — TopBar, LessonStrip, VideoPlayer, Accordion,
                              ChatPanel, HomeworkField, PresentationBlock,
                              CourseView (збирає все разом)
pages/login.js              — вхід
pages/courses/              — екрани учениці
pages/admin/                — екрани адмінки
pages/api/telegram/         — webhook + пересилання повідомлень
```
