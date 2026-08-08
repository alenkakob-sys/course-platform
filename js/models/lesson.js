/**
 * @typedef {'text' | 'photo' | 'video'} HomeworkFormat
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
 * @property {number} order_index
 * @property {Array<Object>} videos
 */

export const HOMEWORK_REQUIREMENTS = Object.freeze([
  Object.freeze({ format: 'text', field: 'homework_require_text', label: 'Текст', validationLabel: 'текст' }),
  Object.freeze({ format: 'photo', field: 'homework_require_photo', label: 'Фото', validationLabel: 'фото' }),
  Object.freeze({ format: 'video', field: 'homework_require_video', label: 'Відео', validationLabel: 'відео' }),
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
    videos: [...(row.videos || [])].sort((a, b) => a.order_index - b.order_index),
  };
}

/** @param {Lesson} lesson */
export function getRequiredHomeworkFormats(lesson) {
  return HOMEWORK_REQUIREMENTS.filter(({ field }) => lesson[field]);
}
