import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { SF100Service } from '@/lib/services/startup-studio'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { enrollmentId } = await context!.params!
  const enrollment = await SF100Service.getEnrollment(enrollmentId)

  if (!enrollment) {
    return errorResponse('Enrollment not found', 404)
  }

  return successApiResponse(enrollment)
}, { requiredPermission: 'read' })

export const PATCH = withAuth(async (request, auth, context) => {
  const { enrollmentId } = await context!.params!
  const body = await request.json()

  if (body.status) {
    await SF100Service.updateEnrollmentStatus(
      enrollmentId,
      body.status,
      body.status_reason,
      auth.user.id
    )

    // Re-fetch the updated enrollment to return it
    const updated = await SF100Service.getEnrollment(enrollmentId)
    return successApiResponse(updated)
  }

  return errorResponse('No updatable fields provided. Use "status" to update enrollment status.', 400)
})
