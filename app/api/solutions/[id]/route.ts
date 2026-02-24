import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { SolutionsService } from '@/lib/services/solutions/solutions-service'
import { successApiResponse, errorResponse, noContentResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const result = await SolutionsService.getSolutionById(id)
  if (!result) return errorResponse('Solution not found', 404)
  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const PATCH = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()
  const { institution_id, created_by, created_at, id: _id, ...safeBody } = body
  const result = await SolutionsService.updateSolution(id, safeBody)
  return successApiResponse(result)
})

export const DELETE = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  await SolutionsService.deleteSolution(id)
  return noContentResponse()
})
