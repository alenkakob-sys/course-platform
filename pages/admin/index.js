import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useProfile } from '@/lib/useProfile';
import { supabase } from '@/lib/supabaseClient';
import { fetchUnreadCounts } from '@/lib/chat';

export default function AdminHome() {
  const router = useRouter();
  const { loading, profile } = useProfile();
  const [rows, setRows] = useState(null);

  useEffect(() => {
    if (!profile) return;
    if (profile.role !== 'admin') {
      router.replace('/courses');
      return;
    }

    async function load() {
      const { data: access } = await supabase
        .from('course_access')
        .select('student_id, course_id, profiles(full_name, email), courses(id, title)');

      const withUnread = await Promise.all(
        (access || []).map(async (row) => {
          const counts = await fetchUnreadCounts(row.course_id, 'admin', row.student_id);
          const total = Object.values(counts).reduce((a, b) => a + b, 0);
          return {
            studentId: row.student_id,
            studentName: row.profiles?.full_name || row.profiles?.email,
            courseId: row.course_id,
            courseTitle: row.courses?.title,
            unreadTotal: total,
          };
        })
      );
      setRows(withUnread);
    }
    load();
  }, [profile, router]);

  if (loading || !rows) return null;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <h1 style={{ fontSize: 18, fontWeight: 500, marginBottom: 16 }}>Учениці</h1>
      {rows.map((r) => (
        <div
          key={r.studentId + r.courseId}
          onClick={() => router.push(`/admin/${r.studentId}/${r.courseId}`)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 10px',
            borderBottom: '1px solid #eee',
            cursor: 'pointer',
          }}
        >
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, margin: 0 }}>{r.studentName}</p>
            <p style={{ fontSize: 12, color: '#888', margin: 0 }}>{r.courseTitle}</p>
          </div>
          {r.unreadTotal > 0 && (
            <span
              style={{
                background: '#e5484d',
                color: '#fff',
                borderRadius: 999,
                minWidth: 18,
                height: 18,
                fontSize: 11,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 4px',
              }}
            >
              {r.unreadTotal}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
