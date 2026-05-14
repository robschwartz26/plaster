import type { CSSProperties } from 'react'

interface Props {
  accountType: string | null | undefined
  size?: 'sm' | 'md'
  style?: CSSProperties
}

/**
 * Visual badge for VA accounts. Renders nothing for 'person' or unknown.
 * Artist: amber palette. Venue: indigo palette.
 * Size 'sm' for inline feeds/lists; 'md' for profile headers.
 */
export function AccountTypeBadge({ accountType, size = 'sm', style: extraStyle }: Props) {
  if (accountType !== 'artist' && accountType !== 'venue') return null

  const palette = accountType === 'artist'
    ? { bg: 'rgba(234, 179, 8, 0.10)',  border: 'rgba(234, 179, 8, 0.45)' }
    : { bg: 'rgba(124, 58, 237, 0.10)', border: 'rgba(124, 58, 237, 0.45)' }

  const isMd = size === 'md'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: isMd ? '3px 9px' : '2px 7px',
        borderRadius: 999,
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        color: 'var(--fg)',
        fontFamily: '"Barlow Condensed", sans-serif',
        fontWeight: 700,
        fontSize: isMd ? 11 : 10,
        letterSpacing: '0.12em',
        textTransform: 'uppercase' as const,
        lineHeight: 1.2,
        verticalAlign: 'middle',
        whiteSpace: 'nowrap' as const,
        ...extraStyle,
      }}
    >
      {accountType}
    </span>
  )
}
