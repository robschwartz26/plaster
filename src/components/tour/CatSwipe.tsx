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
const KEYFRAMES = `
@keyframes cat-f1 {0%,20%{opacity:1} 20.01%,86.99%{opacity:0} 87%,100%{opacity:1}}
@keyframes cat-f2 {0%,20%{opacity:0} 20.01%,32%{opacity:1} 32.01%,100%{opacity:0}}
@keyframes cat-f3 {0%,32%{opacity:0} 32.01%,87%{opacity:1} 87.01%,100%{opacity:0}}
`

// Natural size of the shared canvas — the box keeps this ratio so the cat is never
// squashed, whatever width a step asks for.
const W = 500, H = 520

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
    </div>
  )
}
