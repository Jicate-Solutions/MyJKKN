import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { MouService } from '@/lib/services/solutions/mou-service'
import { successApiResponse, errorResponse, noContentResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const result = await MouService.getById(id)
  if (!result) return errorResponse('MOU not found', 404)
  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const PATCH = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()
  const { id: _id, created_at, created_by, institution_id, ...safeBody } = body
  const result = await MouService.update(id, safeBody)
  return successApiResponse(result)
})

export const DELETE = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  await MouService.delete(id)
  return noContentResponse()
})
