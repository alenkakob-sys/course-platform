import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

// УВАГА: це базова заготовка. Автоматичне відкриття наступного уроку
// після відправки ДЗ — Фаза 2 (п.7 ТЗ), навмисно НЕ реалізована зараз.
export default function HomeworkField({ lesson, studentId }) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState('idle'); // idle | saving | done | error

  if (!lesson.homework_type) {
    return <p style={{ fontSize: 13, color: '#999' }}>Для цього уроку домашнє завдання не потрібне.</p>;
  }

  async function submitText() {
    setStatus('saving');
    const { error } = await supabase.from('homework_submissions').upsert({
      student_id: studentId,
      lesson_id: lesson.id,
      submission_type: 'text',
      text_content: text,
    });
    setStatus(error ? 'error' : 'done');
  }

  async function submitFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setStatus('saving');
    const path = `${studentId}/${lesson.id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('homework').upload(path, file);
    if (uploadError) {
      setStatus('error');
      return;
    }
    const { data: pub } = supabase.storage.from('homework').getPublicUrl(path);
    const { error } = await supabase.from('homework_submissions').upsert({
      student_id: studentId,
      lesson_id: lesson.id,
      submission_type: lesson.homework_type,
      file_url: pub.publicUrl,
    });
    setStatus(error ? 'error' : 'done');
  }

  if (lesson.homework_type === 'text') {
    return (
      <div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ваша відповідь…"
          rows={3}
          style={{ width: '100%', fontSize: 13, padding: 8, borderRadius: 6, border: '1px solid #ddd' }}
        />
        <button onClick={submitText} disabled={status === 'saving'} style={{ marginTop: 6, fontSize: 12, padding: '6px 12px' }}>
          {status === 'done' ? 'Надіслано ✓' : 'Надіслати'}
        </button>
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>
        Потрібно прикріпити {lesson.homework_type === 'video' ? 'відео' : 'фото'}.
      </p>
      <input type="file" accept={lesson.homework_type === 'video' ? 'video/*' : 'image/*'} onChange={submitFile} />
      {status === 'done' && <p style={{ fontSize: 12, color: 'green' }}>Надіслано ✓</p>}
    </div>
  );
}
