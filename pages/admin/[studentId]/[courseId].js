import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useProfile } from '@/lib/useProfile';
import { supabase } from '@/lib/supabaseClient';
import CourseView from '@/components/CourseView';

export default function AdminCoursePage() {
  const router = useRouter();
  const { studentId, courseId } = router.query;
  const { loading, profile } = useProfile();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!profile || !studentId || !courseId) return;
    if (profile.role !== 'admin') {
      router.replace('/courses');
      return;
    }

    async function load() {
      const [{ data: student }, { data: course }, { data: lessons }, { data: presentation }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email').eq('id', studentId).single(),
        supabase.from('courses').select('id, title').eq('id', courseId).single(),
        supabase
          .from('lessons')
          .select('id, title, short_label, description, homework_type, order_index, videos(youtube_id, order_index)')
          .eq('course_id', courseId)
          .order('order_index'),
        supabase.from('presentations').select('embed_url').eq('course_id', courseId).maybeSingle(),
      ]);
      setData({ student, course, lessons: lessons || [], presentation });
    }
    load();
  }, [profile, studentId, courseId, router]);

  if (loading || !data) return null;

  return (
    <CourseView
      course={data.course}
      lessons={data.lessons}
      presentation={data.presentation}
      studentId={studentId}
      studentName={data.student?.full_name || data.student?.email}
      isAdmin
      backHref="/admin"
    />
  );
}
