const SNAP = [200, 400, 600, 800, 1200]

export function posterThumb(url: string | null | undefined, cssWidth: number): string | undefined {
  if (!url) return undefined
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 3) : 1
  const raw = Math.round(cssWidth * dpr)
  const w = SNAP.find(s => s >= raw) ?? SNAP[SNAP.length - 1]
  if (!url.includes('/storage/v1/object/public/')) return url
  return url.replace('/object/public/', '/render/image/public/') + `?width=${w}&quality=75&resize=contain`
}
