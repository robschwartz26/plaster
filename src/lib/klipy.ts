// Klipy GIF API client.
// API response shape (verified via test call):
//   { result: true, data: { data: [...gifs], has_next, current_page, per_page } }
// Each gif: { id, slug, title, type, blur_preview, file: { xs|sm|md|hd: { gif|webp|mp4|jpg: { url, width, height } } } }
//
// Free tier with attribution required:
// - Search bar placeholder: "Search KLIPY" (REQUIRED)
// - "Powered by KLIPY" logo near search bar (REQUIRED for production approval)
// - "KLIPY" watermark on every rendered GIF (STRONGLY RECOMMENDED)

const API_KEY = import.meta.env.VITE_KLIPY_API_KEY as string
const BASE = 'https://api.klipy.com/api/v1'

// Inner file shape — all four format keys, each with url/width/height
export interface KlipyFileFormat {
  url: string
  width: number
  height: number
}

export interface KlipyFile {
  gif?: KlipyFileFormat
  webp?: KlipyFileFormat
  mp4?: KlipyFileFormat
  jpg?: KlipyFileFormat
}

export interface KlipyGif {
  id: string | number
  slug?: string
  title?: string
  type?: string
  blur_preview?: string | null
  file: {
    xs: KlipyFile
    sm: KlipyFile
    md: KlipyFile
    hd: KlipyFile
  }
}

// What our app passes around once a GIF is selected
export interface SelectedGif {
  url: string         // the .gif URL we'll store and render
  previewUrl: string  // small thumbnail for picker rows / pending preview
  width: number
  height: number
  sourceId: string    // klipy slug or id, for attribution share-back
}

// Inner Klipy API response shape (the data-of-data nesting is real)
interface KlipyApiResponseInner {
  data: KlipyGif[]
  has_next: boolean
  current_page?: number
  per_page?: number
}

interface KlipyApiResponseOuter {
  result: boolean
  data: KlipyApiResponseInner
}

async function klipyFetch(path: string, params: Record<string, string | number>): Promise<KlipyApiResponseInner> {
  if (!API_KEY) throw new Error('VITE_KLIPY_API_KEY not configured')
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v))
  const url = `${BASE}/${API_KEY}/${path}?${qs.toString()}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Klipy API ${res.status}`)
  const json = (await res.json()) as KlipyApiResponseOuter
  if (!json.result) throw new Error('Klipy API returned result=false')
  return json.data
}

export async function searchGifs(query: string, page = 1, perPage = 24, customUserId?: string): Promise<KlipyApiResponseInner> {
  const params: Record<string, string | number> = { q: query, page, per_page: perPage }
  if (customUserId) params.customer_id = customUserId
  return klipyFetch('gifs/search', params)
}

export async function trendingGifs(page = 1, perPage = 24, customUserId?: string): Promise<KlipyApiResponseInner> {
  const params: Record<string, string | number> = { page, per_page: perPage }
  if (customUserId) params.customer_id = customUserId
  return klipyFetch('gifs/trending', params)
}

// Picks the right size + format from a Klipy gif. md.gif is the right size for messaging
// bubbles. Falls back to sm.gif if md is missing for some reason.
export function gifToSelected(gif: KlipyGif): SelectedGif {
  const sendUrl = gif.file.md?.gif?.url ?? gif.file.sm?.gif?.url ?? ''
  const sendWidth = gif.file.md?.gif?.width ?? gif.file.sm?.gif?.width ?? 240
  const sendHeight = gif.file.md?.gif?.height ?? gif.file.sm?.gif?.height ?? 240
  const previewUrl = gif.file.xs?.gif?.url ?? gif.file.sm?.gif?.url ?? sendUrl
  return {
    url: sendUrl,
    previewUrl,
    width: sendWidth,
    height: sendHeight,
    sourceId: gif.slug ?? String(gif.id),
  }
}

// Klipy "share" event — best-effort fire-and-forget when user actually picks/sends a GIF
export function reportGifShare(gifSlug: string, customUserId?: string): void {
  if (!gifSlug) return
  const params = new URLSearchParams()
  if (customUserId) params.set('customer_id', customUserId)
  fetch(`${BASE}/${API_KEY}/gifs/${gifSlug}/share?${params.toString()}`, { method: 'POST' })
    .catch(() => { /* silent */ })
}
