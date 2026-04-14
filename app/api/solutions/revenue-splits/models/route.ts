import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { RevenueSplitService } from '@/lib/services/solutions/revenue-split-service'
import { successApiResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const result = await RevenueSplitService.getRevenueSplitModels()
  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()

  if (!body.solution_type || !body.name || !body.split_config) {
    return errorResponse('solution_type, name, and split_config are required', 400)
  }

  const result = await RevenueSplitService.createRevenueSplitModel(body)
  return createdResponse(result)
})
