import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { FoundationsService } from '@/lib/services/startup-studio/foundations-service'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// POST /api/startup-studio/foundations/responses/[id]/review — mentor feedback (quality flag)
export const POST = withAuth(
  async (request, auth, context) => {
    const { id: responseId } = await context!.params!
    const body = await request.json()
    const response = await FoundationsService.reviewResponse(
      responseId,
      { mentor_feedback: body.mentor_feedback, mentor_rating: body.mentor_rating },
      auth.user.id
    )
    return successApiResponse(response)
  },
  { requiredPermission: 'write', requirePermission: 'startup_studio.foundations.review' }
)
