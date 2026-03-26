import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { CompetitiveMatrixService } from '@/lib/services/startup-studio/competitive-matrix-service'
import { successApiResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const result = await CompetitiveMatrixService.getCompetitors(id)
  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()

  if (!body.competitor_name) {
    return errorResponse('competitor_name is required', 400)
  }

  const result = await CompetitiveMatrixService.addCompetitor({
    ...body,
    candidate_id: id,
  })
  return createdResponse(result)
})
