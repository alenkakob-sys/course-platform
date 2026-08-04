export default function CourseCard({ title, unreadTotal, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '14px 12px',
        borderBottom: '1px solid #eee',
        cursor: 'pointer',
      }}
    >
      <span style={{ flex: 1, fontSize: 15 }}>{title}</span>
      {unreadTotal > 0 && (
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
          {unreadTotal}
        </span>
      )}
      <span style={{ color: '#999' }}>›</span>
    </div>
  );
}
