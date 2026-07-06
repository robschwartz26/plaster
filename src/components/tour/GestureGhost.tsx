// Animated gesture hints for the interactive tour — pure CSS, no assets, theme-aware.
// Rendered inside/over the spotlight (pointer-events: none) and removed the instant the
// step's action fires. Honors prefers-reduced-motion with a static fallback.

const REDUCE = typeof window !== 'undefined'
  && !!window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const KEYFRAMES = `
@keyframes tg-swipe { 0%{transform:translateX(46px);opacity:0} 15%{opacity:1} 78%{opacity:1} 100%{transform:translateX(-46px);opacity:0} }
@keyframes tg-doubletap { 0%{transform:scale(.35);opacity:0} 4%{opacity:.85} 18%{transform:scale(1.5);opacity:0} 24%{transform:scale(.35);opacity:.85} 38%{transform:scale(1.5);opacity:0} 100%{opacity:0} }
@keyframes tg-dot { 0%,100%{opacity:.55} 40%{opacity:1} }
@keyframes tg-pinch-a { 0%,100%{transform:translate(-20px,-20px)} 50%{transform:translate(-5px,-5px)} }
@keyframes tg-pinch-b { 0%,100%{transform:translate(20px,20px)} 50%{transform:translate(5px,5px)} }
`

const dot: React.CSSProperties = { width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,0.95)', boxShadow: '0 1px 6px rgba(0,0,0,0.4)' }

export function GestureGhost({ variant }: { variant: 'swipe' | 'doubletap' | 'pinch' }) {
  if (REDUCE) {
    const glyph = variant === 'swipe' ? '⇠' : variant === 'pinch' ? '⇲⇱' : '⊙'
    return <div style={{ fontSize: 30, color: 'rgba(255,255,255,0.85)', lineHeight: 1 }} aria-hidden>{glyph}</div>
  }

  return (
    <div style={{ position: 'relative', width: 120, height: 120, pointerEvents: 'none' }} aria-hidden>
      <style>{KEYFRAMES}</style>

      {variant === 'swipe' && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', display: 'flex', alignItems: 'center', gap: 6, animation: 'tg-swipe 1.8s ease-in-out infinite' }}>
          <span style={{ fontSize: 22, color: 'rgba(255,255,255,0.8)', lineHeight: 1 }}>‹</span>
          <div style={dot} />
        </div>
      )}

      {variant === 'doubletap' && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
          <div style={{ position: 'absolute', top: -22, left: -22, width: 44, height: 44, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.9)', animation: 'tg-doubletap 1.8s ease-out infinite' }} />
          <div style={{ ...dot, position: 'absolute', top: -11, left: -11, animation: 'tg-dot 1.8s ease-in-out infinite' }} />
        </div>
      )}

      {variant === 'pinch' && (
        <div style={{ position: 'absolute', top: '50%', left: '50%' }}>
          <div style={{ ...dot, position: 'absolute', animation: 'tg-pinch-a 1.6s ease-in-out infinite' }} />
          <div style={{ ...dot, position: 'absolute', animation: 'tg-pinch-b 1.6s ease-in-out infinite' }} />
        </div>
      )}
    </div>
  )
}
