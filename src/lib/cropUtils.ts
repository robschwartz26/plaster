// Shared image/crop utilities — used by Admin.tsx (import flow) and AdminEditModal.tsx (wall edit)

export interface CropRect { x: number; y: number; width: number; height: number }
export type CropHandle = 'tl' | 'tc' | 'tr' | 'ml' | 'mr' | 'bl' | 'bc' | 'br'

export function clampN(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }

export function applyHandleDrag(c: CropRect, handle: CropHandle, dx: number, dy: number): CropRect {
  const MIN = 0.04
  const { x, y, width: w, height: h } = c
  const r = x + w, b = y + h
  switch (handle) {
    case 'tl': { const nx = clampN(x + dx, 0, r - MIN), ny = clampN(y + dy, 0, b - MIN); return { x: nx, y: ny, width: r - nx, height: b - ny } }
    case 'tc': { const ny = clampN(y + dy, 0, b - MIN); return { x, y: ny, width: w, height: b - ny } }
    case 'tr': { const ny = clampN(y + dy, 0, b - MIN); return { x, y: ny, width: clampN(r + dx - x, MIN, 1 - x), height: b - ny } }
    case 'ml': { const nx = clampN(x + dx, 0, r - MIN); return { x: nx, y, width: r - nx, height: h } }
    case 'mr': { return { x, y, width: clampN(w + dx, MIN, 1 - x), height: h } }
    case 'bl': { const nx = clampN(x + dx, 0, r - MIN); return { x: nx, y, width: r - nx, height: clampN(h + dy, MIN, 1 - y) } }
    case 'bc': { return { x, y, width: w, height: clampN(h + dy, MIN, 1 - y) } }
    case 'br': { return { x, y, width: clampN(w + dx, MIN, 1 - x), height: clampN(h + dy, MIN, 1 - y) } }
  }
}

export async function optimizeImage(file: File, crop?: CropRect): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const MAX = 1200
      const hasCrop = crop && !(crop.x === 0 && crop.y === 0 && crop.width === 1 && crop.height === 1)
      const srcX = hasCrop ? crop!.x * img.width : 0
      const srcY = hasCrop ? crop!.y * img.height : 0
      const srcW = hasCrop ? crop!.width * img.width : img.width
      const srcH = hasCrop ? crop!.height * img.height : img.height
      let dstW = srcW, dstH = srcH
      if (dstW > MAX || dstH > MAX) {
        if (dstW > dstH) { dstH = Math.round(dstH * MAX / dstW); dstW = MAX }
        else { dstW = Math.round(dstW * MAX / dstH); dstH = MAX }
      }
      const canvas = document.createElement('canvas')
      canvas.width = dstW; canvas.height = dstH
      canvas.getContext('2d')!.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, dstW, dstH)
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('toBlob failed')), 'image/jpeg', 0.85)
    }
    img.onerror = reject
    img.src = url
  })
}

export async function sampleCornerColors(url: string): Promise<string[]> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const W = img.width, H = img.height
      const canvas = document.createElement('canvas')
      canvas.width = W; canvas.height = H
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const px = (x: number, y: number) => {
        const d = ctx.getImageData(x, y, 1, 1).data
        return `rgb(${d[0]},${d[1]},${d[2]})`
      }
      resolve([px(4, 4), px(W - 5, 4), px(4, H - 5), px(W - 5, H - 5)])
    }
    img.onerror = () => resolve(['#1a1a2e', '#16213e', '#0f3460', '#533483'])
    img.src = url
  })
}

