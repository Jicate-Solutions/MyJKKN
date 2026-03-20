import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ParadigmShiftService } from '@/lib/services/solutions/paradigm-shift-service'
import type { ReadinessTier } from '@/lib/services/solutions/paradigm-shift-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

const VALID_TIERS: ReadinessTier[] = ['traditional', 'emerging', 'solution_ready', 'pioneer'];

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)

  // Institution scoping: non-super_admin users are scoped to their institution
  const requestedInstitution = url.searchParams.get('institution_id') || undefined
  const institution_id = auth.isSuperAdmin
    ? requestedInstitution
    : auth.institutionId || requestedInstitution

  // Validate tier parameter
  const tierParam = url.searchParams.get('tier')
  if (tierParam && !VALID_TIERS.includes(tierParam as ReadinessTier)) {
    return errorResponse(`Invalid tier. Must be one of: ${VALID_TIERS.join(', ')}`, 400)
  }
  const tier = tierParam ? tierParam as ReadinessTier : undefined

  const result = await ParadigmShiftService.runWithClient(auth.supabase, () =>
    ParadigmShiftService.getOverview({ institution_id, tier })
  )

  return successApiResponse(result)
}, { requiredPermission: 'read' })
