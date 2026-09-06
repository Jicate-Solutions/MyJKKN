export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/cdc/cron-status
 * Returns last-run + next-run for the 2 CDC cron jobs.
 *
 * Uses a service-role RPC to read cron.job + cron.job_run_details.
 * Gracefully returns empty rows if cron schema is inaccessible.
 * Role: super_admin OR cdc_head
 */

import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import type { CdcCronJobStatus } from '@/types/admin/cdc';

const CDC_CRON_JOBS = ['cdc-coordinator-escalation', 'cdc-placement-snapshot'];

async function requireCdcAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile) return { ok: false as const, status: 403 };

  const allowed =
    profile.is_super_admin ||
    profile.role === 'super_admin' ||
    profile.role === 'cdc_head' ||
    profile.role === 'administrator';

  if (!allowed) return { ok: false as const, status: 403 };
  return { ok: true as const };
}

export async function GET() {
  const auth = await requireCdcAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: auth.status }
    );
  }

  try {
    const serviceClient = createServiceRoleClient();

    // Query cron schema via raw RPC (service-role only)
    const { data, error } = await serviceClient.rpc('fn_cdc_cron_status_admin', {
      p_job_names: CDC_CRON_JOBS,
    });

    if (error) {
      // Graceful degradation: return stub rows if RPC not yet available
      const stubs: CdcCronJobStatus[] = CDC_CRON_JOBS.map((jobname) => ({
        jobname,
        schedule: '(unavailable)',
        last_run: null,
        last_status: null,
        next_run: null,
      }));
      return NextResponse.json({ ok: true, data: stubs, note: error.message });
    }

    return NextResponse.json({ ok: true, data: data as CdcCronJobStatus[] });
  } catch {
    const stubs: CdcCronJobStatus[] = CDC_CRON_JOBS.map((jobname) => ({
      jobname,
      schedule: '(unavailable)',
      last_run: null,
      last_status: null,
      next_run: null,
    }));
    return NextResponse.json({ ok: true, data: stubs, note: 'Cron schema not accessible' });
  }
}
