import { useMemo } from 'react'

// A sparkline: shape only, no axes, no labels. It sits under a stat tile whose
// number carries the value, so the line only has to answer "which way, and how
// steadily". Deliberately not interactive — the tile's number is the readout.
//
// Gaps are the whole trick. A null breaks the path rather than joining through,
// because a joined line across missing days invents a trend that was never
// measured.
export function Spark({ values, color, width = 104, height = 28 }: {
  values: (number | null)[]
  color: string
  width?: number
  height?: number
}) {
  const path = useMemo(() => {
    const measured = values.filter((v): v is number => v !== null)
    if (measured.length < 2) return null
    const min = Math.min(...measured)
    const max = Math.max(...measured)
    const span = max - min || 1
    const stepX = values.length > 1 ? width / (values.length - 1) : width
    // 1.5px inset top and bottom so a 2px stroke at the extremes isn't clipped.
    const y = (v: number) => height - 1.5 - ((v - min) / span) * (height - 3)

    let d = ''
    let pen = false
    values.forEach((v, i) => {
      if (v === null) { pen = false; return }
      const cmd = pen ? 'L' : 'M'
      d += `${cmd}${(i * stepX).toFixed(1)},${y(v).toFixed(1)} `
      pen = true
    })
    return d.trim() || null
  }, [values, width, height])

  if (!path) {
    return <div style={{ width, height }} aria-hidden="true" />
  }
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true"
      style={{ display: 'block', overflow: 'visible' }}>
      <path d={path} fill="none" stroke={color} strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
