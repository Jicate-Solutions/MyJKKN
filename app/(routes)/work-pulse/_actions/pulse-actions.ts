'use server';

import { revalidatePath } from 'next/cache';
import { getEnhancedUserProfile, createClient } from '@/lib/supabase/server';
import { WorkPulseService } from '@/lib/services/work-pulse/work-pulse-service';
import { SubmitWeeklyPulseDto, RespondInterviewDto } from '@/types/work-pulse';

/** Resolve institution_id — falls back to first institution for cross-institutional users */
async function resolveInstitutionId(profileInstitutionId: string | null): Promise<string> {
  if (profileInstitutionId) return profileInstitutionId;

  // Super admins / cross-institutional users: fetch default institution
  const supabase = await createClient();
  const { data } = await supabase
    .from('institutions')
    .select('id')
    .limit(1)
    .single();

  if (!data) throw new Error('No institution found');
  return data.id;
}

/** Submit or re-submit weekly pulse (form or FAB) */
export async function submitPulse(dto: SubmitWeeklyPulseDto) {
  try {
    const { profile, error: authError } = await getEnhancedUserProfile();
    if (authError || !profile) return { success: false, error: 'Not authenticated' };

    const institutionId = await resolveInstitutionId(profile.institution_id);

    const entry = await WorkPulseService.submitWeeklyPulse(
      dto,
      profile.id,
      institutionId,
      profile.department_id ?? null,
      profile.role
    );

    revalidatePath('/work-pulse');
    return { success: true, data: entry };
  } catch (error) {
    console.error('[work-pulse/submit]', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to submit pulse',
    };
  }
}

/** Quick submit from FAB (same logic, separate action for tracking) */
export async function quickSubmitPulse(dto: SubmitWeeklyPulseDto) {
  return submitPulse(dto);
}

/** Respond to a micro-interview */
export async function respondToInterview(interviewId: string, dto: RespondInterviewDto) {
  try {
    const { profile, error: authError } = await getEnhancedUserProfile();
    if (authError || !profile) return { success: false, error: 'Not authenticated' };

    await WorkPulseService.respondToInterview(interviewId, profile.id, dto);
    revalidatePath('/work-pulse');
    return { success: true };
  } catch (error) {
    console.error('[work-pulse/respond-interview]', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to respond',
    };
  }
}

/** Get instant help after submission — pattern matching */
export async function getInstantHelp(category: string) {
  try {
    const { profile, error: authError } = await getEnhancedUserProfile();
    if (authError || !profile) return { success: false, error: 'Not authenticated' };

    const result = await WorkPulseService.instantHelpMatch(category);
    return { success: true, data: result };
  } catch (error) {
    console.error('[work-pulse/instant-help]', error);
    return { success: false, error: 'Failed to find matches' };
  }
}
