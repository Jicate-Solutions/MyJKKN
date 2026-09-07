import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ResidentPromotionService } from '@/lib/services/solutions/resident-promotion-service'
import { successResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

/**
 * Residents who have earned promotion to builder.
 *
 * Returns { candidates, diagnostics }. An empty `candidates` array is a normal
 * result, not an error — `diagnostics.blocking_reason` says why in plain words.
 */
export const GET = withAuth(async () => {
  const result = await ResidentPromotionService.getPromotionCandidates()
  return successResponse(result)
}, { requiredPermission: 'read' })

/**
 * Promote one eligible resident into sh_builders.
 * The service refuses anyone who is not on the candidate list.
 */
export const POST = withAuth(async (request) => {
  const body = await request.json()
  if (!body?.user_id) {
    return errorResponse('user_id is required', 400)
  }

  try {
    const builder = await ResidentPromotionService.promoteResident(
      body.user_id,
      body.specialization,
    )
    return createdResponse(builder)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Promotion failed'
    // Ineligibility is a 422, not a 500 — the request was well-formed, the
    // learner simply has not earned it yet.
    const status = message.includes('not eligible') ? 422 : 500
    return errorResponse(message, status)
  }
})
