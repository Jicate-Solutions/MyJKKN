import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { NifPipelineService } from '@/lib/services/startup-studio/nif-pipeline-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const POST = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()
  if (!body.stage) {
    return errorResponse('stage is required', 400)
  }

  const result = await NifPipelineService.advanceStage(
    id,
    body.stage,
    body.changedBy,
    body.reason
  )
  return successApiResponse(result)
})
