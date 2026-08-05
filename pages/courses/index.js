import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useProfile } from '@/lib/useProfile';
import { supabase } from '@/lib/supabaseClient';
import { fetchUnreadCounts } from '@/lib/chat';
import CourseCard from '@/components/CourseCard';
import LogoutButton from '@/components/LogoutButton';

export default function CoursesList() {
  const router = useRouter();
  const { loading, profile } = useProfile();
  const [courses, setCourses] = useState(null);

  useEffect(() => {
    if (!profile) return;

    async function load() {
      // RLS сама поверне лише ті курси, до яких є доступ (п.3 ТЗ).
      const { data: accessible } = await supabase
        .from('courses')
        .select('id, title')
        .order('order_index');

      const withUnread = await Promise.all(
        (accessible || []).map(async (c) => {
          const counts = await fetchUnreadCounts(c.id, 'student', profile.id);
          const total = Object.values(counts).reduce((a, b) => a + b, 0);
          return { ...c, unreadTotal: total };
        })
      );
      setCourses(withUnread);
    }
    load();
  }, [profile]);

  if (loading || !courses) return null;

  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>Мої курси</h1>
        <LogoutButton />
      </div>
      {courses.length === 0 && (
        <p style={{ fontSize: 14, color: '#666' }}>Поки що немає доступних курсів.</p>
      )}
      {courses.map((c) => (
        <CourseCard
          key={c.id}
          title={c.title}
          unreadTotal={c.unreadTotal}
          onClick={() => router.push(`/courses/${c.id}`)}
        />
      ))}
    </div>
  );
}
