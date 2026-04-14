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

// Scans from each edge inward on a 400px-wide canvas.
// Uses row 0 average as reference for top/bottom scans and col 0 average for left/right scans.
// Threshold: 25 mean absolute difference. Buffer: 3px inward after detection.
// Returns full image if no threshold is ever exceeded.
export async function detectContentBounds(src: string): Promise<CropRect> {
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const NW = img.naturalWidth, NH = img.naturalHeight
      if (!NW || !NH) { resolve({ x: 0, y: 0, width: 1, height: 1 }); return }

      const CW = 400
      const CH = Math.round(NH * CW / NW)
      const canvas = document.createElement('canvas')
      canvas.width = CW; canvas.height = CH
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, CW, CH)
      const data = ctx.getImageData(0, 0, CW, CH).data

      const THRESH = 25
      const SAMPLES = 10
      const BUFFER = 3

      function rowAvg(y: number): [number, number, number] {
        let r = 0, g = 0, b = 0
        for (let s = 0; s < SAMPLES; s++) {
          const x = Math.floor(s * (CW - 1) / (SAMPLES - 1))
          const i = (y * CW + x) * 4
          r += data[i]; g += data[i + 1]; b += data[i + 2]
        }
        return [r / SAMPLES, g / SAMPLES, b / SAMPLES]
      }

      function colAvg(x: number): [number, number, number] {
        let r = 0, g = 0, b = 0
        for (let s = 0; s < SAMPLES; s++) {
          const y = Math.floor(s * (CH - 1) / (SAMPLES - 1))
          const i = (y * CW + x) * 4
          r += data[i]; g += data[i + 1]; b += data[i + 2]
        }
        return [r / SAMPLES, g / SAMPLES, b / SAMPLES]
      }

      function rowDiff(y: number, ref: [number, number, number]): number {
        const [r, g, b] = rowAvg(y)
        return (Math.abs(r - ref[0]) + Math.abs(g - ref[1]) + Math.abs(b - ref[2])) / 3
      }

      function colDiff(x: number, ref: [number, number, number]): number {
        const [r, g, b] = colAvg(x)
        return (Math.abs(r - ref[0]) + Math.abs(g - ref[1]) + Math.abs(b - ref[2])) / 3
      }

      const topRef = rowAvg(0)
      const bottomRef = rowAvg(CH - 1)
      const leftRef = colAvg(0)
      const rightRef = colAvg(CW - 1)

      let top = -1, bottom = -1, left = -1, right = -1

      for (let y = 0; y < CH; y++)         { if (rowDiff(y, topRef) > THRESH)    { top    = Math.min(y + BUFFER, CH - 1); break } }
      for (let y = CH - 1; y >= 0; y--)   { if (rowDiff(y, bottomRef) > THRESH) { bottom = Math.max(y - BUFFER, 0);     break } }
      for (let x = 0; x < CW; x++)         { if (colDiff(x, leftRef) > THRESH)   { left   = Math.min(x + BUFFER, CW - 1); break } }
      for (let x = CW - 1; x >= 0; x--)   { if (colDiff(x, rightRef) > THRESH)  { right  = Math.max(x - BUFFER, 0);     break } }

      // If any edge never exceeded the threshold, return full image
      if (top === -1 || bottom === -1 || left === -1 || right === -1 || bottom <= top || right <= left) {
        resolve({ x: 0, y: 0, width: 1, height: 1 })
        return
      }

      const fx = left / CW, fy = top / CH
      const fw = (right - left) / CW, fh = (bottom - top) / CH

      if (fx < 0.02 && fy < 0.02 && fw > 0.96 && fh > 0.96) {
        resolve({ x: 0, y: 0, width: 1, height: 1 })
      } else {
        resolve({ x: fx, y: fy, width: Math.min(fw, 1 - fx), height: Math.min(fh, 1 - fy) })
      }
    }
    img.onerror = () => resolve({ x: 0, y: 0, width: 1, height: 1 })
    img.src = src
  })
}
