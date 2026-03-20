import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ParadigmShiftService } from '@/lib/services/solutions/paradigm-shift-service'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  void request; // required by withAuth signature
  const url = new URL(request.url)
  const institution_id = url.searchParams.get('institution_id') || undefined
  const limit = parseInt(url.searchParams.get('limit') || '50', 10)

  const result = await ParadigmShiftService.runWithClient(auth.supabase, () =>
    ParadigmShiftService.getLeaderboard({ institution_id, limit })
  )

  return successApiResponse(result)
}, { requiredPermission: 'read' })
