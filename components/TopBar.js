import { useRouter } from 'next/router';

// п.10 ТЗ: кнопка назад до вибору курсу + назва курсу; для адмінки
// додатково показує, чий чат/урок вона зараз переглядає.
export default function TopBar({ courseTitle, studentName, backHref }) {
  const router = useRouter();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 12px',
        borderBottom: '1px solid #eee',
      }}
    >
      <button
        aria-label="Назад до курсів"
        onClick={() => router.push(backHref)}
        style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', padding: 4 }}
      >
        ←
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 500, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {courseTitle}
        </p>
        {studentName && (
          <p style={{ fontSize: 12, color: '#888', margin: 0 }}>Перегляд: {studentName}</p>
        )}
      </div>
    </div>
  );
}
