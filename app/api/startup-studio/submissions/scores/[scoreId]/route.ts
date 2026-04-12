import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { SubmissionsService } from '@/lib/services/startup-studio/submissions-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const PATCH = withAuth(async (request, auth, context) => {
  const { scoreId } = await context!.params!
  const body = await request.json()

  // --- Fix 6: Ownership check for score updates ---
  const isAdmin = auth.user.role === 'admin' || auth.user.role === 'super_admin'

  if (!isAdmin) {
    // Verify the logged-in user is the original judge who created this score
    const { data: existingScore, error: fetchError } = await auth.supabase
      .from('ss_judge_scores')
      .select('judge_id')
      .eq('id', scoreId)
      .maybeSingle()

    if (fetchError || !existingScore) {
      return errorResponse('Score not found', 404)
    }

    if (existingScore.judge_id !== auth.user.id) {
      return errorResponse('You can only update your own scores', 403)
    }
  }

  const result = await SubmissionsService.updateJudgeScore(scoreId, body)
  return successApiResponse(result)
})