// Returns the crop rect if solid uniform borders are detected (near-white or near-black),
// or null if no solid borders are found. Uses a 400px-wide canvas.
export async function detectContentBounds(src: string): Promise<CropRect | null> {
  console.log('[detectContentBounds] Starting for:', src)
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      console.log('[detectContentBounds] Image loaded, natural size:', img.naturalWidth, 'x', img.naturalHeight)
      try {
        const NW = img.naturalWidth, NH = img.naturalHeight
        if (!NW || !NH) { console.warn('[detectContentBounds] Zero dimensions'); resolve(null); return }

        const CW = 400
        const CH = Math.round(NH * CW / NW)
        const canvas = document.createElement('canvas')
        canvas.width = CW; canvas.height = CH
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, CW, CH)
        const data = ctx.getImageData(0, 0, CW, CH).data

        const SAMPLES = 10
        const BUFFER = 3
        const CONTENT_THRESH = 25  // diff from border ref to detect content start

        // Sample luminance values along an edge — returns { avg, variance }
        function sampleEdgeLum(coords: [number, number][]): { avg: number; variance: number } {
          const lums: number[] = []
          for (const [x, y] of coords) {
            const i = (y * CW + x) * 4
            lums.push((data[i] + data[i + 1] + data[i + 2]) / 3)
          }
          const avg = lums.reduce((a, v) => a + v, 0) / lums.length
          const variance = lums.reduce((a, v) => a + (v - avg) ** 2, 0) / lums.length
          return { avg, variance }
        }

        // Build sample coords for a row or column
        function rowCoords(y: number): [number, number][] {
          return Array.from({ length: SAMPLES }, (_, s) => [Math.floor(s * (CW - 1) / (SAMPLES - 1)), y] as [number, number])
        }
        function colCoords(x: number): [number, number][] {
          return Array.from({ length: SAMPLES }, (_, s) => [x, Math.floor(s * (CH - 1) / (SAMPLES - 1))] as [number, number])
        }

        // A border is "solid" if near-white (avg > 220) or near-black (avg < 30, variance < 10)
        function isSolidBorder(e: { avg: number; variance: number }): boolean {
          return e.avg > 220 || (e.avg < 30 && e.variance < 10)
        }

        const topEdge    = sampleEdgeLum(rowCoords(0))
        const bottomEdge = sampleEdgeLum(rowCoords(CH - 1))
        const leftEdge   = sampleEdgeLum(colCoords(0))
        const rightEdge  = sampleEdgeLum(colCoords(CW - 1))

        console.log('[detectContentBounds] Edges — top:', topEdge, 'bottom:', bottomEdge, 'left:', leftEdge, 'right:', rightEdge)

        const solidCount = [topEdge, bottomEdge, leftEdge, rightEdge].filter(isSolidBorder).length
        console.log('[detectContentBounds] Solid border edges:', solidCount)

        if (solidCount === 0) {
          console.log('[detectContentBounds] No solid borders detected — returning null')
          resolve(null)
          return
        }

        // Scan inward from each solid edge to find content start
        function rowAvgRGB(y: number): [number, number, number] {
          let r = 0, g = 0, b = 0
          for (let s = 0; s < SAMPLES; s++) {
            const x = Math.floor(s * (CW - 1) / (SAMPLES - 1))
            const i = (y * CW + x) * 4
            r += data[i]; g += data[i + 1]; b += data[i + 2]
          }
          return [r / SAMPLES, g / SAMPLES, b / SAMPLES]
        }
        function colAvgRGB(x: number): [number, number, number] {
          let r = 0, g = 0, b = 0
          for (let s = 0; s < SAMPLES; s++) {
            const y = Math.floor(s * (CH - 1) / (SAMPLES - 1))
            const i = (y * CW + x) * 4
            r += data[i]; g += data[i + 1]; b += data[i + 2]
          }
          return [r / SAMPLES, g / SAMPLES, b / SAMPLES]
        }
        function diff(a: [number, number, number], b: [number, number, number]): number {
          return (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3
        }

        const topRef    = rowAvgRGB(0)
        const bottomRef = rowAvgRGB(CH - 1)
        const leftRef   = colAvgRGB(0)
        const rightRef  = colAvgRGB(CW - 1)

        let top = -1, bottom = -1, left = -1, right = -1
        if (isSolidBorder(topEdge))    for (let y = 0; y < CH; y++)       { if (diff(rowAvgRGB(y), topRef) > CONTENT_THRESH)    { top    = Math.min(y + BUFFER, CH - 1); break } }
        if (isSolidBorder(bottomEdge)) for (let y = CH - 1; y >= 0; y--)  { if (diff(rowAvgRGB(y), bottomRef) > CONTENT_THRESH) { bottom = Math.max(y - BUFFER, 0);      break } }
        if (isSolidBorder(leftEdge))   for (let x = 0; x < CW; x++)       { if (diff(colAvgRGB(x), leftRef) > CONTENT_THRESH)   { left   = Math.min(x + BUFFER, CW - 1); break } }
        if (isSolidBorder(rightEdge))  for (let x = CW - 1; x >= 0; x--)  { if (diff(colAvgRGB(x), rightRef) > CONTENT_THRESH)  { right  = Math.max(x - BUFFER, 0);      break } }

        // Fall back to full edge for any side with no solid border
        if (top    === -1) top    = 0
        if (bottom === -1) bottom = CH - 1
        if (left   === -1) left   = 0
        if (right  === -1) right  = CW - 1

        console.log('[detectContentBounds] Content edges (canvas px) — top:', top, 'bottom:', bottom, 'left:', left, 'right:', right)

        if (bottom <= top || right <= left) { resolve(null); return }

        const fx = left / CW, fy = top / CH
        const fw = (right - left) / CW, fh = (bottom - top) / CH

        if (fx < 0.02 && fy < 0.02 && fw > 0.96 && fh > 0.96) {
          console.log('[detectContentBounds] Bounds nearly full — returning null')
          resolve(null)
        } else {
          const result = { x: fx, y: fy, width: Math.min(fw, 1 - fx), height: Math.min(fh, 1 - fy) }
          console.log('[detectContentBounds] Result:', result)
          resolve(result)
        }
      } catch (err) {
        console.error('[detectContentBounds] Canvas error (possible CORS taint):', err)
        resolve(null)
      }
    }
    img.onerror = (err) => {
      console.error('[detectContentBounds] Image load error:', err)
      resolve(null)
    }
    img.src = src
  })
}
