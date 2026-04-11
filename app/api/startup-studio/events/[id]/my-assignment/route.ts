import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'
import { isValidUuid } from '@/lib/api-keys/query-helpers'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// Get the current user's venue assignments (mentor/judge) for this event
export const GET = withAuth(async (request, auth, context) => {
  const { id: eventId } = await context!.params!
  if (!isValidUuid(eventId)) return errorResponse('Invalid event ID format', 400)

  const supabase = auth.supabase
  const userId = auth.user.id

  // Step 1: Find all venue_staff entries for this user across venues for this event
  // Join through ss_event_venues to filter by event_id
  const { data: staffEntries, error: staffError } = await supabase
    .from('ss_venue_staff')
    .select(`
      id, role, user_id,
      venue:ss_event_venues!venue_id(
        id, event_id, day_type, venue_name, location_info, capacity, status,
        institution:institutions(id, name),
        resource:resources(id, name, building_number, room_number)
      )
    `)
    .eq('user_id', userId)

  if (staffError) {
    return errorResponse(`Failed to fetch assignments: ${staffError.message}`, 500)
  }

  if (!staffEntries || staffEntries.length === 0) {
    return successApiResponse({ assignments: [], message: 'No venue assignments found' })
  }

  // Filter to only venues that belong to this event
  const eventStaffEntries = staffEntries.filter((entry: any) => {
    return entry.venue && entry.venue.event_id === eventId
  })

  if (eventStaffEntries.length === 0) {
    return successApiResponse({ assignments: [], message: 'No venue assignments found for this event' })
  }

  // Step 2: For each venue, get the teams assigned to it
  const assignments = []
  for (const entry of eventStaffEntries) {
    const venue = (entry as any).venue
    if (!venue) continue

    const venueColumn = venue.day_type === 'build_day' ? 'build_venue_id' : 'demo_venue_id'

    const { data: teams } = await supabase
      .from('ss_teams')
      .select(`
        id, name, problem_idea, registration_status, member_count,
        institution:institutions(id, name),
        members:ss_team_members(id, user_id, has_laptop)
      `)
      .eq('event_id', eventId)
      .eq(venueColumn, venue.id)
      .order('name')

    // For demo day venues, get presentation slots for teams
    let slotsMap: Record<string, any> = {}
    if (venue.day_type === 'demo_day' && teams && teams.length > 0) {
      const teamIds = teams.map((t: any) => t.id)
      const { data: slots } = await supabase
        .from('ss_presentation_slots')
        .select('id, team_id, slot_time, duration_mins, room, status')
        .in('team_id', teamIds)

      if (slots) {
        for (const slot of slots) {
          slotsMap[slot.team_id] = slot
        }
      }
    }

    // Enrich teams with laptop counts and slots
    const enrichedTeams = (teams || []).map((t: any) => ({
      ...t,
      laptop_count: (t.members || []).filter((m: any) => m.has_laptop).length,
      presentation_slot: slotsMap[t.id] || null,
    }))

    assignments.push({
      staff_id: (entry as any).id,
      role: (entry as any).role,
      venue: {
        id: venue.id,
        day_type: venue.day_type,
        venue_name: venue.venue_name,
        location_info: venue.location_info,
        capacity: venue.capacity,
        status: venue.status,
        institution: venue.institution,
        resource: venue.resource,
      },
      teams: enrichedTeams,
      team_count: enrichedTeams.length,
    })
  }

  return successApiResponse({ assignments })
}, { requiredPermission: 'read' })
