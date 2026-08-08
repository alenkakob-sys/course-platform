/**
 * @typedef {'text' | 'photo' | 'video'} HomeworkFormat
 * @typedef {'free' | 'after_submission' | 'after_review' | 'after_delay' | 'scheduled'} NextLessonAccessRule
 *
 * @typedef {Object} Lesson
 * @property {string} id
 * @property {string} course_id
 * @property {string|null} parent_lesson_id
 * @property {string} title
 * @property {string} short_label
 * @property {string} description
 * @property {boolean} homework_enabled
 * @property {boolean} homework_require_text
 * @property {boolean} homework_require_photo
 * @property {boolean} homework_require_video
 * @property {string} homework_description
 * @property {string} presentation_url
 * @property {NextLessonAccessRule} next_lesson_access_rule
 * @property {number} next_lesson_delay_hours
 * @property {number} next_lesson_delay_days
 * @property {string} next_lesson_unlock_time
 * @property {number} order_index
 * @property {Array<Object>} videos
 */

export const HOMEWORK_REQUIREMENTS = Object.freeze([
  Object.freeze({ format: 'text', field: 'homework_require_text', label: 'Текст', validationLabel: 'текст' }),
  Object.freeze({ format: 'photo', field: 'homework_require_photo', label: 'Фото', validationLabel: 'фото' }),
  Object.freeze({ format: 'video', field: 'homework_require_video', label: 'Відео', validationLabel: 'відео' }),
]);

export const NEXT_LESSON_ACCESS_RULES = Object.freeze([
  Object.freeze({ value: 'free', label: 'Вільний доступ' }),
  Object.freeze({ value: 'after_submission', label: 'Після здачі ДЗ' }),
  Object.freeze({ value: 'after_review', label: 'Після перевірки ДЗ' }),
  Object.freeze({ value: 'after_delay', label: 'Через час' }),
  Object.freeze({ value: 'scheduled', label: 'За графіком' }),
]);

export const ADMIN_LESSON_SELECT = `
  id,
  course_id,
  parent_lesson_id,
  title,
  short_label,
  description,
  homework_enabled,
  homework_require_text,
  homework_require_photo,
  homework_require_video,
  homework_description,
  presentation_url,
  next_lesson_access_rule,
  next_lesson_delay_hours,
  next_lesson_delay_days,
  next_lesson_unlock_time,
  order_index,
  videos(id, youtube_id, title, order_index)
`;

export const STUDENT_LESSON_SELECT = `
  id,
  course_id,
  parent_lesson_id,
  title,
  short_label,
  description,
  homework_enabled,
  homework_require_text,
  homework_require_photo,
  homework_require_video,
  homework_description,
  presentation_url,
  next_lesson_access_rule,
  next_lesson_delay_hours,
  next_lesson_delay_days,
  next_lesson_unlock_time,
  order_index,
  videos(youtube_id, title, order_index)
`;

/** @param {Object} row @returns {Lesson} */
export function normalizeLesson(row) {
  return {
    ...row,
    title: row.title || '',
    short_label: row.short_label || '',
    description: row.description || '',
    homework_enabled: Boolean(row.homework_enabled),
    homework_require_text: Boolean(row.homework_require_text),
    homework_require_photo: Boolean(row.homework_require_photo),
    homework_require_video: Boolean(row.homework_require_video),
    homework_description: row.homework_description || '',
    presentation_url: row.presentation_url || '',
    next_lesson_access_rule: NEXT_LESSON_ACCESS_RULES.some(({ value }) => value === row.next_lesson_access_rule)
      ? row.next_lesson_access_rule
      : 'free',
    next_lesson_delay_hours: Math.max(1, Number(row.next_lesson_delay_hours) || 24),
    next_lesson_delay_days: Math.max(1, Number(row.next_lesson_delay_days) || 1),
    next_lesson_unlock_time: /^\d{2}:\d{2}/.test(row.next_lesson_unlock_time || '') ? row.next_lesson_unlock_time.slice(0, 5) : '09:00',
    videos: [...(row.videos || [])].sort((a, b) => a.order_index - b.order_index),
  };
}

/** @param {Lesson} lesson */
export function getRequiredHomeworkFormats(lesson) {
  return HOMEWORK_REQUIREMENTS.filter(({ field }) => lesson[field]);
}
