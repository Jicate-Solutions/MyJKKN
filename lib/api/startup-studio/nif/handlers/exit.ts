import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { GraduationService } from '@/lib/services/startup-studio/graduation-service'
import { successApiResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const result = await GraduationService.getExitProcedure(id)
  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()

  if (!body.exit_type) {
    return errorResponse('exit_type is required', 400)
  }

  const result = await GraduationService.initiateExit({
    candidate_id: id,
    exit_type: body.exit_type,
    notice_period_days: body.notice_period_days,
    fees_outstanding: body.fees_outstanding,
  })
  return createdResponse(result)
})

export const PATCH = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()

  // Fetch existing exit for the candidate first
  const exitRecord = await GraduationService.getExitProcedure(id)
  if (!exitRecord) {
    return errorResponse('No exit procedure found for this candidate', 404)
  }

  const result = await GraduationService.updateExitProgress(exitRecord.id, body)
  return successApiResponse(result)
})
