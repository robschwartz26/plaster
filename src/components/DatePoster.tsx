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
  const BG     = night ? '#1a1a1a' : '#f0ece3'
  const FG     = night ? '#f0ece3' : '#1a1a1a'
  const BAR_BG = night ? '#f0ece3' : '#1a1a1a'
  const BAR_FG = night ? '#1a1a1a' : '#f0ece3'

  const base: React.CSSProperties = {
    aspectRatio: '2/3',
    background: BG,
    color: FG,
    overflow: 'hidden',
    position: 'relative',
    fontFamily: '"Barlow Condensed", sans-serif',
    userSelect: 'none',
    containerType: 'inline-size',
  }

  if (styleName === 'split') {
    return (
      <div style={base}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', paddingLeft: '9cqw', paddingBottom: '9cqw' }}>
            <span style={{ fontSize: '45cqw', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 0.85 }}>{monthNum}</span>
          </div>
          <div style={{ height: 2, background: FG, margin: '0 9cqw' }} />
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', paddingRight: '9cqw', paddingTop: '9cqw' }}>
            <span style={{ fontSize: '45cqw', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 0.85 }}>{dayNum}</span>
          </div>
        </div>
      </div>
    )
  }

  if (styleName === 'stacked') {
    return (
      <div style={base}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '9cqw', textAlign: 'center' }}>
          <span style={{ fontSize: '48cqw', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 0.82, textTransform: 'uppercase', marginBottom: '8cqw' }}>{dayAbbr}</span>
          <span style={{ fontSize: '13cqw', fontWeight: 400, letterSpacing: '0.15em', textTransform: 'uppercase' }}>{monthFull} {dayNum}</span>
        </div>
      </div>
    )
  }

  if (styleName === 'hugenum') {
    return (
      <div style={base}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', padding: '9cqw' }}>
          <span style={{ fontSize: '12cqw', fontWeight: 500, letterSpacing: '0.25em', textTransform: 'uppercase' }}>{dayFull}</span>
          <span style={{ fontSize: '78cqw', fontWeight: 900, letterSpacing: '-0.06em', lineHeight: 0.82, alignSelf: 'flex-end' }}>{dayNum}</span>
          <span style={{ fontSize: '9cqw', fontWeight: 500, letterSpacing: '0.25em', textTransform: 'uppercase' }}>{monthFull}</span>
        </div>
      </div>
    )
  }

  if (styleName === 'topbar') {
    return (
      <div style={base}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ background: BAR_BG, color: BAR_FG, padding: '8cqw 9cqw', flexShrink: 0 }}>
            <span style={{ fontSize: '15cqw', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{dayAbbr} · {monthAbbr}</span>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '9cqw' }}>
            <span style={{ fontSize: '72cqw', fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 0.85 }}>{dayNum}</span>
          </div>
        </div>
      </div>
    )
  }

  if (styleName === 'bottomweighted') {
    return (
      <div style={base}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', padding: '9cqw' }}>
          <span style={{ fontSize: '14cqw', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>{dayFull}</span>
          <div>
            <div style={{ fontSize: '85cqw', fontWeight: 900, letterSpacing: '-0.06em', lineHeight: 0.82 }}>{dayNum}</div>
            <div style={{ fontSize: '13cqw', fontWeight: 500, letterSpacing: '0.25em', textTransform: 'uppercase', marginTop: '-3cqw' }}>{monthFull}</div>
          </div>
        </div>
      </div>
    )
  }

  // framed
  return (
    <div style={base}>
      <div style={{ position: 'absolute', inset: '8cqw', border: `1px solid ${FG}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '9cqw' }}>
        <span style={{ fontSize: '40cqw', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 0.85, textTransform: 'uppercase' }}>{dayAbbr}</span>
        <div style={{ width: '26cqw', height: 1, background: FG, margin: '8cqw 0' }} />
        <span style={{ fontSize: '10cqw', fontWeight: 500, letterSpacing: '0.25em', textTransform: 'uppercase' }}>{monthFull} {dayNum}</span>
      </div>
    </div>
  )
}
