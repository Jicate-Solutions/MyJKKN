import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { FoundationsService } from '@/lib/services/startup-studio/foundations-service'
import { successApiResponse, createdResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// GET /api/startup-studio/foundations/worksheets/[id]/responses — the caller's own response
export const GET = withAuth(
  async (request, auth, context) => {
    const { id: worksheetId } = await context!.params!
    const response = await FoundationsService.getMyResponse(worksheetId, auth.user.id)
    // null (not 404) — the UI distinguishes "not started" from "failed to load"
    return successApiResponse(response || null)
  },
  { requiredPermission: 'read' }
)

// POST /api/startup-studio/foundations/worksheets/[id]/responses — save draft / submit.
// student_id defaults to the caller; a facilitator may proxy by passing student_id
// (the tightened RLS INSERT policy enforces the manage permission for proxy writes).
export const POST = withAuth(
  async (request, auth, context) => {
    const { id: worksheetId } = await context!.params!
    const body = await request.json()
    const studentId = body.student_id || auth.user.id
    const response = await FoundationsService.submitResponse(
      {
        worksheet_id: worksheetId,
        response_data: body.response_data ?? {},
        status: body.status,
        cohort_id: body.cohort_id,
      },
      studentId,
      auth.user.id
    )
    return createdResponse(response)
  },
  { requiredPermission: 'write' }
)
