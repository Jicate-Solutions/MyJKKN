import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ProspectsService } from '@/lib/services/solutions/prospects-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const PATCH = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()

  if (!body.pipeline_stage) {
    return errorResponse('pipeline_stage is required', 400)
  }

  const result = await ProspectsService.updatePipelineStage(
    id,
    body.pipeline_stage,
    body.lost_reason,
    body.reopen_date
  )

  return successApiResponse(result)
})
