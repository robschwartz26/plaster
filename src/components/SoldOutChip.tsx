export function SoldOutChip() {
  return (
    <span style={{
      fontFamily: '"Barlow Condensed", sans-serif',
      fontWeight: 700,
      fontSize: 11,
      letterSpacing: '0.11em',
      textTransform: 'uppercase',
      color: '#fff',
      background: 'var(--sold-out)',
      padding: '3px 8px',
      borderRadius: 5,
      flexShrink: 0,
    }}>
      Sold out
    </span>
  )
}
