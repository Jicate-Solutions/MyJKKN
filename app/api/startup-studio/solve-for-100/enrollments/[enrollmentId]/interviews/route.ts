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
  const result = await SF100Service.listInterviews(enrollmentId)
  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth, context) => {
  const { enrollmentId } = await context!.params!
  const body = await request.json()

  if (!body.customer_name) {
    return errorResponse('customer_name is required', 400)
  }

  const result = await SF100Service.logInterview(enrollmentId, {
    customer_name: body.customer_name,
    customer_role: body.customer_role,
    customer_segment: body.customer_segment,
    key_quote: body.key_quote,
    pain_level: body.pain_level,
    willingness_to_pay: body.willingness_to_pay,
    follow_up_needed: body.follow_up_needed,
    follow_up_notes: body.follow_up_notes,
    interview_date: body.interview_date,
  }, auth.user.id)

  return createdResponse(result)
})
