import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useProfile } from '@/lib/useProfile';
import { supabase } from '@/lib/supabaseClient';

export default function ManageCourse() {
  const router = useRouter();
  const { courseId } = router.query;
  const { loading, profile } = useProfile();
  const [course, setCourse] = useState(null);
  const [presentationUrl, setPresentationUrl] = useState('');
  const [lessons, setLessons] = useState([]);

  useEffect(() => {
    if (!profile || !courseId) return;
    if (profile.role !== 'admin') {
      router.replace('/courses');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, courseId]);

  async function load() {
    const [{ data: courseData }, { data: presentation }, { data: lessonsData }] = await Promise.all([
      supabase.from('courses').select('id, title, order_index').eq('id', courseId).single(),
      supabase.from('presentations').select('embed_url').eq('course_id', courseId).maybeSingle(),
      supabase
        .from('lessons')
        .select('id, title, short_label, description, homework_type, order_index, videos(id, youtube_id, order_index)')
        .eq('course_id', courseId)
        .order('order_index'),
    ]);
    setCourse(courseData);
    setPresentationUrl(presentation?.embed_url || '');
    setLessons(lessonsData || []);
  }

  async function saveCourseTitle(title) {
    await supabase.from('courses').update({ title }).eq('id', courseId);
  }

  async function savePresentation() {
    if (presentationUrl.trim()) {
      await supabase.from('presentations').upsert({ course_id: courseId, embed_url: presentationUrl.trim() });
    } else {
      await supabase.from('presentations').delete().eq('course_id', courseId);
    }
  }

  async function addLesson() {
    await supabase.from('lessons').insert({
      course_id: courseId,
      title: 'Новий урок',
      short_label: String(lessons.length),
      order_index: lessons.length,
    });
    load();
  }

  async function deleteLesson(lessonId) {
    if (!confirm('Видалити урок разом з відео? Дію не можна скасувати.')) return;
    await supabase.from('lessons').delete().eq('id', lessonId);
    load();
  }

  async function moveLesson(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= lessons.length) return;
    const a = lessons[index];
    const b = lessons[target];
    await Promise.all([
      supabase.from('lessons').update({ order_index: b.order_index }).eq('id', a.id),
      supabase.from('lessons').update({ order_index: a.order_index }).eq('id', b.id),
    ]);
    load();
  }

  if (loading || !course) return null;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Link href="/admin/manage" style={{ fontSize: 13, color: '#666' }}>← усі курси</Link>
      </div>

      <label style={{ fontSize: 12, color: '#888' }}>Назва курсу</label>
      <input
        defaultValue={course.title}
        onBlur={(e) => saveCourseTitle(e.target.value)}
        style={{ width: '100%', fontSize: 16, fontWeight: 500, padding: 8, marginBottom: 16, border: '1px solid #ddd', borderRadius: 6 }}
      />

      <label style={{ fontSize: 12, color: '#888' }}>
        Презентація курсу (посилання для вбудовування Google Slides, необов&apos;язково)
      </label>
      <input
        value={presentationUrl}
        onChange={(e) => setPresentationUrl(e.target.value)}
        onBlur={savePresentation}
        placeholder="https://docs.google.com/presentation/d/.../embed"
        style={{ width: '100%', fontSize: 13, padding: 8, marginBottom: 24, border: '1px solid #ddd', borderRadius: 6 }}
      />

      <h2 style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Уроки</h2>
      {lessons.map((lesson, i) => (
        <LessonCard
          key={lesson.id}
          lesson={lesson}
          isFirst={i === 0}
          isLast={i === lessons.length - 1}
          onMoveUp={() => moveLesson(i, -1)}
          onMoveDown={() => moveLesson(i, 1)}
          onDelete={() => deleteLesson(lesson.id)}
          onChanged={load}
        />
      ))}

      <button
        onClick={addLesson}
        style={{ marginTop: 8, width: '100%', padding: 10, fontSize: 14, borderRadius: 8, border: '1px dashed #ccc', background: 'none', cursor: 'pointer' }}
      >
        + Новий урок
      </button>
    </div>
  );
}

