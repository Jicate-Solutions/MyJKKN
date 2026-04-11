import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { GraduationService } from '@/lib/services/startup-studio/graduation-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const POST = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json().catch(() => ({}))

  // Fetch existing exit for the candidate
  const exitRecord = await GraduationService.getExitProcedure(id)
  if (!exitRecord) {
    return errorResponse('No exit procedure found for this candidate', 404)
  }

  const result = await GraduationService.completeExit(exitRecord.id, body.processed_by)
  return successApiResponse(result)
})
