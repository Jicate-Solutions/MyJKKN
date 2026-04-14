import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { PublicationsService } from '@/lib/services/solutions/publications-service'
import { successApiResponse, errorResponse, noContentResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const result = await PublicationsService.getPublicationById(id)
  if (!result) return errorResponse('Publication not found', 404)
  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const PATCH = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()
  const { id: _id, institution_id, created_by, created_at, solution_id, ...safeBody } = body
  const result = await PublicationsService.updatePublication(id, safeBody)
  return successApiResponse(result)
})

export const DELETE = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  await PublicationsService.deletePublication(id)
  return noContentResponse()
})
