import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { SF100Service } from '@/lib/services/startup-studio'
import { successApiResponse, errorResponse, forbiddenResponse } from '@/lib/api/response'
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

  // Team details — the team NAME and the PROBLEM statement. Both live on the
  // enrollment's event_registrations row. Authorization is enforced by that
  // table's own RLS UPDATE policy (team owner OR admin/super-admin); because the
  // handler runs under the caller's client (withAuth → runWithClient), we do NOT
  // duplicate a role check here.
  const hasName = typeof body.team_name === 'string'
  const hasProblem = typeof body.problem_idea === 'string'
  if (hasName || hasProblem) {
    // team_name is NOT NULL in the DB — reject an empty/whitespace name up front.
    if (hasName && body.team_name.trim().length === 0) {
      return errorResponse('Team name cannot be empty.', 400)
    }

    let updatedTeam
    try {
      updatedTeam = await SF100Service.updateTeamDetails(
        enrollmentId,
        {
          team_name: hasName ? body.team_name : undefined,
          problem_idea: hasProblem ? body.problem_idea : undefined,
        },
        auth.user.id
      )
    } catch (err: any) {
      if (err?.notFound) return errorResponse('Enrollment not found', 404)
      throw err // withAuth maps 42501 → 403; anything else → 500
    }

    // null = the RLS UPDATE matched no row → caller is neither the team owner nor
    // an admin/super-admin. event_registrations_update is USING-only, so denial is
    // a silent 0-row result (never a 42501 error) — translate it to an explicit 403
    // rather than reporting a misleading success.
    if (updatedTeam === null) {
      return forbiddenResponse('You can only edit teams you own, unless you are an admin.')
    }

    return successApiResponse(updatedTeam)
  }

  return errorResponse(
    'No updatable fields provided. Use "status", "team_name", or "problem_idea".',
    400
  )
})
