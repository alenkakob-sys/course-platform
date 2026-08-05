import { useState } from 'react';
import TopBar from '@/components/TopBar';
import PresentationBlock from '@/components/PresentationBlock';
import LessonStrip from '@/components/LessonStrip';
import VideoPlayer from '@/components/VideoPlayer';
import Accordion from '@/components/Accordion';
import HomeworkField from '@/components/HomeworkField';
import ChatPanel from '@/components/ChatPanel';

// isAdmin=true використовується адмін-сторінкою для перегляду чужого
// кабінету (studentId != поточний користувач).
export default function CourseView({ course, lessons, presentation, studentId, studentName, isAdmin, backHref }) {
  const [selectedLessonId, setSelectedLessonId] = useState(lessons[0]?.id);
  const selectedLesson = lessons.find((l) => l.id === selectedLessonId);

  return (
    <div style={{ maxWidth: 420, margin: '0 auto' }}>
      <TopBar courseTitle={course.title} studentName={isAdmin ? studentName : null} backHref={backHref} />
      <PresentationBlock embedUrl={presentation?.embed_url} />

      <LessonStrip lessons={lessons} selectedId={selectedLessonId} onSelect={setSelectedLessonId} />

      <div style={{ padding: '0 12px' }}>
        {selectedLesson && (
          <>
            <VideoPlayer youtubeId={selectedLesson.videos?.[0]?.youtube_id} title={selectedLesson.title} />
            <p style={{ fontSize: 11, color: '#999', margin: '6px 0 12px' }}>
              Розгортається на весь екран при повороті екрана
            </p>

            <Accordion title="Опис уроку" subtitle={selectedLesson.title}>
              <p style={{ fontSize: 13, color: '#444' }}>
                {selectedLesson.description || 'Опис ще не додано.'}
              </p>
            </Accordion>

            <Accordion title="Домашнє завдання" subtitle={selectedLesson.title}>
              <HomeworkField lesson={selectedLesson} studentId={studentId} />
            </Accordion>
          </>
        )}

        <Accordion title="Чат" subtitle="незалежний від відео вище" defaultOpen>
          <ChatPanel
            courseId={course.id}
            studentId={studentId}
            lessons={lessons}
            viewerRole={isAdmin ? 'admin' : 'student'}
          />
        </Accordion>
      </div>
    </div>
  );
}
