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

// Scans from each edge inward; stops when average row/col color
// diverges from the border reference by more than THRESH.
export async function detectContentBounds(src: string): Promise<CropRect> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const W = img.naturalWidth, H = img.naturalHeight
      if (!W || !H) { resolve({ x: 0, y: 0, width: 1, height: 1 }); return }
      const SW = Math.min(W, 320), SH = Math.min(H, 480)
      const canvas = document.createElement('canvas')
      canvas.width = SW; canvas.height = SH
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, SW, SH)
      const data = ctx.getImageData(0, 0, SW, SH).data
      const THRESH = 20
      function rowAvg(y: number): [number, number, number] {
        let r = 0, g = 0, b = 0
        for (let x = 0; x < SW; x++) { const i = (y * SW + x) * 4; r += data[i]; g += data[i+1]; b += data[i+2] }
        return [r / SW, g / SW, b / SW]
      }
      function colAvg(x: number): [number, number, number] {
        let r = 0, g = 0, b = 0
        for (let y = 0; y < SH; y++) { const i = (y * SW + x) * 4; r += data[i]; g += data[i+1]; b += data[i+2] }
        return [r / SH, g / SH, b / SH]
      }
      function diff(a: [number,number,number], b: [number,number,number]) {
        return (Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]) + Math.abs(a[2]-b[2])) / 3
      }
      let top = 0, bottom = SH - 1, left = 0, right = SW - 1
      const refTop = rowAvg(0)
      for (let y = 1; y < SH; y++) { if (diff(rowAvg(y), refTop) > THRESH) { top = y; break } }
      const refBot = rowAvg(SH - 1)
      for (let y = SH - 2; y > top; y--) { if (diff(rowAvg(y), refBot) > THRESH) { bottom = y; break } }
      const refLeft = colAvg(0)
      for (let x = 1; x < SW; x++) { if (diff(colAvg(x), refLeft) > THRESH) { left = x; break } }
      const refRight = colAvg(SW - 1)
      for (let x = SW - 2; x > left; x--) { if (diff(colAvg(x), refRight) > THRESH) { right = x; break } }
      const fx = left / SW, fy = top / SH
      const fw = (right - left) / SW, fh = (bottom - top) / SH
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
