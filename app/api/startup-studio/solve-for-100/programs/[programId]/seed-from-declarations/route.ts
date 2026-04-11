import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { SF100Service } from '@/lib/services/startup-studio'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const POST = withAuth(async (request, auth, context) => {
  const { programId } = await context!.params!

  // 1. Get the program to find its source_event_id
  const program = await SF100Service.getProgram(programId)
  if (!program) {
    return errorResponse('Program not found', 404)
  }
  if (!program.source_event_id) {
    return errorResponse('Program has no source_event_id — cannot seed from declarations', 400)
  }

  // 2. Read track_declarations WHERE track = 'solve_for_100' for this event
  const { data: declarations, error: declError } = await auth.supabase
    .from('track_declarations')
    .select('team_id')
    .eq('event_id', program.source_event_id)
    .eq('track', 'solve_for_100')

  if (declError) {
    return errorResponse('Failed to read track declarations: ' + declError.message, 500)
  }

  if (!declarations || declarations.length === 0) {
    return successApiResponse({ enrolled: 0, skipped: 0, errors: [] })
  }

  // 3. Get existing enrollments to skip duplicates
  const { data: existing, error: existError } = await auth.supabase
    .from('sf100_enrollments')
    .select('registration_id')
    .eq('program_id', programId)

  if (existError) {
    return errorResponse('Failed to check existing enrollments: ' + existError.message, 500)
  }

  const existingRegIds = new Set((existing || []).map((e: any) => e.registration_id))

  // 4. Enroll each team, collecting results
  let enrolled = 0
  let skipped = 0
  const errors: Array<{ registration_id: string; error: string }> = []

  for (const declaration of declarations) {
    const registrationId = declaration.team_id

    // Skip if already enrolled
    if (existingRegIds.has(registrationId)) {
      skipped += 1
      continue
    }

    try {
      await SF100Service.enrollTeam(programId, registrationId, auth.user.id)
      enrolled += 1
    } catch (err: any) {
      errors.push({
        registration_id: registrationId,
        error: err.message || 'Unknown error',
      })
    }
  }

  return successApiResponse({ enrolled, skipped, errors })
})
