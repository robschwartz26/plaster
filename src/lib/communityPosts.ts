import { supabase } from '@/lib/supabase'

export type CommunityPostType = 'personal' | 'business' | 'lost_pet'
export type CommunityPostStatus = 'pending' | 'published' | 'rejected' | 'expired'

export interface CommunityPost {
  id: string
  author_id: string
  neighborhood: string
  sextant: string
  post_type: CommunityPostType
  title: string | null
  body: string | null
  image_url: string | null
  status: CommunityPostStatus
  is_paid: boolean
  flagged: boolean
  flag_reason: string | null
  expires_at: string | null
  created_at: string
  author?: { username: string | null; avatar_diamond_url: string | null } | null
}

export interface SubmitResult { id: string; status: CommunityPostStatus; flagged: boolean; reason: string }

const SELECT = '*, author:profiles!author_id(username, avatar_diamond_url)'

// Region wall: RLS returns published+non-expired posts in the viewer's sextant
// plus the viewer's own posts (any status), so a freshly-submitted pending post
// is visible to its author with a "pending review" badge.
export async function fetchRegionPosts(sextant: string): Promise<CommunityPost[]> {
  const { data, error } = await supabase
    .from('community_posts')
    .select(SELECT)
    .eq('sextant', sextant)
    .neq('status', 'rejected')
    .order('created_at', { ascending: false })
  if (error) { console.error('[communityPosts] fetch failed', error); return [] }
  return (data ?? []) as unknown as CommunityPost[]
}

// Submit via the edge function — AI moderation decides published vs pending.
export async function submitCommunityPost(params: {
  base64: string; mimeType: string; title?: string; body?: string; post_type?: CommunityPostType
}): Promise<SubmitResult> {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('You must be signed in.')
  const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-community-post`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({
      image: { base64: params.base64, mimeType: params.mimeType },
      title: params.title, body: params.body, post_type: params.post_type,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `Failed (${res.status})`)
  return data as SubmitResult
}
