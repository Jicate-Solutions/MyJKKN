import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ParadigmShiftService } from '@/lib/services/solutions/paradigm-shift-service'
import type { ReadinessTier } from '@/lib/services/solutions/paradigm-shift-service'
import { VALID_CLUSTERS } from '@/lib/services/solutions/clusters'
import type { SolutionsCluster } from '@/lib/services/solutions/clusters'
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
  const isSuperAdmin = auth.user.role === 'super_admin'
  const institution_id = isSuperAdmin
    ? requestedInstitution
    : auth.institutionId || requestedInstitution

  // Validate tier parameter
  const tierParam = url.searchParams.get('tier')
  if (tierParam && !VALID_TIERS.includes(tierParam as ReadinessTier)) {
    return errorResponse(`Invalid tier. Must be one of: ${VALID_TIERS.join(', ')}`, 400)
  }
  const tier = tierParam ? tierParam as ReadinessTier : undefined

  // Validate cluster parameter
  const clusterParam = url.searchParams.get('cluster')
  if (clusterParam && !VALID_CLUSTERS.includes(clusterParam as SolutionsCluster)) {
    return errorResponse(`Invalid cluster. Must be one of: ${VALID_CLUSTERS.join(', ')}`, 400)
  }
  const cluster = clusterParam ? clusterParam as SolutionsCluster : undefined

  const result = await ParadigmShiftService.runWithClient(auth.supabase, () =>
    ParadigmShiftService.getOverview({ institution_id, tier, cluster })
  )

  return successApiResponse(result)
}, { requiredPermission: 'read' })
