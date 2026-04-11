import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { CompetitiveMatrixService } from '@/lib/services/startup-studio/competitive-matrix-service'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const PATCH = withAuth(async (request, auth, context) => {
  const { competitorId } = await context!.params!
  const body = await request.json()
  const result = await CompetitiveMatrixService.updateCompetitor(competitorId, body)
  return successApiResponse(result)
})

export const DELETE = withAuth(async (request, auth, context) => {
  const { competitorId } = await context!.params!
  await CompetitiveMatrixService.removeCompetitor(competitorId)
  return successApiResponse({ deleted: true })
})
