import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const serviceKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY as string

// Service role client — bypasses RLS. Only used on the admin page.
// Never expose this key to end users.
export const supabaseAdmin = createClient(supabaseUrl, serviceKey || '')
