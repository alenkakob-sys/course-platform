import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useProfile } from '@/lib/useProfile';
import { supabase } from '@/lib/supabaseClient';

export default function ManageCourses() {
  const router = useRouter();
  const { loading, profile } = useProfile();
  const [courses, setCourses] = useState(null);

  async function load() {
    const { data } = await supabase.from('courses').select('id, title, order_index').order('order_index');
    setCourses(data || []);
  }

  useEffect(() => {
    if (!profile) return;
    if (profile.role !== 'admin') {
      router.replace('/courses');
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [profile, router]);

  async function addCourse() {
    const { data, error } = await supabase
      .from('courses')
      .insert({ title: 'Новий курс', order_index: (courses?.length || 0) })
      .select('id')
      .single();
    if (!error) router.push(`/admin/manage/${data.id}`);
  }

  if (loading || !courses) return null;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>Керування курсами</h1>
        <Link href="/admin" style={{ fontSize: 13, color: '#666' }}>← до адмінки</Link>
      </div>

      <Link href="/admin/manage/students" style={{ display: 'block', fontSize: 13, marginBottom: 16, color: '#111' }}>
        Учениці та доступ до курсів →
      </Link>

      {courses.map((c) => (
        <div
          key={c.id}
          onClick={() => router.push(`/admin/manage/${c.id}`)}
          style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 10px', borderBottom: '1px solid #eee', cursor: 'pointer' }}
        >
          <span style={{ fontSize: 14 }}>{c.title}</span>
          <span style={{ color: '#999' }}>›</span>
        </div>
      ))}

      <button
        onClick={addCourse}
        style={{ marginTop: 16, width: '100%', padding: 10, fontSize: 14, borderRadius: 8, border: '1px dashed #ccc', background: 'none', cursor: 'pointer' }}
      >
        + Новий курс
      </button>
    </div>
  );
}
