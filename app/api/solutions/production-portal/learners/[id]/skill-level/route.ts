import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ProductionService } from '@/lib/services/solutions/production-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const PATCH = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()

  if (!body.skill_level) {
    return errorResponse('skill_level is required', 400)
  }

  const result = await ProductionService.updateSkillLevel(id, body.skill_level)
  return successApiResponse(result)
})
