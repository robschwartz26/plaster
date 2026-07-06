// Approved gesture hints for the interactive tour — all built on Plaster's diamond
// motif. Pure CSS, no assets, theme-aware (var(--fg)). Rendered over the spotlight
// (pointer-events: none) and removed the instant the step's action fires. Honors
// prefers-reduced-motion with a static chevron.

const REDUCE = typeof window !== 'undefined'
  && !!window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const KEYFRAMES = `
@keyframes tg-tap-dia {0%,4%{transform:scale(0);opacity:1}6%{transform:scale(1.15)}9%{transform:scale(.8)}12%{transform:scale(1.1)}15%{transform:scale(.85)}18%{transform:scale(1)}55%{transform:scale(1);opacity:1}65%{transform:scale(0);opacity:0}100%{transform:scale(0);opacity:0}}
@keyframes tg-tap-ring {0%,4%{opacity:0;transform:rotate(45deg) scale(.145)}5%{opacity:.85;transform:rotate(45deg) scale(.145)}30%{opacity:0;transform:rotate(45deg) scale(1)}100%{opacity:0;transform:rotate(45deg) scale(1)}}
@keyframes tg-tap1-dia {0%,8%{transform:scale(0);opacity:1}16%{transform:scale(1.2)}24%{transform:scale(.9)}30%{transform:scale(1)}62%{transform:scale(1);opacity:1}74%{transform:scale(0);opacity:0}100%{transform:scale(0);opacity:0}}
@keyframes tg-tap1-ring {0%,8%{opacity:0;transform:rotate(45deg) scale(.145)}10%{opacity:.9;transform:rotate(45deg) scale(.145)}40%{opacity:0;transform:rotate(45deg) scale(1)}100%{opacity:0;transform:rotate(45deg) scale(1)}}
@keyframes tg-comet-0 {0%{transform:translateX(96px);opacity:0}12%{opacity:1}82%{opacity:1}100%{transform:translateX(-110px);opacity:0}}
@keyframes tg-comet-1 {0%{transform:translateX(96px);opacity:0}12%{opacity:.45}82%{opacity:.45}100%{transform:translateX(-110px);opacity:0}}
@keyframes tg-comet-2 {0%{transform:translateX(96px);opacity:0}12%{opacity:.22}82%{opacity:.22}100%{transform:translateX(-110px);opacity:0}}
@keyframes tg-comet-3 {0%{transform:translateX(96px);opacity:0}12%{opacity:.10}82%{opacity:.10}100%{transform:translateX(-110px);opacity:0}}
@keyframes tg-chev {0%,20%{opacity:0}45%{opacity:.8}70%,100%{opacity:0}}
@keyframes tg-pinch-a {0%,10%{transform:translate(-9px,9px)}45%,55%{transform:translate(-40px,40px)}90%,100%{transform:translate(-9px,9px)}}
@keyframes tg-pinch-b {0%,10%{transform:translate(-6px,-24px)}45%,55%{transform:translate(25px,-55px)}90%,100%{transform:translate(-6px,-24px)}}
@keyframes tg-pinch-chev {0%,25%{opacity:0}50%{opacity:.7}75%,100%{opacity:0}}
`

const CLIP = 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)'
// Fixed light ink: the ghosts always sit on the dark spotlight scrim (and sometimes over
// a real poster), so they must NOT follow the theme — var(--fg) goes black in day mode
// and vanishes. White fill + a dark drop-shadow reads on any backdrop.
const INK = 'rgba(255,255,255,0.97)'
const GLOW = 'drop-shadow(0 1px 4px rgba(0,0,0,0.6)) drop-shadow(0 0 7px rgba(255,255,255,0.45))'
const TEXT_SHADOW = '0 1px 4px rgba(0,0,0,0.6), 0 0 7px rgba(255,255,255,0.45)'
function dia(size: number): React.CSSProperties {
  return { width: size, height: size, clipPath: CLIP, background: INK, filter: GLOW }
}
const ring: React.CSSProperties = { position: 'absolute', width: 110, height: 110, border: `1.5px solid ${INK}`, filter: GLOW }
const chev: React.CSSProperties = { position: 'absolute', fontSize: 22, lineHeight: 1, color: INK, textShadow: TEXT_SHADOW }
const center: React.CSSProperties = { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }

