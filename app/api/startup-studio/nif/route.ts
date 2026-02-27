import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { NifPipelineService } from '@/lib/services/startup-studio/nif-pipeline-service'
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { getPaginationParams, getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const { page, limit } = getPaginationParams(url)
  const stage = getStringParam(url, 'stage')
  const search = getStringParam(url, 'search')

  const result = await NifPipelineService.getCandidates({
    page,
    limit,
    stage: stage as any,
    search,
  })

  return paginatedResponse(result.data, result.metadata.total, page, limit)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()
  if (!body.startup_name) {
    return errorResponse('startup_name is required', 400)
  }

  const result = await NifPipelineService.createCandidate(body)
  return createdResponse(result)
})
