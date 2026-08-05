// Ряд номерів уроків, що гортається горизонтально. Вибір тут керує лише
// відео + описом + ДЗ — чат перемикається окремо, в ChatPanel (п.10 ТЗ).
export default function LessonStrip({ lessons, selectedId, onSelect }) {
  return (
    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '4px 12px 10px' }}>
      {lessons.map((l) => {
        const active = l.id === selectedId;
        return (
          <button
            key={l.id}
            onClick={() => onSelect(l.id)}
            style={{
              flexShrink: 0,
              width: 34,
              height: 34,
              borderRadius: '50%',
              border: 'none',
              fontSize: 11,
              cursor: 'pointer',
              background: active ? '#111' : '#f0f0f0',
              color: active ? '#fff' : '#333',
            }}
          >
            {l.short_label || l.title.slice(0, 3)}
          </button>
        );
      })}
    </div>
  );
}
