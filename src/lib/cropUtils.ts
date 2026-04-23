// Shared image/crop utilities — used by Admin.tsx (import flow) and AdminEditModal.tsx (wall edit)

// Resize an image for AI extraction — stays under Anthropic's ~5 MB per-image limit.
export async function resizeForExtraction(file: File, maxDim = 1600, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas context unavailable')
  ctx.drawImage(bitmap, 0, 0, w, h)
  return await canvas.convertToBlob({ type: 'image/jpeg', quality })
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

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

