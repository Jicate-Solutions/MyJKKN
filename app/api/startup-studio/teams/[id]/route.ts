import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { TeamsService } from '@/lib/services/startup-studio/teams-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'
import { isValidUuid } from '@/lib/api-keys/query-helpers'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// Get a single team by ID
export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  if (!isValidUuid(id)) return errorResponse('Invalid team ID format', 400)

  const team = await TeamsService.getTeamById(id)
  if (!team) return errorResponse('Team not found', 404)

  return successApiResponse(team)
}, { requiredPermission: 'read' })

// Update a team (PATCH)
export const PATCH = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  if (!isValidUuid(id)) return errorResponse('Invalid team ID format', 400)

  const body = await request.json()

  // Whitelist of allowed fields for update
  const ALLOWED_FIELDS = [
    'name', 'anchor_id', 'event_id', 'cohort_id', 'institution_id',
    'preliminary_track', 'venture_stage', 'problem_idea',
    'registration_status', 'lovable_verified',
    'assigned_business_name', 'mentor_id', 'agreement_signed',
    'is_lighthouse', 'discipline_count', 'member_count',
    'build_venue_id', 'demo_venue_id',
  ]

  const updateData: Record<string, any> = {}
  for (const key of ALLOWED_FIELDS) {
    if (body[key] !== undefined) {
      updateData[key] = body[key]
    }
  }

  if (Object.keys(updateData).length === 0) {
    return errorResponse('No valid fields to update', 400)
  }

  const team = await TeamsService.updateTeam(id, updateData)
  return successApiResponse(team)
}, { requireRole: ['admin', 'super_admin'] })

// Delete a team
export const DELETE = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  if (!isValidUuid(id)) return errorResponse('Invalid team ID format', 400)

  await TeamsService.deleteTeam(id)
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}, { requireRole: ['admin', 'super_admin'] })
