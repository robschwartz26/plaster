// The tour's swipe hint: a three-frame cat who sits still and swipes.
//
// It replaces a lone paw that glided across the screen. The glide read as "something
// is moving", not as "YOU swipe" — and a disembodied paw drifting over a poster was
// easy to miss entirely. A cat planted in the corner, winding up and then batting to
// the left, is a gesture someone is performing, which is the thing being taught.
//
// All three frames share one canvas (500x520, exported from one drawing), so the body
// never shifts and only the paw moves. They are stacked and cross-cut by opacity —
// every frame is mounted from the start, so the first loop never flashes an unloaded
// image the way a src swap would.
//
// The art is filled: white inside a heavy black outline. Unlike the finger line-art in
// HandGhost it is NOT inverted — it carries its own contrast on a bright poster and on
// the dark wall alike (see the paw note in HandGhost.tsx). Shadows only, to lift it off
// whatever artwork is behind it.

const FRAMES = [
  '/tour/cat-01-ready.png',   // paw tucked, waiting
  '/tour/cat-02-reach.png',   // paw up, the wind-up
  '/tour/cat-03-swipe.png',   // paw thrown left, motion lines
]

const REDUCE = typeof window !== 'undefined'
  && !!window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// 1.9s loop, matching the rhythm of the paw it replaces. Ready holds, the reach is a
// quick beat, the swipe holds longest — that is the frame carrying the instruction.
// Hard cuts, not fades: three drawings read as animation, a dissolve reads as a blur.
const CYCLE = '1.9s'

// Three chevrons thrown left out of the paw, on the same 1.9s clock as the frames so
// they can only appear during the swipe (32%-87%) — never while the cat is still
// winding up, which would point before there was anything to point at. They are
// staggered by writing each its own window rather than by animation-delay: a delay
// shifts a loop's phase, and these have to stay locked to the frame cuts.
//
// The arrow does the job the gliding paw used to: it says WHICH WAY. The cat alone
// showed the motion but not the direction, and the old thin-line paw is the one that
// disappeared into a bright poster — so direction is carried by high-contrast marks
// instead of by more line-art.
const KEYFRAMES = `
@keyframes cat-f1 {0%,20%{opacity:1} 20.01%,86.99%{opacity:0} 87%,100%{opacity:1}}
@keyframes cat-f2 {0%,20%{opacity:0} 20.01%,32%{opacity:1} 32.01%,100%{opacity:0}}
@keyframes cat-f3 {0%,32%{opacity:0} 32.01%,87%{opacity:1} 87.01%,100%{opacity:0}}
@keyframes cat-arw1 {0%,32%{opacity:0;transform:translateX(10%)} 39%{opacity:1} 66%{opacity:1} 82%,100%{opacity:0;transform:translateX(-150%)}}
@keyframes cat-arw2 {0%,36%{opacity:0;transform:translateX(10%)} 43%{opacity:.72} 70%{opacity:.72} 86%,100%{opacity:0;transform:translateX(-150%)}}
@keyframes cat-arw3 {0%,40%{opacity:0;transform:translateX(10%)} 47%{opacity:.44} 74%{opacity:.44} 90%,100%{opacity:0;transform:translateX(-150%)}}
`

// Natural size of the shared canvas — the box keeps this ratio so the cat is never
// squashed, whatever width a step asks for.
const W = 500, H = 520

// Where the chevrons start: level with the outstretched paw in frame 3, just beyond
// its tip. Fractions of the shared canvas, so they land on the paw at any size.
// PAW_TOP is the row's CENTRE (the row is translated up by half its height).
const PAW_TOP = 0.33, PAW_LEFT = 0.02

export function CatSwipe({ size = 230 }: { size?: number }) {
  const frame: React.CSSProperties = {
    position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain',
    pointerEvents: 'none', userSelect: 'none',
    filter: 'drop-shadow(0 2px 7px rgba(0,0,0,0.55)) drop-shadow(0 0 3px rgba(0,0,0,0.45))',
  }

  // Reduced motion: hold the swipe frame. It is the one that states the gesture.
  if (REDUCE) {
    return (
      <div role="img" aria-label="Swipe sideways" style={{ position: 'relative', width: size, height: size * (H / W), pointerEvents: 'none' }}>
        <img src={FRAMES[2]} alt="" draggable={false} style={frame} />
      </div>
    )
  }

  return (
    <div role="img" aria-label="Swipe sideways" style={{ position: 'relative', width: size, height: size * (H / W), pointerEvents: 'none' }}>
      <style>{KEYFRAMES}</style>
      {FRAMES.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          draggable={false}
          style={{ ...frame, opacity: i === 0 ? 1 : 0, animation: `cat-f${i + 1} ${CYCLE} steps(1, end) infinite` }}
        />
      ))}
      {/* The swipe's direction, flung out of the paw and off to the left. Sits outside
          the cat's box on purpose — the box is pinned to the poster's corner, so the
          chevrons travel across the artwork the way the user's thumb should. */}
      <div style={{ position: 'absolute', right: `${(1 - PAW_LEFT) * 100}%`, top: `${PAW_TOP * 100}%`, transform: 'translateY(-50%)', display: 'flex', gap: size * 0.012, pointerEvents: 'none' }}>
        {[1, 2, 3].map(n => (
          <span
            key={n}
            style={{
              // Drawn like the cat: white filled, heavy dark outline. A plain white
              // glyph with a shadow washed out on a cream poster — the same failure
              // the thin-line paw had. The stroke is what makes it hold anywhere.
              fontSize: size * 0.3, lineHeight: 0.8, fontWeight: 400, color: '#fff',
              WebkitTextStroke: `${Math.max(2, size * 0.016)}px #121212`,
              paintOrder: 'stroke fill',
              filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.45))',
              opacity: 0, animation: `cat-arw${n} ${CYCLE} cubic-bezier(.3,0,.5,1) infinite`,
            }}
          >‹</span>
        ))}
      </div>
    </div>
  )
}
