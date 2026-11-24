import { useMemo, useRef, useState } from 'react'
import type { ChartPalette } from './chartTokens'

export interface ChartSeries {
  label: string
  color: string
  values: (number | null)[]
}

// A time-series line chart. One y-axis, always — two measures of different
// scale get two charts, never a second axis, because a dual axis lets you slide
// one series over the other until they appear to correlate.
//
// Null handling is the same rule as Spark: a gap is a gap. A missing day breaks
// the path, and the tooltip says "no data" rather than showing a zero.
export function TrendChart({ series, days, pal, height = 180, valueFmt = String }: {
  series: ChartSeries[]
  days: string[]              // ISO day per index, for the tooltip
  pal: ChartPalette
  height?: number
  valueFmt?: (n: number) => string
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [width, setWidth] = useState(600)

  // Measure once per layout; the SVG scales to the panel, which resizes.
  const onResize = (el: HTMLDivElement | null) => {
    if (el && el.clientWidth && el.clientWidth !== width) setWidth(el.clientWidth)
  }

  const PAD_L = 38, PAD_R = 14, PAD_T = 12, PAD_B = 20
  const plotW = Math.max(40, width - PAD_L - PAD_R)
  const plotH = Math.max(40, height - PAD_T - PAD_B)

  const { min, max, paths, lastPoints } = useMemo(() => {
    const all = series.flatMap(s => s.values).filter((v): v is number => v !== null)
    const lo = all.length ? Math.min(...all, 0) : 0
    const hi = all.length ? Math.max(...all) : 1
    const span = hi - lo || 1
    const n = days.length
    const x = (i: number) => PAD_L + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2)
    const y = (v: number) => PAD_T + plotH - ((v - lo) / span) * plotH

    const paths = series.map(s => {
      let d = ''
      let pen = false
      s.values.forEach((v, i) => {
        if (v === null) { pen = false; return }
        d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `
        pen = true
      })
      return d.trim()
    })

    // Direct labels: the last measured point of each series. This is the relief
    // the palette validator demands in day mode, where these hues drop below
    // 3:1 against the cream surface and colour alone can't separate them.
    const lastPoints = series.map(s => {
      for (let i = s.values.length - 1; i >= 0; i--) {
        const v = s.values[i]
        if (v !== null) return { i, v, x: x(i), y: y(v) }
      }
      return null
    })

    return { min: lo, max: hi, paths, lastPoints }
  }, [series, days.length, plotW, plotH, PAD_L, PAD_T])

  const n = days.length
  const xAt = (i: number) => PAD_L + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2)

  function move(e: React.MouseEvent<HTMLDivElement>) {
    const box = wrapRef.current?.getBoundingClientRect()
    if (!box || n === 0) return
    const rel = e.clientX - box.left - PAD_L
    const i = Math.round((rel / plotW) * (n - 1))
    setHover(i >= 0 && i < n ? i : null)
  }

  const tick = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)))

  return (
    <div
      ref={el => { wrapRef.current = el; onResize(el) }}
      onMouseMove={move}
      onMouseLeave={() => setHover(null)}
      style={{ position: 'relative', width: '100%', height }}
    >
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
        {/* Grid: recessive. Three lines, no frame, no ticks on the x-axis. */}
        {[0, 0.5, 1].map(f => {
          const y = PAD_T + plotH * f
          const v = max - (max - min) * f
          return (
            <g key={f}>
              <line x1={PAD_L} x2={PAD_L + plotW} y1={y} y2={y} stroke={pal.grid} strokeWidth={1} />
              <text x={PAD_L - 6} y={y + 3} textAnchor="end"
                style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 9, fill: 'var(--fg-40)' }}>
                {tick(v)}
              </text>
            </g>
          )
        })}

        {paths.map((d, i) => d && (
          <path key={i} d={d} fill="none" stroke={series[i].color} strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round" />
        ))}

        {/* Direct label on the last measured point of each series. */}
        {lastPoints.map((p, i) => p && (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={3.5} fill={series[i].color}
              stroke={pal.surface} strokeWidth={2} />
          </g>
        ))}

        {hover !== null && (
          <line x1={xAt(hover)} x2={xAt(hover)} y1={PAD_T} y2={PAD_T + plotH}
            stroke={pal.axis} strokeWidth={1} />
        )}
      </svg>

      {hover !== null && days[hover] && (
        <div style={{
          position: 'absolute', top: 0,
          left: Math.min(Math.max(xAt(hover) + 8, 0), Math.max(width - 150, 0)),
          pointerEvents: 'none', background: 'var(--bg)',
          border: '1px solid var(--fg-18)', borderRadius: 7, padding: '6px 9px',
          fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, minWidth: 108,
          boxShadow: '0 4px 14px rgba(0,0,0,0.3)', zIndex: 2,
        }}>
          <div style={{ color: 'var(--fg-40)', marginBottom: 3, fontSize: 10 }}>{days[hover]}</div>
          {series.map((s, i) => {
            const v = s.values[hover]
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, lineHeight: 1.5 }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                <span style={{ color: 'var(--fg-55)', flex: 1 }}>{s.label}</span>
                {/* Text wears text tokens; the swatch carries identity. */}
                <span style={{ color: 'var(--fg)', fontWeight: 600 }}>
                  {v === null ? 'no data' : valueFmt(v)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
