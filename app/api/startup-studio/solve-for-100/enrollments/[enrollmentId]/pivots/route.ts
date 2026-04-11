import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { SF100Service } from '@/lib/services/startup-studio'
import { successApiResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { enrollmentId } = await context!.params!
  const result = await SF100Service.listPivots(enrollmentId)
  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth, context) => {
  const { enrollmentId } = await context!.params!
  const body = await request.json()

  if (!body.pivot_type) {
    return errorResponse('pivot_type is required', 400)
  }
  if (!body.before_description) {
    return errorResponse('before_description is required', 400)
  }
  if (!body.after_description) {
    return errorResponse('after_description is required', 400)
  }
  if (!body.reasoning) {
    return errorResponse('reasoning is required', 400)
  }

  const result = await SF100Service.logPivot(enrollmentId, {
    pivot_type: body.pivot_type,
    before_description: body.before_description,
    after_description: body.after_description,
    reasoning: body.reasoning,
    evidence: body.evidence,
    pivot_date: body.pivot_date,
  }, auth.user.id)

  return createdResponse(result)
})
