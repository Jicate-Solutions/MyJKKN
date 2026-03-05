import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'
import { isValidUuid } from '@/lib/api-keys/query-helpers'
import { BaseService } from '@/lib/services/base-service'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// Get the current user's team for this event
export const GET = withAuth(async (request, auth, context) => {
  const { id: eventId } = await context!.params!
  if (!isValidUuid(eventId)) return errorResponse('Invalid event ID format', 400)

  const supabase = auth.supabase
  const userId = auth.user.id

  // Step 1: Find team where the user is a member for this event
  const { data: membership, error: memberError } = await supabase
    .from('ss_team_members')
    .select('team_id')
    .eq('user_id', userId)

  if (memberError) {
    return errorResponse(`Failed to look up team membership: ${memberError.message}`, 500)
  }

  if (!membership || membership.length === 0) {
    return successApiResponse({ team: null, message: 'No team found' })
  }

  const teamIds = membership.map((m: any) => m.team_id)

  // Step 2: Find the team that belongs to this event
  const { data: team, error: teamError } = await supabase
    .from('ss_teams')
    .select(`
      *,
      institution:institutions(id, name),
      members:ss_team_members(
        id, user_id, role, department, is_anchor, has_laptop,
        user:profiles!user_id(id, full_name, email)
      )
    `)
    .eq('event_id', eventId)
    .in('id', teamIds)
    .maybeSingle()

  if (teamError) {
    return errorResponse(`Failed to fetch team: ${teamError.message}`, 500)
  }

  if (!team) {
    return successApiResponse({ team: null, message: 'No team found for this event' })
  }

  // Step 3: Get build venue info
  let buildVenue = null
  if (team.build_venue_id) {
    const { data } = await supabase
      .from('ss_event_venues')
      .select('id, venue_name, location_info, capacity, resource:resources(id, name, building_number, room_number)')
      .eq('id', team.build_venue_id)
      .maybeSingle()
    buildVenue = data
  }

  // Step 4: Get demo venue info
  let demoVenue = null
  if (team.demo_venue_id) {
    const { data } = await supabase
      .from('ss_event_venues')
      .select('id, venue_name, location_info, capacity, resource:resources(id, name, building_number, room_number)')
      .eq('id', team.demo_venue_id)
      .maybeSingle()
    demoVenue = data
  }

  // Step 5: Get presentation slot
  const { data: slot } = await supabase
    .from('ss_presentation_slots')
    .select('id, slot_time, duration_mins, room, status')
    .eq('team_id', team.id)
    .maybeSingle()

  // Step 6: Get mentor info
  let mentor = null
  if (team.mentor_id) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', team.mentor_id)
      .maybeSingle()
    mentor = data
  }

  // Step 7: Get submission if exists
  const { data: submission } = await supabase
    .from('ss_appathon_submissions')
    .select('id, app_name, live_url, status, submitted_at')
    .eq('team_id', team.id)
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return successApiResponse({
    team: {
      ...team,
      build_venue: buildVenue,
      demo_venue: demoVenue,
      presentation_slot: slot,
      mentor,
      submission,
    },
  })
}, { requiredPermission: 'read' })
