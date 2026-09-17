import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { VenuesService } from '@/lib/services/startup-studio/venues-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'
import { isValidUuid } from '@/lib/api-keys/query-helpers'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// Auto-distribute unallocated teams across venues
export const POST = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  if (!isValidUuid(id)) return errorResponse('Invalid event ID format', 400)

  const body = await request.json()

  if (!body.day_type) return errorResponse('day_type is required', 400)
  const VALID_DAY_TYPES = ['build_day', 'demo_day']
  if (!VALID_DAY_TYPES.includes(body.day_type)) {
    return errorResponse(`Invalid day_type. Must be one of: ${VALID_DAY_TYPES.join(', ')}`, 400)
  }

  const result = await VenuesService.autoAllocateTeams(id, body.day_type)
  return successApiResponse({ allocated: result.allocated, total: result.total })
}, { requireRole: ['admin', 'super_admin'] })
