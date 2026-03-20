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
  const institution_id = url.searchParams.get('institution_id') || undefined
  const tier = url.searchParams.get('tier') as 'traditional' | 'emerging' | 'solution_ready' | 'pioneer' | undefined

  const result = await ParadigmShiftService.runWithClient(auth.supabase, () =>
    ParadigmShiftService.getOverview({ institution_id, tier })
  )

  return successApiResponse(result)
}, { requiredPermission: 'read' })
