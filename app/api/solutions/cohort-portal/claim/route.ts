import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { CohortService } from '@/lib/services/solutions/cohort-service'
import { createdResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const POST = withAuth(async (request, auth) => {
  const member = await CohortService.getCohortMemberByUserId(auth.user.id)
  if (!member) {
    return errorResponse('Cohort member profile not found for current user', 404)
  }

  const body = await request.json()
  const { session_id, role } = body
  if (!session_id) {
    return errorResponse('session_id is required', 400)
  }

  // Verify session is available for this member
  const available = await CohortService.getAvailableSessionsForMember(member.id)
  const isAvailable = available.some(s => s.id === session_id)
  if (!isAvailable) {
    return errorResponse('Session is not available for claiming', 400)
  }

  // Create the cohort assignment
  const { data, error } = await (auth.supabase as any)
    .from('sh_cohort_assignments')
    .insert({
      cohort_member_id: member.id,
      session_id,
      role: role || 'observer',
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to claim session: ${error.message}`)
  }

  return createdResponse(data)
}, { allowApiKey: false })
