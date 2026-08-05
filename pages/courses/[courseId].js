import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useProfile } from '@/lib/useProfile';
import { supabase } from '@/lib/supabaseClient';
import CourseView from '@/components/CourseView';

export default function CoursePage() {
  const router = useRouter();
  const { courseId } = router.query;
  const { loading, profile } = useProfile();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!profile || !courseId) return;

    async function load() {
      // RLS дозволить це лише якщо є доступ до курсу (course_access), п.3 ТЗ.
      const [{ data: course }, { data: lessons }, { data: presentation }] = await Promise.all([
        supabase.from('courses').select('id, title').eq('id', courseId).single(),
        supabase
          .from('lessons')
          .select('id, title, short_label, description, homework_type, order_index, videos(youtube_id, order_index)')
          .eq('course_id', courseId)
          .order('order_index'),
        supabase.from('presentations').select('embed_url').eq('course_id', courseId).maybeSingle(),
      ]);
      setData({ course, lessons: lessons || [], presentation });
    }
    load();
  }, [profile, courseId]);

  if (loading || !data) return null;
  if (!data.course) return <p style={{ padding: 16, fontSize: 14 }}>Курс не знайдено або немає доступу.</p>;

  return (
    <CourseView
      course={data.course}
      lessons={data.lessons}
      presentation={data.presentation}
      studentId={profile.id}
      isAdmin={false}
      backHref="/courses"
    />
  );
}
