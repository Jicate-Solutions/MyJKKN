import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { GraduationService } from '@/lib/services/startup-studio/graduation-service'
import { successApiResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const result = await GraduationService.evaluateReadiness(id)
  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()

  if (!body.criteria_results || !Array.isArray(body.criteria_results)) {
    return errorResponse('criteria_results array is required', 400)
  }

  const result = await GraduationService.createEvaluation(id, body)
  return createdResponse(result)
})
