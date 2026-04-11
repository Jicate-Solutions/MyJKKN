import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { NifPipelineService } from '@/lib/services/startup-studio/nif-pipeline-service'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const result = await NifPipelineService.getStageCounts()
  return successApiResponse(result)
}, { requiredPermission: 'read' })
