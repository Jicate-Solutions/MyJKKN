import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { CyclesService } from '@/lib/services/startup-studio/cycles-service'
import { successApiResponse, errorResponse, noContentResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const result = await CyclesService.getCycleById(id)
  if (!result) return errorResponse('Cycle not found', 404)
  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const PATCH = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()
  const { id: _id, created_at, ...safeBody } = body
  const result = await CyclesService.updateCycle(id, safeBody)
  return successApiResponse(result)
})

export const DELETE = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  await CyclesService.deleteCycle(id)
  return noContentResponse()
})
