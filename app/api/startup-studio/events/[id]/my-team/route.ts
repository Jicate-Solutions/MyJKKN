import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'
import { isValidUuid } from '@/lib/api-keys/query-helpers'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// Get the current user's team for this event
export const GET = withAuth(async (request, auth, context) => {
  const { id: eventId } = await context!.params!
  if (!isValidUuid(eventId)) return errorResponse('Invalid event ID format', 400)

  const supabase = auth.supabase
  const userId = auth.user.id

  // Step 1: Find the registration where the user is a team member for this event
  const { data: membership, error: memberError } = await supabase
    .from('event_team_members')
    .select('registration_id')
    .eq('profile_id', userId)

  if (memberError) {
    return errorResponse(`Failed to look up team membership: ${memberError.message}`, 500)
  }

  if (!membership || membership.length === 0) {
    return successApiResponse({ team: null, message: 'No team found' })
  }

  const registrationIds = membership.map((m: any) => m.registration_id)

  // Step 2: Find the registration that belongs to this event
  const { data: registration, error: regError } = await supabase
    .from('event_registrations')
    .select(`
      *,
      institution:institutions(id, name),
      members:event_team_members(
        id, full_name, email, is_leader, has_laptop
      )
    `)
    .eq('event_id', eventId)
    .in('id', registrationIds)
    .maybeSingle()

  if (regError) {
    return errorResponse(`Failed to fetch team: ${regError.message}`, 500)
  }

  if (!registration) {
    return successApiResponse({ team: null, message: 'No team found for this event' })
  }

  // Step 3: Get latest submission if exists (including metrics fields)
  const { data: submission } = await supabase
    .from('event_submissions')
    .select('id, app_name, live_app_url, submitted_at, mrr_amount, paying_users_count, user_count, active_users_count, metrics_updated_at')
    .eq('event_id', eventId)
    .eq('registration_id', registration.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return successApiResponse({
    team: {
      ...registration,
      name: registration.team_name,
      registration_status: registration.status,
      // Venue allocation and mentor assignment now live at the venue level
      // (event_venue_assignments / event_staff_assignments), not per-team —
      // no single-team equivalent exists yet, so these render as "not yet assigned".
      build_venue: null,
      demo_venue: null,
      presentation_slot: null,
      mentor: null,
      members: (registration.members || []).map((m: any) => ({
        id: m.id,
        user: { full_name: m.full_name, email: m.email },
        is_anchor: m.is_leader,
        has_laptop: m.has_laptop,
      })),
      submission: submission
        ? {
            app_name: submission.app_name,
            live_url: submission.live_app_url,
            status: 'submitted',
            submitted_at: submission.submitted_at,
            metrics_updated_at: submission.metrics_updated_at,
            mrr_amount: submission.mrr_amount,
            paying_users_count: submission.paying_users_count,
            total_users: submission.user_count,
            active_users: submission.active_users_count,
          }
        : null,
    },
  })
}, { requiredPermission: 'read' })
