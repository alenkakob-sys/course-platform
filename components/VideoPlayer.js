// Вбудований плеєр YouTube у режимі розширеної конфіденційності
// (youtube-nocookie.com) — без переходу на youtube.com, п.4 ТЗ.
// allowFullScreen дозволяє розгортання на весь екран з поворотом (п.10 ТЗ).
export default function VideoPlayer({ youtubeId, title }) {
  if (!youtubeId) {
    return (
      <div style={{ aspectRatio: '16/9', background: '#f0f0f0', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 13 }}>
        Відео ще не додано
      </div>
    );
  }
  return (
    <div style={{ aspectRatio: '16/9', borderRadius: 8, overflow: 'hidden' }}>
      <iframe
        width="100%"
        height="100%"
        src={`https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0`}
        title={title}
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
