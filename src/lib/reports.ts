/**
 * Content reporting helpers.
 *
 * One-shot insert into content_reports. RLS allows reporters to
 * insert + select-own. Admin queue picks them up downstream.
 */

import { supabase } from '@/lib/supabase'

export type ReportTargetKind = 'profile' | 'wall_post' | 'message'

export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'hate_speech'
  | 'sexual_content'
  | 'violence'
  | 'self_harm'
  | 'other'

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: 'Spam',
  harassment: 'Harassment or bullying',
  hate_speech: 'Hate speech or discrimination',
  sexual_content: 'Sexual or inappropriate content',
  violence: 'Violence or threats',
  self_harm: 'Self-harm or suicide',
  other: 'Something else',
}

export interface SubmitReportArgs {
  targetKind: ReportTargetKind
  targetId: string
  targetUserId: string
  reason: ReportReason
  notes?: string
}

export async function submitReport(args: SubmitReportArgs): Promise<{ error: Error | null }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: new Error('not authenticated') }

  const { error } = await supabase.from('content_reports').insert({
    reporter_id: user.id,
    target_kind: args.targetKind,
    target_id: args.targetId,
    target_user_id: args.targetUserId,
    reason: args.reason,
    notes: args.notes ?? null,
  })

  if (error) {
    console.error('[submitReport] insert failed:', error)
    return { error }
  }
  return { error: null }
}
