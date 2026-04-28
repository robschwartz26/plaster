// Validate required environment variables at app boot.
// Failing here is intentional — better to fail fast and loud than to fail mysteriously deep in the call stack.

interface RequiredEnv {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  MAPBOX_TOKEN: string
}

function readEnv(): RequiredEnv {
  const missing: string[] = []

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
  if (!SUPABASE_URL) missing.push('VITE_SUPABASE_URL')

  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!SUPABASE_ANON_KEY) missing.push('VITE_SUPABASE_ANON_KEY')

  const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
  if (!MAPBOX_TOKEN) missing.push('VITE_MAPBOX_TOKEN')

  if (missing.length > 0) {
    const msg = `Missing required environment variables: ${missing.join(', ')}\n\n` +
      'Check your .env.local (local dev) or Vercel project settings (production).'
    throw new Error(msg)
  }

  return {
    SUPABASE_URL: SUPABASE_URL!,
    SUPABASE_ANON_KEY: SUPABASE_ANON_KEY!,
    MAPBOX_TOKEN: MAPBOX_TOKEN!,
  }
}

export const env = readEnv()
