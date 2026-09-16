/**
 * lib/services/cdc/willingness-cycles.ts
 *
 * Willingness opening cycles for a CDC drive (cdc_drive_willingness_cycles).
 *
 *   cycle 1   open → close  → notification sent   (created when the drive
 *                                                   transitions to willingness_open)
 *   cycle N   reopened → close → notification sent (CDC "Reopen Willingness")
 *
 * The CURRENT cycle (highest cycle_no) is mirrored onto
 * cdc_drives.willingness_window_open_at / _close_at, so every existing window
 * check (computeWillingnessWindowState, the learner page, /mine, the dashboard
 * card) keeps working without knowing cycles exist.
 *
 * Notification rule: exactly one send per cycle, when open_at passes.
 * Creating / saving / reopening dispatches immediately if the cycle is already
 * due; otherwise /api/cron/cdc-willingness-cycles picks it up. Editing other
 * drive details never re-notifies.
 *
 * Service-role client required for writes; the API routes gate the caller.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CdcDrive,
  CdcWillingnessCycle,
  CdcWillingnessCycleDisplayStatus,
  CdcWillingnessCycleStatus,
} from '@/types/cdc';
import { CDC_WILLINGNESS_NOTIFICATION_TYPE, notifyDriveWillingnessOpen, type DriveNotifyResult } from './drive-notifications';

const TABLE = 'cdc_drive_willingness_cycles';

type CycleRow = Omit<CdcWillingnessCycle, 'display_status' | 'notified_count'>;

export function cycleDisplayStatus(c: Pick<CycleRow, 'open_at' | 'close_at' | 'status' | 'cycle_no'>, now = new Date()): CdcWillingnessCycleDisplayStatus {
  if (c.status === 'closed') return 'closed';
  const open = new Date(c.open_at).getTime();
  const close = c.close_at ? new Date(c.close_at).getTime() : null;
  if (close != null && close <= now.getTime()) return 'expired';
  if (open > now.getTime()) return 'scheduled';
  return c.cycle_no > 1 ? 'reopened' : 'open';
}

function storedKind(cycleNo: number, openAt: string, now = new Date()): CdcWillingnessCycleStatus {
  if (new Date(openAt).getTime() > now.getTime()) return 'scheduled';
  return cycleNo > 1 ? 'reopened' : 'open';
}

function assertWindow(openAt: string, closeAt: string | null): void {
  const o = new Date(openAt);
  if (Number.isNaN(o.getTime())) throw new Error('Open date & time is invalid.');
  if (closeAt) {
    const c = new Date(closeAt);
    if (Number.isNaN(c.getTime())) throw new Error('Close date & time is invalid.');
    if (c.getTime() <= o.getTime()) throw new Error('Close date & time must be after the open date & time.');
  }
}

export async function listCycles(service: SupabaseClient, driveId: string): Promise<CdcWillingnessCycle[]> {
  const { data, error } = await service.from(TABLE).select('*').eq('drive_id', driveId).order('cycle_no', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as CycleRow[];
  if (rows.length === 0) return [];

  // Notified counts per cycle from the audit log.
  const { data: logRows, error: logErr } = await service
    .from('cdc_drive_notification_log')
    .select('cycle_no')
    .eq('drive_id', driveId)
    .eq('notification_type', CDC_WILLINGNESS_NOTIFICATION_TYPE)
    .eq('status', 'sent')
    .limit(50000);
  if (logErr) throw logErr;
  const counts = new Map<number, number>();
  for (const r of logRows ?? []) {
    const n = (r.cycle_no as number) ?? 1;
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  const now = new Date();
  return rows.map((r) => ({ ...r, display_status: cycleDisplayStatus(r, now), notified_count: counts.get(r.cycle_no) ?? 0 }));
}

export async function currentCycle(service: SupabaseClient, driveId: string): Promise<CycleRow | null> {
  const { data, error } = await service
    .from(TABLE)
    .select('*')
    .eq('drive_id', driveId)
    .order('cycle_no', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as CycleRow | null) ?? null;
}

async function mirrorToDrive(service: SupabaseClient, driveId: string, openAt: string, closeAt: string | null, actorId: string | null): Promise<CdcDrive> {
  const { data, error } = await service
    .from('cdc_drives')
    .update({
      willingness_window_open_at: openAt,
      willingness_window_close_at: closeAt,
      updated_at: new Date().toISOString(),
      updated_by: actorId,
    })
    .eq('id', driveId)
    .select('*')
    .single();
  if (error) throw error;
  return data as CdcDrive;
}

/**
 * Create cycle 1 when the drive enters willingness_open. Idempotent: an
 * existing cycle set is left alone. Uses the drive's window columns as the
 * initial window (open_at defaults to now).
 */
export async function ensureInitialCycle(service: SupabaseClient, drive: CdcDrive, actorId: string): Promise<CycleRow> {
  const existing = await currentCycle(service, drive.id);
  if (existing) return existing;
  const openAt = drive.willingness_window_open_at ?? new Date().toISOString();
  const closeAt = drive.willingness_window_close_at ?? null;
  assertWindow(openAt, closeAt);
  const { data, error } = await service
    .from(TABLE)
    .insert({
      drive_id: drive.id,
      cycle_no: 1,
      open_at: openAt,
      close_at: closeAt,
      status: storedKind(1, openAt),
      created_by: actorId,
    })
    .select('*')
    .single();
  if (error) throw error;
  if (!drive.willingness_window_open_at) await mirrorToDrive(service, drive.id, openAt, closeAt, actorId);
  return data as CycleRow;
}

