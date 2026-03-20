import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ParadigmShiftService } from '@/lib/services/solutions/paradigm-shift-service'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

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

  // Clamp limit to valid range
  const parsed = parseInt(url.searchParams.get('limit') || '50', 10)
  const limit = Math.max(1, Math.min(isNaN(parsed) ? 50 : parsed, 200))

  const result = await ParadigmShiftService.runWithClient(auth.supabase, () =>
    ParadigmShiftService.getLeaderboard({ institution_id, limit })
  )

  return successApiResponse(result)
}, { requiredPermission: 'read' })
