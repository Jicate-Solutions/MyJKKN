export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { RecruitmentService } from '@/lib/services/hr/recruitment-service';
import { StaffNotificationService } from '@/lib/services/staff/notification-service';
import { createServiceRoleClient } from '@/lib/supabase/server';

async function getClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }); } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: '', ...options }); } catch {}
        },
      },
    }
  );
}

// POST /api/hr/recruitment/candidates/[id]/onboarding/start
// Activates the onboarding checklist for a joined candidate.
// Reads hr_onboarding_checklists for the candidate's cadre and stamps it
// onto the candidate's role_specific_details.onboarding_checklist field.

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Fetch the candidate
    const candidate = await RecruitmentService.getCandidate(supabase, id);
    if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    if (candidate.status !== 'joined') {
      return NextResponse.json(
        { error: `Onboarding can only start for joined candidates. Current status: ${candidate.status}` },
        { status: 400 }
      );
    }

    // Map role_category to checklist cadre name
    const cadreMap: Record<string, string> = {
      teaching_faculty:  'Teaching Faculty Onboarding',
      medical:           'Teaching Faculty Onboarding',         // Medical uses teaching checklist as base
      non_teaching:      'Non-Technical Administrative Staff Onboarding',
      senior_leadership: 'Administrative Leadership Onboarding',
      contract:          'Non-Technical Administrative Staff Onboarding',
    };
    const checklistName = cadreMap[candidate.role_category] ?? 'Teaching Faculty Onboarding';

    // Fetch the matching onboarding checklist
    const { data: checklist, error: checklistErr } = await supabase
      .from('hr_onboarding_checklists')
      .select('*')
      .eq('checklist_name', checklistName)
      .eq('is_active', true)
      .maybeSingle();
    if (checklistErr) throw checklistErr;

    if (!checklist) {
      return NextResponse.json(
        { error: `No active onboarding checklist found for '${checklistName}'. HR Admin must seed checklists first.` },
        { status: 400 }
      );
    }

    // Stamp checklist onto candidate's role_specific_details
    const updatedDetails = {
      ...(candidate.role_specific_details ?? {}),
      onboarding_checklist_id: checklist.id,
      onboarding_checklist_name: checklist.checklist_name,
      onboarding_started_at: new Date().toISOString(),
      onboarding_started_by: user.id,
      onboarding_steps: (checklist.steps as Array<{ step: string }>).map((s, idx) => ({
        index: idx,
        step: s.step,
        completed: false,
        completed_at: null,
        completed_by: null,
      })),
    };

    const { data: updated, error: updateErr } = await supabase
      .from('hr_recruitment_candidates')
      .update({ role_specific_details: updatedDetails })
      .eq('id', id)
      .select()
      .single();
    if (updateErr) throw updateErr;

    // Dispatch onboarding_step_pending notification for the first step — fire-and-forget
    void (async () => {
      try {
        const serviceSupabase = createServiceRoleClient();

        // Resolve the staff member's auth user ID from their email
        let staffUserId: string | undefined;

        if (candidate.user_profile_id) {
          staffUserId = candidate.user_profile_id as string;
        } else if (candidate.email) {
          const { data: profile } = await serviceSupabase
            .from('profiles')
            .select('id')
            .eq('email', candidate.email)
            .maybeSingle();
          staffUserId = profile?.id;
        }

        if (!staffUserId) return;

        // Notify for the first step only
        const firstStep = (
          updatedDetails.onboarding_steps as Array<{ step: string }> | undefined
        )?.[0];
        if (!firstStep) return;

        await StaffNotificationService.notifyOnboardingStepPending(
          serviceSupabase,
          id,
          staffUserId,
          firstStep.step,
          checklist.checklist_name
        );
      } catch (notifyErr) {
        console.warn('[hr/onboarding/start] onboarding_step_pending notification failed:', notifyErr);
      }
    })();

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error('[hr/recruitment/candidates/:id/onboarding/start] error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    );
  }
}
