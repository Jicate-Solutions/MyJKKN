import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { SubmissionsService } from '@/lib/services/startup-studio/submissions-service'
import { createdResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const POST = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()

  // --- Fix 6: Scoring access control ---
  // Only admins or the judge themselves can submit scores
  const isAdmin = auth.user.role === 'admin' || auth.user.role === 'super_admin'

  // For non-admins: force judge_id to be the logged-in user (ignore body's judge_id)
  const judgeId = isAdmin ? (body.judge_id || auth.user.id) : auth.user.id

  // Duplicate prevention: check if this judge already scored this submission
  const { data: existing } = await auth.supabase
    .from('ss_judge_scores')
    .select('id')
    .eq('submission_id', id)
    .eq('judge_id', judgeId)
    .maybeSingle()

  if (existing) {
    return errorResponse('You have already scored this submission. Use PATCH to update.', 409)
  }

  const result = await SubmissionsService.addJudgeScore(id, judgeId, body)
  return createdResponse(result)
})
