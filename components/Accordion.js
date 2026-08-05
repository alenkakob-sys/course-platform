// Три незалежні кнопки згортання: опис, ДЗ і чат (п.10 ТЗ).
// Кожен Accordion керує лише власним станом open/closed.
export default function Accordion({ title, subtitle, defaultOpen = false, children }) {
  return (
    <details open={defaultOpen} style={{ border: '1px solid #eee', borderRadius: 8, marginBottom: 8 }}>
      <summary
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 10px',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 500,
          background: '#fafafa',
          listStyle: 'none',
        }}
      >
        <span>
          {title}
          {subtitle && <span style={{ color: '#999', fontWeight: 400 }}> · {subtitle}</span>}
        </span>
      </summary>
      <div style={{ padding: 10 }}>{children}</div>
    </details>
  );
}
