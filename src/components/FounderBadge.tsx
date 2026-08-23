// FounderBadge — the blue "Founder" pill shown next to @PlasterBob (and any
// is_official account) in place of the neighborhood chip. Blue, not the purple
// accent, so the founder account reads as distinct/special. The ◆ ties it to
// Plaster's diamond motif. Never red (design rule).

const BLUE = '#3B82F6'

export function FounderBadge({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const fontSize = size === 'sm' ? 10 : 11
  const pad = size === 'sm' ? '2px 8px' : '2px 9px'
  return (
    <span
      style={{
        fontFamily: '"Space Grotesk", sans-serif',
        fontSize,
        fontWeight: 700,
        color: '#fff',
        background: BLUE,
        padding: pad,
        borderRadius: 20,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        letterSpacing: 0.2,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: fontSize - 2, lineHeight: 1 }}>◆</span>
      Founder
    </span>
  )
}
