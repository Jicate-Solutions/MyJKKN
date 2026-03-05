import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { TeamsService } from '@/lib/services/startup-studio/teams-service'
import { successApiResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'
import { isValidUuid } from '@/lib/api-keys/query-helpers'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// Register a team for an event
export const POST = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  if (!isValidUuid(id)) return errorResponse('Invalid event ID format', 400)

  const body = await request.json()
  if (!body.name) return errorResponse('Team name is required', 400)
  if (!body.members || !Array.isArray(body.members) || body.members.length < 1) {
    return errorResponse('At least 1 team member is required', 400)
  }
  if (body.members.length > 10) {
    return errorResponse('Maximum 10 team members allowed', 400)
  }

  // Resolve member identifiers (email or UUID) to user IDs
  const resolvedMembers = []
  for (const member of body.members) {
    const identifier = (member.user_id || '').trim()
    if (!identifier) {
      return errorResponse('Each member must have an email or user ID', 400)
    }

    if (identifier.includes('@')) {
      // Look up user by email in profiles table
      const { data: profile } = await auth.supabase
        .from('profiles')
        .select('id')
        .ilike('email', identifier)
        .maybeSingle()
      if (!profile) {
        return errorResponse(`No user found with email: ${identifier}`, 400)
      }
      resolvedMembers.push({ ...member, user_id: profile.id })
    } else if (isValidUuid(identifier)) {
      resolvedMembers.push({ ...member, user_id: identifier })
    } else {
      return errorResponse(`Invalid identifier: ${identifier}. Use an email address or user ID.`, 400)
    }
  }

  const result = await TeamsService.registerTeamForEvent(id, {
    name: body.name,
    problem_idea: body.problem_idea || null,
    institution_id: body.institution_id || auth.institutionId || null,
    preliminary_track: body.preliminary_track || null,
    members: resolvedMembers,
  })

  return createdResponse(result)
})
