// Показується лише якщо для курсу задано embed_url (не для всіх курсів).
export default function PresentationBlock({ embedUrl }) {
  if (!embedUrl) return null;
  return (
    <div style={{ padding: '8px 12px' }}>
      <a
        href={embedUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'block',
          padding: '10px 12px',
          background: '#f5f5f5',
          borderRadius: 8,
          fontSize: 13,
          textDecoration: 'none',
          color: '#111',
        }}
      >
        Презентація курсу →
      </a>
    </div>
  );
}
