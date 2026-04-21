import { useTheme } from '@/hooks/useTheme'

interface Props {
  date: string // YYYY-MM-DD
}

const STYLES = ['split', 'stacked', 'hugenum', 'topbar', 'bottomweighted', 'framed'] as const
type StyleName = typeof STYLES[number]

export function DatePoster({ date }: Props) {
  const { theme } = useTheme()

  const [yearStr, monthStr, dayStr] = date.split('-')
  const year  = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10)
  const day   = parseInt(dayStr, 10)

  const styleName: StyleName = STYLES[(month - 1) % 6]

  const d = new Date(year, month - 1, day)
  const dayAbbr   = d.toLocaleDateString('en-US', { weekday: 'short'  }).toUpperCase()
  const dayFull   = d.toLocaleDateString('en-US', { weekday: 'long'   })
  const monthAbbr = d.toLocaleDateString('en-US', { month: 'short'    }).toUpperCase()
  const monthFull = d.toLocaleDateString('en-US', { month: 'long'     })
  const dayNum    = String(day).padStart(2, '0')
  const monthNum  = String(month).padStart(2, '0')

  const night  = theme === 'night'
  const BG     = night ? '#1a1a1a' : '#F5F1EB'
  const FG     = night ? '#F5F1EB' : '#1a1a1a'
  const BAR_BG = night ? '#F5F1EB' : '#1a1a1a'
  const BAR_FG = night ? '#1a1a1a' : '#F5F1EB'

  const base: React.CSSProperties = {
    aspectRatio: '2/3',
    background: BG,
    color: FG,
    overflow: 'hidden',
    position: 'relative',
    fontFamily: '"Barlow Condensed", sans-serif',
    userSelect: 'none',
  }

  if (styleName === 'split') {
    return (
      <div style={base}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', paddingLeft: 14, paddingBottom: 14 }}>
            <span style={{ fontSize: 68, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 0.85 }}>{monthNum}</span>
          </div>
          <div style={{ height: 2, background: FG, margin: '0 14px' }} />
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', paddingRight: 14, paddingTop: 14 }}>
            <span style={{ fontSize: 68, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 0.85 }}>{dayNum}</span>
          </div>
        </div>
      </div>
    )
  }

  if (styleName === 'stacked') {
    return (
      <div style={base}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 14, textAlign: 'center' }}>
          <span style={{ fontSize: 72, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 0.82, textTransform: 'uppercase', marginBottom: 12 }}>{dayAbbr}</span>
          <span style={{ fontSize: 20, fontWeight: 400, letterSpacing: '0.15em', textTransform: 'uppercase' }}>{monthFull} {dayNum}</span>
        </div>
      </div>
    )
  }

  if (styleName === 'hugenum') {
    return (
      <div style={base}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', padding: 14 }}>
          <span style={{ fontSize: 18, fontWeight: 500, letterSpacing: '0.25em', textTransform: 'uppercase' }}>{dayFull}</span>
          <span style={{ fontSize: 120, fontWeight: 900, letterSpacing: '-0.06em', lineHeight: 0.82, alignSelf: 'flex-end' }}>{dayNum}</span>
          <span style={{ fontSize: 14, fontWeight: 500, letterSpacing: '0.25em', textTransform: 'uppercase' }}>{monthFull}</span>
        </div>
      </div>
    )
  }

  if (styleName === 'topbar') {
    return (
      <div style={base}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ background: BAR_BG, color: BAR_FG, padding: '12px 14px', flexShrink: 0 }}>
            <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{dayAbbr} · {monthAbbr}</span>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
            <span style={{ fontSize: 110, fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 0.85 }}>{dayNum}</span>
          </div>
        </div>
      </div>
    )
  }

  if (styleName === 'bottomweighted') {
    return (
      <div style={base}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', padding: 14 }}>
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>{dayFull}</span>
          <div>
            <div style={{ fontSize: 130, fontWeight: 900, letterSpacing: '-0.06em', lineHeight: 0.82 }}>{dayNum}</div>
            <div style={{ fontSize: 20, fontWeight: 500, letterSpacing: '0.25em', textTransform: 'uppercase', marginTop: -4 }}>{monthFull}</div>
          </div>
        </div>
      </div>
    )
  }

  // framed
  return (
    <div style={base}>
      <div style={{ position: 'absolute', inset: 12, border: `1px solid ${FG}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
        <span style={{ fontSize: 62, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 0.85, textTransform: 'uppercase' }}>{dayAbbr}</span>
        <div style={{ width: 40, height: 1, background: FG, margin: '12px 0' }} />
        <span style={{ fontSize: 16, fontWeight: 500, letterSpacing: '0.25em', textTransform: 'uppercase' }}>{monthFull} {dayNum}</span>
      </div>
    </div>
  )
}
