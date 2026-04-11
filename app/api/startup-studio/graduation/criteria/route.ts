import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { GraduationService } from '@/lib/services/startup-studio/graduation-service'
import { successApiResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const institutionId = getStringParam(url, 'institution_id')

  const result = await GraduationService.getCriteria(institutionId)
  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()
  if (!body.name || !body.criteria_type) {
    return errorResponse('name and criteria_type are required', 400)
  }

  const result = await GraduationService.createCriteria(body)
  return createdResponse(result)
})
