export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';

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

// Same allow-list the page.tsx UI uses for canEditOnboarding (Agent θ, PR #943).
// is_super_admin always passes; otherwise the caller must hold one of these
// role_keys via either profiles.role (legacy) or user_roles → custom_roles.
const ALLOWED_ROLE_KEYS = new Set(['hr_officer', 'hr_head', 'director_jkkn']);

type OnboardingStep = {
  index: number;
  step: string;
  completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
};

// POST /api/hr/recruitment/candidates/[id]/onboarding/complete-step
// Body: { step_index: number, completed: boolean }
// Mutates role_specific_details.onboarding_steps[step_index] in place and
// stamps completed_at / completed_by from server-time + auth user.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id: candidateId } = await params;
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Body validation
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { step_index, completed } = body as { step_index?: unknown; completed?: unknown };
    if (typeof step_index !== 'number' || !Number.isInteger(step_index) || step_index < 0) {
      return NextResponse.json(
        { error: 'step_index (non-negative integer) required' },
        { status: 400 }
      );
    }
    if (typeof completed !== 'boolean') {
      return NextResponse.json(
        { error: 'completed (boolean) required' },
        { status: 400 }
      );
    }

    // Permission check — same allow-list page.tsx uses (Agent θ, PR #943).
    // Pattern mirrors app/api/hr/dashboard/route.ts (profiles + user_roles join).
    const [{ data: profile }, { data: userRoles }] = await Promise.all([
      supabase
        .from('profiles')
        .select('role, is_super_admin')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('user_roles')
        .select('custom_roles!inner(role_key)')
        .eq('user_id', user.id),
    ]);

    const isSuperAdmin = !!profile?.is_super_admin;
    const profileRole = (profile?.role as string | undefined) ?? '';
    const userRoleKeys: string[] = Array.isArray(userRoles)
      ? userRoles
          .map((r: { custom_roles?: { role_key?: string } | null }) => r?.custom_roles?.role_key)
          .filter((k): k is string => typeof k === 'string')
      : [];
    const allRoleKeys = new Set<string>([profileRole, ...userRoleKeys].filter(Boolean));

    const allowed = isSuperAdmin || [...allRoleKeys].some((k) => ALLOWED_ROLE_KEYS.has(k));
    if (!allowed) {
      return NextResponse.json(
        { error: 'Forbidden — onboarding edits require super_admin, hr_officer, hr_head, or director_jkkn' },
        { status: 403 }
      );
    }

    // Fetch current onboarding_steps
    const { data: candidate, error: fetchErr } = await supabase
      .from('hr_recruitment_candidates')
      .select('id, status, role_specific_details')
      .eq('id', candidateId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }
    if (candidate.status !== 'joined') {
      return NextResponse.json(
        { error: `Onboarding steps can only be updated for joined candidates. Current status: ${candidate.status}` },
        { status: 400 }
      );
    }

    const details = (candidate.role_specific_details ?? {}) as Record<string, unknown>;
    const steps = (Array.isArray(details.onboarding_steps) ? details.onboarding_steps : []) as OnboardingStep[];

    if (steps.length === 0) {
      return NextResponse.json(
        { error: 'No onboarding steps stamped on this candidate. Run /onboarding/start first.' },
        { status: 400 }
      );
    }
    if (step_index >= steps.length) {
      return NextResponse.json(
        { error: `step_index ${step_index} out of range (0..${steps.length - 1})` },
        { status: 400 }
      );
    }

    // Mutate the target step in place. Server-time + auth user own the audit fields;
    // the client never gets to spoof completed_by.
    const nowIso = new Date().toISOString();
    const updatedSteps = steps.map((s, idx) =>
      idx === step_index
        ? {
            ...s,
            completed,
            completed_at: completed ? nowIso : null,
            completed_by: completed ? user.id : null,
          }
        : s
    );

    const updatedDetails = { ...details, onboarding_steps: updatedSteps };

    const { data: updated, error: updateErr } = await supabase
      .from('hr_recruitment_candidates')
      .update({ role_specific_details: updatedDetails })
      .eq('id', candidateId)
      .select()
      .single();
    if (updateErr) throw updateErr;

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error('[hr/recruitment/candidates/:id/onboarding/complete-step] POST error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    );
  }
}
