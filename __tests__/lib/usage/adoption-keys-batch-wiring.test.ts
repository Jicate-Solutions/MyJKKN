import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FEATURE_KEYS } from '@/lib/usage/record';

/**
 * Adoption desk batch — eight busy modules the loop could not see. One line at
 * each module's core action, so first-use coverage is measurable.
 *
 * Source checks strip comments first: a key named in prose must not satisfy an
 * assertion that the line exists. fn_feature_used keys the row on auth.uid(),
 * so every call must sit on a SESSION-scoped client — a service-role client
 * has no auth.uid() and records nothing, which is the silent way this wiring
 * fails. The last test is the guard against exactly that.
 */

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const read = (rel: string) => stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));

const SITES: Array<{ file: string; client: string; key: keyof typeof FEATURE_KEYS }> = [
  { file: 'app/api/service-requests/route.ts', client: 'await createServerSupabaseClient\\(\\)', key: 'SERVICE_REQUESTS_RAISE' },
  { file: 'app/api/service-requests/[id]/submit/route.ts', client: 'await createServerSupabaseClient\\(\\)', key: 'SERVICE_REQUESTS_RAISE' },
  { file: 'app/api/users/[id]/route.ts', client: 'supabase', key: 'USERS_ASSIGN_ROLE' },
  { file: 'app/api/users/[id]/role/route.ts', client: 'supabase', key: 'USERS_ASSIGN_ROLE' },
  { file: 'app/api/users/roles/assign/route.ts', client: 'supabase', key: 'USERS_ASSIGN_ROLE' },
  { file: 'lib/services/campus-living/hostel-leave-service.ts', client: 'supabase', key: 'CAMPUS_LIVING_LEAVE_APPLY' },
  { file: 'lib/services/campus-living/gate-pass-service.ts', client: 'supabase', key: 'CAMPUS_LIVING_GATE_PASS_REQUEST' },
  { file: 'app/api/cdc/drives/[id]/willingness/route.ts', client: 'supabase', key: 'CDC_DECLARE_INTEREST' },
  { file: 'app/api/hr/leave/applications/route.ts', client: 'supabase', key: 'HR_LEAVE_APPLY' },
  { file: 'app/api/hr/leave/applications/[id]/approve/route.ts', client: 'supabase', key: 'HR_LEAVE_DECIDE' },
  { file: 'app/api/hr/leave/applications/[id]/reject/route.ts', client: 'supabase', key: 'HR_LEAVE_DECIDE' },
];

describe('adoption loop — the seven keys wired here', () => {
  it('spells each key exactly as feature_registry holds it', () => {
    expect(FEATURE_KEYS.SERVICE_REQUESTS_RAISE).toBe('service_requests.raise');
    expect(FEATURE_KEYS.USERS_ASSIGN_ROLE).toBe('users.assign_role');
    expect(FEATURE_KEYS.CAMPUS_LIVING_LEAVE_APPLY).toBe('campus_living.leave_apply');
    expect(FEATURE_KEYS.CAMPUS_LIVING_GATE_PASS_REQUEST).toBe('campus_living.gate_pass_request');
    expect(FEATURE_KEYS.CDC_DECLARE_INTEREST).toBe('cdc.declare_interest');
    expect(FEATURE_KEYS.HR_LEAVE_APPLY).toBe('hr.leave_apply');
    expect(FEATURE_KEYS.HR_LEAVE_DECIDE).toBe('hr.leave_decide');
    // hr.attendance_month_close is declared here but wired in its own PR.
    expect(FEATURE_KEYS.HR_ATTENDANCE_MONTH_CLOSE).toBe('hr.attendance_month_close');
  });

  it.each(SITES)('$file records $key at its core action', ({ file, client, key }) => {
    const src = read(file);
    expect(src).toMatch(
      new RegExp(`recordFeatureUse\\(\\s*${client},\\s*FEATURE_KEYS\\.${key}\\s*,?\\s*\\)`),
    );
  });

  it('a service request created as a draft is not yet raised', () => {
    const src = read('app/api/service-requests/route.ts');
    expect(src).toMatch(
      /status\s*!==\s*'draft'\s*\)\s*\{\s*await recordFeatureUse\(\s*await createServerSupabaseClient\(\),\s*FEATURE_KEYS\.SERVICE_REQUESTS_RAISE/,
    );
  });

  it('declining a drive is not declaring interest', () => {
    const src = read('app/api/cdc/drives/[id]/willingness/route.ts');
    expect(src).toMatch(
      /if\s*\(\s*intent\s*===\s*'willing'\s*\)\s*\{\s*await recordFeatureUse\(\s*supabase,\s*FEATURE_KEYS\.CDC_DECLARE_INTEREST\s*\)/,
    );
  });

  it('a write that threw is never counted', () => {
    const gatePass = read('lib/services/campus-living/gate-pass-service.ts');
    expect(gatePass.indexOf("throw new Error(getErrorMessage(error));")).toBeLessThan(
      gatePass.indexOf('FEATURE_KEYS.CAMPUS_LIVING_GATE_PASS_REQUEST'),
    );
  });

  it('never records on a service-role client — it has no auth.uid() and writes nothing', () => {
    for (const { file } of SITES) {
      const src = read(file);
      expect(src).not.toMatch(
        /recordFeatureUse\(\s*(admin|supabaseAdmin|serviceSupabase|createServiceRoleClient\(\))\s*,/,
      );
    }
  });
});
