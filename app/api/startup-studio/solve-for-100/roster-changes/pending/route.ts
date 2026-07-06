import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  // Cohort-core repoint (Phase 2.3): NO data-layer change here. sf100_roster_changes.status
  // ('pending') is a CHANGE-REQUEST workflow status, not a cohort lifecycle status — it must
  // NOT be folded/repointed. The embedded enrollment → registration → team_name join stays on
  // the sf100_enrollments extension (which owns registration_id). Left intentionally unchanged.
  const { data, error } = await auth.supabase
    .from('sf100_roster_changes')
    .select('*, enrollment:sf100_enrollments(id, registration:event_registrations(team_name))')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (error) throw new Error('Failed to fetch pending roster changes: ' + error.message)

  return successApiResponse(data || [])
}, { requiredPermission: 'read' })