/** "Save Settings" — edit the current cycle's window; mirrors to the drive. */
export async function updateCurrentCycleWindow(
  service: SupabaseClient,
  driveId: string,
  input: { open_at: string; close_at: string | null },
  actorId: string
): Promise<{ cycle: CycleRow; drive: CdcDrive }> {
  const current = await currentCycle(service, driveId);
  if (!current) throw new Error('Willingness has not been opened for this drive yet.');
  assertWindow(input.open_at, input.close_at);
  const now = new Date();
  const closedNow = !!input.close_at && new Date(input.close_at).getTime() <= now.getTime();
  const { data, error } = await service
    .from(TABLE)
    .update({
      open_at: input.open_at,
      close_at: input.close_at,
      status: closedNow ? 'closed' : storedKind(current.cycle_no, input.open_at, now),
      updated_at: now.toISOString(),
    })
    .eq('id', current.id)
    .select('*')
    .single();
  if (error) throw error;
  const drive = await mirrorToDrive(service, driveId, input.open_at, input.close_at, actorId);
  return { cycle: data as CycleRow, drive };
}

/**
 * "Reopen Willingness" — closes the current cycle, starts cycle N+1, mirrors
 * the new window, and (if the drive had moved to eligibility_locked) returns
 * it to willingness_open with an audit transition.
 */
export async function reopenCycle(
  service: SupabaseClient,
  drive: CdcDrive,
  input: { open_at: string; close_at: string | null; reason?: string | null },
  actorId: string
): Promise<{ cycle: CycleRow; drive: CdcDrive }> {
  if (drive.status !== 'willingness_open' && drive.status !== 'eligibility_locked') {
    throw new Error('Willingness can be reopened only while the drive is in Willingness Open or Eligibility Locked.');
  }
  assertWindow(input.open_at, input.close_at);
  const now = new Date();
  const current = await currentCycle(service, drive.id);
  if (current && current.status !== 'closed') {
    await service.from(TABLE).update({ status: 'closed', updated_at: now.toISOString() }).eq('id', current.id);
  }
  const cycleNo = (current?.cycle_no ?? 0) + 1;
  const { data, error } = await service
    .from(TABLE)
    .insert({
      drive_id: drive.id,
      cycle_no: cycleNo,
      open_at: input.open_at,
      close_at: input.close_at,
      status: storedKind(cycleNo, input.open_at, now),
      reopen_reason: input.reason?.trim() || null,
      created_by: actorId,
    })
    .select('*')
    .single();
  if (error) throw error;

  let updated = await mirrorToDrive(service, drive.id, input.open_at, input.close_at, actorId);
  if (drive.status === 'eligibility_locked') {
    const { data: back, error: stErr } = await service
      .from('cdc_drives')
      .update({ status: 'willingness_open', updated_at: now.toISOString(), updated_by: actorId })
      .eq('id', drive.id)
      .select('*')
      .single();
    if (stErr) throw stErr;
    updated = back as CdcDrive;
    await service.from('cdc_drive_state_transitions').insert({
      drive_id: drive.id,
      from_status: 'eligibility_locked',
      to_status: 'willingness_open',
      transitioned_by: actorId,
      transitioned_at: now.toISOString(),
      reason: input.reason?.trim() || `Willingness reopened (cycle ${cycleNo})`,
      metadata: { willingness_cycle_no: cycleNo, reopened: true },
    });
  }
  return { cycle: data as CycleRow, drive: updated };
}

export interface CycleDispatchResult {
  cycle_no: number;
  notify?: DriveNotifyResult;
  error?: string;
}

/**
 * Send the notification for every cycle of `driveId` (or all drives when
 * omitted) whose open_at has passed, whose window has not already ended, and
 * whose notification is still pending. The drive must be in willingness_open.
 */
export async function dispatchDueCycles(service: SupabaseClient, opts: { driveId?: string; now?: Date } = {}): Promise<CycleDispatchResult[]> {
  const now = opts.now ?? new Date();
  let q = service
    .from(TABLE)
    .select('*')
    .eq('notification_sent', false)
    .neq('status', 'closed')
    .lte('open_at', now.toISOString())
    .order('open_at', { ascending: true })
    .limit(200);
  if (opts.driveId) q = q.eq('drive_id', opts.driveId);
  const { data, error } = await q;
  if (error) throw error;
  const due = ((data ?? []) as CycleRow[]).filter((c) => !c.close_at || new Date(c.close_at).getTime() > now.getTime());
  const results: CycleDispatchResult[] = [];
  for (const cycle of due) {
    const { data: drive } = await service.from('cdc_drives').select('*').eq('id', cycle.drive_id).maybeSingle();
    const d = drive as CdcDrive | null;
    if (!d || d.status !== 'willingness_open') continue;
    try {
      const notify = await notifyDriveWillingnessOpen(service, d, cycle.created_by ?? d.created_by ?? '', cycle.cycle_no);
      await service
        .from(TABLE)
        .update({
          notification_sent: true,
          notification_sent_at: now.toISOString(),
          notification_id: notify.notification_id ?? null,
          status: storedKind(cycle.cycle_no, cycle.open_at, now),
          updated_at: now.toISOString(),
        })
        .eq('id', cycle.id);
      results.push({ cycle_no: cycle.cycle_no, notify });
    } catch (err) {
      console.error('[cdc/willingness-cycles] dispatch failed', cycle.id, err);
      results.push({ cycle_no: cycle.cycle_no, error: err instanceof Error ? err.message : 'Notification failed' });
    }
  }
  return results;
}
