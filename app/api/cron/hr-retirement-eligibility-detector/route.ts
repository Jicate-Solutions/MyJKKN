// =====================================================================
// HR Retirement Eligibility Detector — Monthly cron (T6.4)
// =====================================================================
// Sweeps the staff roster once a month, detects employees approaching
// retirement age (default 60, override per institution via
// platform_policies key `hr.retirement.age`), and auto-creates an
// offboarding case in hr_offboarding_cases with separation_type='retirement'.
//
// Auto-open window: staff whose 60th birthday lands in the next
// RETIREMENT_LOOKAHEAD_MONTHS months (default 6). The window prevents the
// cron from re-creating cases for already-retired staff and gives HR a
// pre-emptive heads-up so paperwork can start.
//
// Idempotency: the substrate has a UNIQUE index on (staff_id) WHERE
// status='open' (from γ Wave 1), so the INSERT skips silently if a case is
// already open for that staff. We also guard against closed historical
// retirement cases by checking that no retirement-typed case has ever
// existed for that staff (open OR closed).
//
// Auth: Bearer CRON_SECRET (Vercel cron auto-sends) OR ?secret=<value>
// query param. Mirrors counselor-shift-flip and the other crons.
//
// Required env: CRON_SECRET (already in Vercel)
// Optional env:
//   - HR_DEFAULT_RETIREMENT_AGE     (default 60)
//   - RETIREMENT_LOOKAHEAD_MONTHS   (default 6)
//
// Schedule (vercel.json): monthly, 1st of month at 02:00 UTC.
//
// Created: 2026-05-15 — T6.4 (Wave 2) extension to γ's Wave 1 offboarding.
// Spec: hr-module-decomposition-2026-05-09.md (T6.4)

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

const DEFAULT_RETIREMENT_AGE = Number(process.env.HR_DEFAULT_RETIREMENT_AGE ?? 60);
const LOOKAHEAD_MONTHS = Number(process.env.RETIREMENT_LOOKAHEAD_MONTHS ?? 6);

interface RetirementPolicyValue {
  retirement_age?: number;
}

function ageOnDate(dobIso: string, on: Date): number {
  const dob = new Date(dobIso);
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const m = on.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age;
}

export async function GET(request: NextRequest) {
  const started = Date.now();

  // ----------------------------------------------------------------
  // Auth
  // ----------------------------------------------------------------
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET not configured' },
      { status: 500 },
    );
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  // ----------------------------------------------------------------
  // 1. Resolve per-institution retirement age via platform_policies
  // ----------------------------------------------------------------
  const { data: policyRows } = await supabase
    .from('platform_policies')
    .select('scope_id, value')
    .eq('policy_key', 'hr.retirement.age')
    .eq('scope_type', 'institution');

  const ageByInstitution = new Map<string, number>();
  (policyRows ?? []).forEach((r) => {
    const v = (r.value ?? {}) as RetirementPolicyValue;
    if (r.scope_id && typeof v.retirement_age === 'number') {
      ageByInstitution.set(r.scope_id as string, v.retirement_age);
    }
  });

  // ----------------------------------------------------------------
  // 2. Pull active staff with DOB; filter to those approaching retirement
  // ----------------------------------------------------------------
  // We over-fetch a reasonable cap (staff roster is small per institution)
  // rather than paginating — the detector runs once a month and the entire
  // active staff set fits comfortably in 5000.
  const { data: staffRows, error: staffErr } = await supabase
    .from('staff')
    .select('id, first_name, last_name, institution_id, date_of_birth, is_active')
    .eq('is_active', true)
    .not('date_of_birth', 'is', null)
    .limit(5000);

  if (staffErr) {
    return NextResponse.json(
      { ok: false, error: 'staff fetch failed', detail: staffErr.message },
      { status: 500 },
    );
  }

  const now = new Date();
  const lookahead = new Date(now);
  lookahead.setUTCMonth(lookahead.getUTCMonth() + LOOKAHEAD_MONTHS);

  type Candidate = {
    staff_id: string;
    institution_id: string;
    age_today: number;
    age_at_separation: number;
    full_name: string;
    retires_on: string;
  };
  const candidates: Candidate[] = [];

  for (const s of staffRows ?? []) {
    if (!s.date_of_birth || !s.institution_id) continue;
    const retirementAge =
      ageByInstitution.get(s.institution_id as string) ?? DEFAULT_RETIREMENT_AGE;
    const ageNow = ageOnDate(s.date_of_birth as string, now);
    const ageEnd = ageOnDate(s.date_of_birth as string, lookahead);
    // Detector window: hits retirement age during the lookahead OR has already crossed it.
    if (ageEnd < retirementAge) continue;

    // Compute the exact ISO date of the retirement birthday.
    const dob = new Date(s.date_of_birth as string);
    const retiresOn = new Date(
      Date.UTC(dob.getUTCFullYear() + retirementAge, dob.getUTCMonth(), dob.getUTCDate()),
    );

    candidates.push({
      staff_id: s.id as string,
      institution_id: s.institution_id as string,
      age_today: ageNow,
      age_at_separation: retirementAge,
      full_name: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim(),
      retires_on: retiresOn.toISOString().slice(0, 10),
    });
  }

  // ----------------------------------------------------------------
  // 3. For each candidate, skip if a retirement case already exists (any status)
  // ----------------------------------------------------------------
  let inserted = 0;
  let skippedExisting = 0;
  const errors: Array<{ staff_id: string; error: string }> = [];

  for (const c of candidates) {
    const { data: existing, error: existErr } = await supabase
      .from('hr_offboarding_cases')
      .select('id, status')
      .eq('staff_id', c.staff_id)
      .eq('separation_type', 'retirement')
      .limit(1);
    if (existErr) {
      errors.push({ staff_id: c.staff_id, error: existErr.message });
      continue;
    }
    if (existing && existing.length > 0) {
      skippedExisting += 1;
      continue;
    }

    const { error: insErr } = await supabase.from('hr_offboarding_cases').insert({
      staff_id: c.staff_id,
      institution_id: c.institution_id,
      initiated_by: null,
      reason: `Auto-detected: ${c.full_name} reaches retirement age ${c.age_at_separation} on ${c.retires_on}.`,
      recommended_last_day: c.retires_on,
      current_step_index: 1,
      status: 'open',
      separation_type: 'retirement',
      retirement_age_at_separation: c.age_at_separation,
      metadata: {
        auto_created_by: 'hr-retirement-eligibility-detector',
        detected_at: new Date().toISOString(),
        age_today: c.age_today,
      },
    });

    if (insErr) {
      // The unique-open-case index can race with manual initiations — surface
      // but don't fail the whole sweep.
      errors.push({ staff_id: c.staff_id, error: insErr.message });
      continue;
    }
    inserted += 1;
  }

  return NextResponse.json({
    ok: true,
    elapsed_ms: Date.now() - started,
    default_retirement_age: DEFAULT_RETIREMENT_AGE,
    lookahead_months: LOOKAHEAD_MONTHS,
    scanned_staff: (staffRows ?? []).length,
    candidates: candidates.length,
    inserted,
    skipped_existing: skippedExisting,
    errors,
  });
}