export function GestureGhost({ variant }: { variant: 'swipe' | 'doubletap' | 'pinch' | 'tap' }) {
  if (REDUCE) {
    const glyph = variant === 'swipe' ? '‹' : variant === 'pinch' ? '◇' : '◆'
    return <div style={{ fontSize: 30, color: INK, lineHeight: 1, textShadow: TEXT_SHADOW }} aria-hidden>{glyph}</div>
  }

  return (
    <div style={{ position: 'relative', width: 130, height: 130, pointerEvents: 'none' }} aria-hidden>
      <style>{KEYFRAMES}</style>

      {variant === 'tap' && (
        <div style={center}>
          <div style={{ ...ring, transform: 'rotate(45deg) scale(.145)', animation: 'tg-tap1-ring 1.8s ease-out infinite' }} />
          <div style={{ ...dia(18), position: 'absolute', animation: 'tg-tap1-dia 1.8s ease-in-out infinite' }} />
        </div>
      )}

      {variant === 'doubletap' && (
        <div style={center}>
          <div style={{ ...ring, transform: 'rotate(45deg) scale(.145)', animation: 'tg-tap-ring 2.6s ease-out infinite' }} />
          <div style={{ ...ring, transform: 'rotate(45deg) scale(.145)', animation: 'tg-tap-ring 2.6s ease-out infinite', animationDelay: '0.12s' }} />
          <div style={{ ...dia(16), position: 'absolute', animation: 'tg-tap-dia 2.6s ease-in-out infinite' }} />
        </div>
      )}

      {variant === 'swipe' && (
        <div style={center}>
          <div style={{ ...chev, left: 6, animation: 'tg-chev 2s ease-in-out infinite' }}>‹</div>
          <div style={{ ...chev, left: 20, animation: 'tg-chev 2s ease-in-out infinite', animationDelay: '0.1s' }}>‹</div>
          <div style={{ ...dia(8), position: 'absolute', animation: 'tg-comet-3 2s cubic-bezier(.45,.05,.35,.95) infinite', animationDelay: '0.21s' }} />
          <div style={{ ...dia(10), position: 'absolute', animation: 'tg-comet-2 2s cubic-bezier(.45,.05,.35,.95) infinite', animationDelay: '0.14s' }} />
          <div style={{ ...dia(13), position: 'absolute', animation: 'tg-comet-1 2s cubic-bezier(.45,.05,.35,.95) infinite', animationDelay: '0.07s' }} />
          <div style={{ ...dia(16), position: 'absolute', animation: 'tg-comet-0 2s cubic-bezier(.45,.05,.35,.95) infinite' }} />
        </div>
      )}

      {variant === 'pinch' && (
        <div style={center}>
          <div style={{ ...dia(15), position: 'absolute', animation: 'tg-pinch-a 2.6s cubic-bezier(.45,.05,.35,.95) infinite' }} />
          <div style={{ ...dia(15), position: 'absolute', animation: 'tg-pinch-b 2.6s cubic-bezier(.45,.05,.35,.95) infinite' }} />
          <div style={{ ...chev, left: 12, top: 26, fontSize: 18, transform: 'rotate(45deg)', animation: 'tg-pinch-chev 2.6s ease-in-out infinite' }}>‹</div>
          <div style={{ ...chev, right: 12, bottom: 26, fontSize: 18, transform: 'rotate(-135deg)', animation: 'tg-pinch-chev 2.6s ease-in-out infinite' }}>‹</div>
        </div>
      )}
    </div>
  )
}
