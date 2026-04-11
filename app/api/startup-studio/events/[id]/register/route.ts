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

  // --- Fix 1: Fetch event and enforce registration deadline + active check ---
  const { data: event, error: eventError } = await auth.supabase
    .from('ss_events')
    .select('config, is_active, start_date, end_date')
    .eq('id', id)
    .single()

  if (eventError || !event) {
    return errorResponse('Event not found', 404)
  }
  if (!event.is_active) {
    return errorResponse('Event is not active', 400)
  }
  const deadline = event.config?.registration_deadline
  if (deadline && new Date(deadline) < new Date()) {
    return errorResponse('Registration deadline has passed', 400)
  }

  const body = await request.json()
  if (!body.name) return errorResponse('Team name is required', 400)
  if (!body.problem_idea || typeof body.problem_idea !== 'string' || !body.problem_idea.trim()) {
    return errorResponse('Describe the problem your team plans to solve', 400)
  }
  if (body.problem_idea.trim().length < 20) {
    return errorResponse('Problem description must be at least 20 characters', 400)
  }
  if (!body.members || !Array.isArray(body.members) || body.members.length < 1) {
    return errorResponse('At least 1 team member is required', 400)
  }

  // --- Fix 2: Team size limit - use event config or default to 5 ---
  const maxTeamSize = event.config?.team_size || 5
  if (body.members.length > maxTeamSize) {
    return errorResponse(`Maximum ${maxTeamSize} team members allowed`, 400)
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

  // --- Fix 4: Prevent duplicate team registration by the same anchor ---
  const { data: existingTeam } = await auth.supabase
    .from('ss_teams')
    .select('id, name')
    .eq('event_id', id)
    .eq('anchor_id', auth.user.id)
    .maybeSingle()

  if (existingTeam) {
    return errorResponse(`You already registered team "${existingTeam.name}" for this event`, 400)
  }

  // --- Fix 3: Prevent same student joining multiple teams in this event ---
  const memberUserIds = resolvedMembers.map(m => m.user_id).filter(Boolean)
  if (memberUserIds.length > 0) {
    // Step 1: Get all team IDs for this event
    const { data: eventTeams } = await auth.supabase
      .from('ss_teams')
      .select('id')
      .eq('event_id', id)

    if (eventTeams && eventTeams.length > 0) {
      const eventTeamIds = eventTeams.map((t: any) => t.id)

      // Step 2: Check if any of the members are already in those teams
      const { data: existingMembers } = await auth.supabase
        .from('ss_team_members')
        .select('user_id')
        .in('team_id', eventTeamIds)
        .in('user_id', memberUserIds)

      if (existingMembers && existingMembers.length > 0) {
        return errorResponse('Some members are already registered with another team for this event', 400)
      }
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
