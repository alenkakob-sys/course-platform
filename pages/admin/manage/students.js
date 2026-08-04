import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useProfile } from '@/lib/useProfile';
import { supabase } from '@/lib/supabaseClient';

export default function ManageStudents() {
  const router = useRouter();
  const { loading, profile } = useProfile();
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [access, setAccess] = useState({}); // { studentId: Set(courseId) }
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteStatus, setInviteStatus] = useState('idle');

  useEffect(() => {
    if (!profile) return;
    if (profile.role !== 'admin') {
      router.replace('/courses');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  async function load() {
    const [{ data: studentsData }, { data: coursesData }, { data: accessData }] = await Promise.all([
      supabase.from('profiles').select('id, email, full_name').eq('role', 'student').order('email'),
      supabase.from('courses').select('id, title').order('order_index'),
      supabase.from('course_access').select('student_id, course_id'),
    ]);
    setStudents(studentsData || []);
    setCourses(coursesData || []);
    const map = {};
    (accessData || []).forEach((row) => {
      if (!map[row.student_id]) map[row.student_id] = new Set();
      map[row.student_id].add(row.course_id);
    });
    setAccess(map);
  }

  async function toggleAccess(studentId, courseId, has) {
    if (has) {
      await supabase.from('course_access').delete().eq('student_id', studentId).eq('course_id', courseId);
    } else {
      await supabase.from('course_access').insert({ student_id: studentId, course_id: courseId });
    }
    load();
  }

  async function sendInvite(e) {
    e.preventDefault();
    setInviteStatus('sending');
    const res = await fetch('/api/admin/invite-student', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail }),
    });
    if (res.ok) {
      setInviteStatus('done');
      setInviteEmail('');
      load();
    } else {
      setInviteStatus('error');
    }
  }

  if (loading) return null;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>Учениці</h1>
        <Link href="/admin/manage" style={{ fontSize: 13, color: '#666' }}>← курси</Link>
      </div>

      <form onSubmit={sendInvite} style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        <input
          type="email"
          required
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          placeholder="email нової учениці"
          style={{ flex: 1, fontSize: 13, padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
        />
        <button type="submit" disabled={inviteStatus === 'sending'} style={{ fontSize: 13, padding: '0 12px' }}>
          Запросити
        </button>
      </form>
      {inviteStatus === 'done' && <p style={{ fontSize: 12, color: 'green', marginTop: -12, marginBottom: 16 }}>Запрошення надіслано ✓</p>}
      {inviteStatus === 'error' && <p style={{ fontSize: 12, color: 'crimson', marginTop: -12, marginBottom: 16 }}>Не вдалось надіслати. Можливо, ця пошта вже зареєстрована.</p>}

      {students.map((s) => (
        <div key={s.id} style={{ padding: '10px 0', borderBottom: '1px solid #eee' }}>
          <p style={{ fontSize: 14, margin: '0 0 6px' }}>{s.full_name || s.email}</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {courses.map((c) => {
              const has = access[s.id]?.has(c.id) || false;
              return (
                <label key={c.id} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="checkbox" checked={has} onChange={() => toggleAccess(s.id, c.id, has)} />
                  {c.title}
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
