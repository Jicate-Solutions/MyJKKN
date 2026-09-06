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
// Activates the onboarding checklist for a candidate.
//
// 2026-07-06 flow change: onboarding is now a PRE-JOIN stage. Final approval
// only marks the candidate 'approved'; this route stamps the checklist, each
// assignee completes their steps, and ONLY a fully-completed checklist
// unlocks onboard-to-staff (which creates the staff row + sets 'joined').
// 'joined' is still accepted for legacy candidates onboarded the old way.

/** Statuses eligible for the pre-join onboarding stage. */
const ONBOARDABLE_STATUSES = ['approved', 'package_fixed', 'offer_issued', 'joined'];

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
    if (!ONBOARDABLE_STATUSES.includes(candidate.status)) {
      return NextResponse.json(
        { error: `Onboarding can only start after final approval. Current status: ${candidate.status}` },
        { status: 400 }
      );
    }
    if ((candidate.role_specific_details as Record<string, unknown> | null)?.onboarding_steps) {
      return NextResponse.json(
        { error: 'Onboarding has already been started for this candidate.' },
        { status: 409 }
      );
    }

    // Resolve the onboarding template for THIS candidate's organization.
    //
    // 2026-08-07: this used to match on checklist_name alone with .maybeSingle()
    // and no org filter. Every organization has its own row per template name
    // (14 x 'Teaching Faculty Onboarding'), so the unscoped read returned 14
    // rows for a super-admin — .maybeSingle() forgives ZERO rows but not MANY,
    // so it raised PGRST116 and onboarding could never start. Everyone else hit
    // the mirror image: this table's RLS is
    // `hr_organization_id = auth_hr_organization_id()`, user_hr_access is
    // effectively empty, so they saw zero rows and got "must seed checklists".
    //
    // Templates are non-PII configuration, so the read goes through the
    // service-role client (same rationale as fn_list_active_approval_flows) and
    // is scoped explicitly to the candidate's own organization instead.
    const cadreCodeMap: Record<string, string> = {
      teaching_faculty:  'TEACHING',
      medical:           'TEACHING',          // Medical uses the teaching checklist as base
      non_teaching:      'NON_TECHNICAL',
      senior_leadership: 'ADMINISTRATIVE',
      contract:          'NON_TECHNICAL',
    };
    // Legacy per-category names, kept as a tie-breaker for the org-wide rows
    // that predate cadre scoping (applies_to_cadre_id IS NULL).
    const legacyNameMap: Record<string, string> = {
      teaching_faculty:  'Teaching Faculty Onboarding',
      medical:           'Teaching Faculty Onboarding',
      non_teaching:      'Non-Technical Administrative Staff Onboarding',
      senior_leadership: 'Administrative Leadership Onboarding',
      contract:          'Non-Technical Administrative Staff Onboarding',
    };
    const cadreCode = cadreCodeMap[candidate.role_category] ?? 'TEACHING';
    const legacyName = legacyNameMap[candidate.role_category] ?? 'Teaching Faculty Onboarding';

    const configClient = createServiceRoleClient();

    const { data: orgTemplates, error: checklistErr } = await configClient
      .from('hr_onboarding_checklists')
      .select('id, checklist_name, steps, applies_to_cadre_id')
      .eq('hr_organization_id', candidate.hr_organization_id)
      .eq('is_active', true);
    if (checklistErr) throw checklistErr;

    const { data: cadreRows, error: cadreErr } = await configClient
      .from('hr_cadres')
      .select('id')
      .eq('hr_organization_id', candidate.hr_organization_id)
      .eq('code', cadreCode)
      .eq('is_active', true);
    if (cadreErr) throw cadreErr;
    const cadreIds = new Set((cadreRows ?? []).map((c) => (c as { id: string }).id));

    // Most specific wins: this role's cadre > the legacy per-category name >
    // any org-wide default. Without that order a cadre-scoped template would be
    // shadowed by the org-wide catch-all.
    const templates = (orgTemplates ?? []) as Array<{
      id: string;
      checklist_name: string;
      steps: unknown;
      applies_to_cadre_id: string | null;
    }>;
    const checklist =
      templates.find((t) => t.applies_to_cadre_id && cadreIds.has(t.applies_to_cadre_id)) ??
      templates.find((t) => !t.applies_to_cadre_id && t.checklist_name === legacyName) ??
      templates.find((t) => !t.applies_to_cadre_id) ??
      null;

    if (!checklist) {
      return NextResponse.json(
        {
          error:
            `No active onboarding checklist is configured for this candidate's organization. ` +
            `Open /hr/admin/onboarding-checklists and add one for the '${cadreCode}' cadre ` +
            `(or an "applies to all cadres" default), then start onboarding again.`,
        },
        { status: 400 }
      );
    }

    // Normalize both template shapes ({step} legacy / {order,title} admin-built)
    // and resolve pinned assignee emails → profiles.id in one lookup.
    type TemplateStep = {
      step?: string;
      title?: string;
      expected_by_day?: number;
      assigned_role?: string;
      assigned_user_email?: string;
    };
    const templateSteps = (checklist.steps as TemplateStep[]) ?? [];

    const assigneeEmails = Array.from(
      new Set(
        templateSteps
          .map((s) => s.assigned_user_email?.toLowerCase().trim())
          .filter((e): e is string => !!e),
      ),
    );
    const emailToProfileId = new Map<string, string>();
    if (assigneeEmails.length > 0) {
      const serviceSupabase = createServiceRoleClient();
      const { data: profileRows } = await serviceSupabase
        .from('profiles')
        .select('id, email')
        .in('email', assigneeEmails);
      for (const p of (profileRows ?? []) as Array<{ id: string; email: string | null }>) {
        if (p.email) emailToProfileId.set(p.email.toLowerCase(), p.id);
      }
    }

    // Stamp checklist onto candidate's role_specific_details
    const updatedDetails = {
      ...(candidate.role_specific_details ?? {}),
      onboarding_checklist_id: checklist.id,
      onboarding_checklist_name: checklist.checklist_name,
      onboarding_started_at: new Date().toISOString(),
      onboarding_started_by: user.id,
      onboarding_steps: templateSteps.map((s, idx) => ({
        index: idx,
        step: s.title ?? s.step ?? `Step ${idx + 1}`,
        completed: false,
        completed_at: null,
        completed_by: null,
        expected_by_day: s.expected_by_day ?? null,
        assigned_role: s.assigned_role ?? null,
        assigned_user_email: s.assigned_user_email ?? null,
        assigned_user_id: s.assigned_user_email
          ? emailToProfileId.get(s.assigned_user_email.toLowerCase().trim()) ?? null
          : null,
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