// Приймає будь-що: голий ID, youtu.be/ID, youtube.com/watch?v=ID,
// youtube.com/embed/ID, youtube.com/shorts/ID — і повертає лише сам ID.
function extractYoutubeId(input) {
  const value = input.trim();
  const patterns = [
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|shorts\/|watch\?v=))([\w-]{11})/,
  ];
  for (const re of patterns) {
    const match = value.match(re);
    if (match) return match[1];
  }
  return value; // вже схоже на голий ID — повертаємо як є
}

function LessonCard({ lesson, isFirst, isLast, onMoveUp, onMoveDown, onDelete, onChanged }) {
  const [newVideoId, setNewVideoId] = useState('');

  async function saveField(field, value) {
    await supabase.from('lessons').update({ [field]: value }).eq('id', lesson.id);
    onChanged();
  }

  async function addVideo() {
    if (!newVideoId.trim()) return;
    await supabase.from('videos').insert({
      lesson_id: lesson.id,
      youtube_id: extractYoutubeId(newVideoId),
      order_index: lesson.videos?.length || 0,
    });
    setNewVideoId('');
    onChanged();
  }

  async function deleteVideo(videoId) {
    await supabase.from('videos').delete().eq('id', videoId);
    onChanged();
  }

  return (
    <details style={{ border: '1px solid #eee', borderRadius: 8, marginBottom: 8 }}>
      <summary style={{ padding: '8px 10px', cursor: 'pointer', fontSize: 13, background: '#fafafa', display: 'flex', justifyContent: 'space-between' }}>
        <span>{lesson.short_label ? `${lesson.short_label} · ` : ''}{lesson.title}</span>
        <span style={{ color: '#999' }}>{lesson.videos?.length || 0} відео</span>
      </summary>

      <div style={{ padding: 10 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button onClick={onMoveUp} disabled={isFirst} style={{ fontSize: 12, padding: '2px 8px' }}>↑</button>
          <button onClick={onMoveDown} disabled={isLast} style={{ fontSize: 12, padding: '2px 8px' }}>↓</button>
          <button onClick={onDelete} style={{ fontSize: 12, padding: '2px 8px', color: 'crimson', marginLeft: 'auto' }}>
            Видалити урок
          </button>
        </div>

        <label style={{ fontSize: 11, color: '#888' }}>Назва уроку</label>
        <input defaultValue={lesson.title} onBlur={(e) => saveField('title', e.target.value)} style={inputStyle} />

        <label style={{ fontSize: 11, color: '#888' }}>Коротка мітка (номер у стрічці, напр. &quot;7.1&quot;)</label>
        <input defaultValue={lesson.short_label} onBlur={(e) => saveField('short_label', e.target.value)} style={inputStyle} />

        <label style={{ fontSize: 11, color: '#888' }}>Опис</label>
        <textarea defaultValue={lesson.description} onBlur={(e) => saveField('description', e.target.value)} rows={2} style={inputStyle} />

        <label style={{ fontSize: 11, color: '#888' }}>Домашнє завдання</label>
        <select
          defaultValue={lesson.homework_type || ''}
          onBlur={(e) => saveField('homework_type', e.target.value || null)}
          style={inputStyle}
        >
          <option value="">Без ДЗ</option>
          <option value="text">Текст</option>
          <option value="photo">Фото</option>
          <option value="video">Відео</option>
        </select>

        <label style={{ fontSize: 11, color: '#888', marginTop: 8, display: 'block' }}>Відео (YouTube ID)</label>
        {(lesson.videos || []).map((v) => (
          <div key={v.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 12, flex: 1, fontFamily: 'monospace' }}>{v.youtube_id}</span>
            <button onClick={() => deleteVideo(v.id)} style={{ fontSize: 11, color: 'crimson' }}>✕</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={newVideoId}
            onChange={(e) => setNewVideoId(e.target.value)}
            placeholder="напр. dQw4w9WgXcQ"
            style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
          />
          <button onClick={addVideo} style={{ fontSize: 12, padding: '0 10px' }}>+</button>
        </div>
      </div>
    </details>
  );
}

const inputStyle = {
  width: '100%',
  fontSize: 13,
  padding: 6,
  marginBottom: 8,
  border: '1px solid #ddd',
  borderRadius: 6,
};
