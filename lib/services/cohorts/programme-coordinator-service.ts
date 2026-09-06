// lib/services/cohorts/programme-coordinator-service.ts
//
// Programme coordinators — the ONE service behind the shared coordinators panel.
//
// It is a thin wrapper over four SECURITY DEFINER RPCs that already exist on
// production (signatures read from the live PostgREST schema 2026-08-08):
//
//   fn_cohort_coordinators_overview()                                 -> jsonb
//   fn_cohort_coordinator_appoint(p_user_id, p_programme_kind,
//                                 p_cohort_id, p_note)                -> uuid
//   fn_cohort_coordinator_remove(p_appointment_id, p_reason)          -> boolean
//   fn_cohort_coordinator_reinstate(p_appointment_id)                 -> boolean
//
// This file adds NO new mechanism, NO new table and NO second way to appoint a
// coordinator. In particular it is NOT the old induction pattern: induction used
// to appoint through fn_induction_assign_coordinator, which INSERTed into
// user_roles and therefore handed out a GLOBAL role. That path was retired on
// 2026-08-18 and induction now appoints per-event only, the same shape as here:
// appointing a programme coordinator writes one row in cohort_coordinators and
// grants nothing global.
//
// CLIENT-ONLY. The browser Supabase client carries the caller's session, so each
// DEFINER function authorises the real person. Imported from a Server Component
// or a route handler it would run as `anon` and every call would be refused
// (ref feedback_browser_supabase_client_serverside_returns_empty). The server
// half of this feature lives in lib/services/cohorts/coordinator-notifications.ts.
//
// The RPCs are new and are not in the generated Supabase types, so calls go
// through `as any` — the established pattern in this codebase.

import { createClientSupabaseClient } from '@/lib/supabase/client';

/**
 * One appointment, as the panel renders it.
 *
 * Field names follow the `cohort_coordinators` table columns, read from the live
 * PostgREST schema on 2026-08-08: id, programme_kind, cohort_id, user_id, status,
 * note, appointed_by, appointed_at, removed_at, removed_by, removal_reason.
 *
 * HONEST LIMIT: production holds ZERO appointments today, so the overview's
 * per-appointment JSON could not be observed with a real row in it — only its
 * container (programmes -> cohorts / programme_coordinators / removed) could.
 * `normaliseCoordinator` therefore reads the table's own column names, accepts
 * the one obvious alias for each of the two fields that could plausibly differ,
 * and treats every display field as optional. Names are then resolved from
 * `profiles` (see `attachNames`) so the screen can never print a bare UUID at a
 * COO, whether or not the RPC embeds names itself.
 */
export interface ProgrammeCoordinator {
  /** cohort_coordinators.id — the value the remove / reinstate RPCs take. */
  id: string;
  user_id: string | null;
  full_name: string | null;
  email: string | null;
  /** null means the appointment covers the whole programme, not one batch. */
  cohort_id: string | null;
  status: string | null;
  note: string | null;
  appointed_by: string | null;
  appointed_by_name: string | null;
  appointed_at: string | null;
  removed_at: string | null;
  removed_by: string | null;
  removed_by_name: string | null;
  removal_reason: string | null;
}

/** One batch of a programme, with the coordinators appointed to just that batch. */
export interface ProgrammeCohort {
  id: string;
  name: string | null;
  status: string | null;
  member_count: number | null;
  academic_year: string | null;
  coordinators: ProgrammeCoordinator[];
}

/** Everything the panel shows for one programme. */
export interface ProgrammeCoordinatorsView {
  kind: string;
  /** Appointments that cover the whole programme. */
  programme_coordinators: ProgrammeCoordinator[];
  cohorts: ProgrammeCohort[];
  /** Past appointments, kept so a mistaken removal can be put back. */
  removed: ProgrammeCoordinator[];
}

/** What the panel needs to know about a refusal, kept off the happy path. */
export interface CoordinatorError extends Error {
  status?: number;
}

function explain(error: unknown, fallback: string): CoordinatorError {
  const message = (error as { message?: string })?.message?.trim();
  const code = (error as { code?: string })?.code;
  const explained = new Error(
    message && message.length > 0 ? message : fallback
  ) as CoordinatorError;
  // 42501 = insufficient_privilege — how these RPCs refuse a caller.
  explained.status = code === '42501' ? 403 : 400;
  return explained;
}

export function isCoordinatorAccessDenied(error: unknown): boolean {
  return (error as { status?: number })?.status === 403;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normaliseCoordinator(raw: unknown): ProgrammeCoordinator | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = text(r.id) ?? text(r.appointment_id);
  if (!id) return null;
  return {
    id,
    user_id: text(r.user_id),
    full_name: text(r.full_name) ?? text(r.name),
    email: text(r.email),
    cohort_id: text(r.cohort_id),
    status: text(r.status),
    note: text(r.note),
    appointed_by: text(r.appointed_by),
    appointed_by_name: text(r.appointed_by_name),
    appointed_at: text(r.appointed_at),
    removed_at: text(r.removed_at),
    removed_by: text(r.removed_by),
    removed_by_name: text(r.removed_by_name),
    removal_reason: text(r.removal_reason),
  };
}

function normaliseList(raw: unknown): ProgrammeCoordinator[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normaliseCoordinator)
    .filter((c): c is ProgrammeCoordinator => c !== null);
}

function normaliseCohort(raw: unknown): ProgrammeCohort | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = text(r.id);
  if (!id) return null;
  return {
    id,
    name: text(r.name),
    status: text(r.status),
    member_count: count(r.member_count),
    academic_year: text(r.academic_year),
    coordinators: normaliseList(r.coordinators),
  };
}

function normaliseProgramme(raw: unknown): ProgrammeCoordinatorsView | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const kind = text(r.kind);
  if (!kind) return null;
  return {
    kind,
    programme_coordinators: normaliseList(r.programme_coordinators),
    cohorts: Array.isArray(r.cohorts)
      ? r.cohorts
          .map(normaliseCohort)
          .filter((c): c is ProgrammeCohort => c !== null)
      : [],
    removed: normaliseList(r.removed),
  };
}

/** Every appointment in a view, so ids can be gathered and names written back. */
function allAppointments(view: ProgrammeCoordinatorsView): ProgrammeCoordinator[] {
  return [
    ...view.programme_coordinators,
    ...view.cohorts.flatMap((c) => c.coordinators),
    ...view.removed,
  ];
}

export class ProgrammeCoordinatorService {
  private static supabase = createClientSupabaseClient();

  // ── Reads ──────────────────────────────────────────────────────────────────

  /**
   * Every programme, with its coordinators. Throws with `status: 403` when the
   * caller may not see appointments — the panel turns that into a sentence, not
   * an empty list (CLAUDE.md rule 27).
   */
  static async overview(): Promise<ProgrammeCoordinatorsView[]> {
    const { data, error } = await (this.supabase as any).rpc(
      'fn_cohort_coordinators_overview'
    );
    if (error) throw explain(error, 'Coordinators could not be loaded.');

    const programmes = (data as { programmes?: unknown })?.programmes;
    const views = Array.isArray(programmes)
      ? programmes
          .map(normaliseProgramme)
          .filter((p): p is ProgrammeCoordinatorsView => p !== null)
      : [];

    await this.attachNames(views.flatMap(allAppointments));
    return views;
  }

  /** One programme's coordinators, or null when the overview does not list it. */
  static async forProgramme(
    programmeKind: string
  ): Promise<ProgrammeCoordinatorsView | null> {
    const views = await this.overview();
    return views.find((v) => v.kind === programmeKind) ?? null;
  }

  /**
   * Fill in any person's name the overview did not already carry.
   *
   * A COO reading "Appointed by 9f3c…-…" learns nothing, and this platform has
   * shipped a raw-UUID people control before. One directory read closes that
   * whether or not the RPC embeds names. Failure here is not fatal: the row is
   * still shown, just without the name.
   */
  private static async attachNames(rows: ProgrammeCoordinator[]): Promise<void> {
    const wanted = new Set<string>();
    for (const row of rows) {
      if (row.user_id && (!row.full_name || !row.email)) wanted.add(row.user_id);
      if (row.appointed_by && !row.appointed_by_name) wanted.add(row.appointed_by);
      if (row.removed_by && !row.removed_by_name) wanted.add(row.removed_by);
    }
    if (wanted.size === 0) return;

    const { data, error } = await (this.supabase as any)
      .from('profiles')
      .select('id, full_name, email')
      .in('id', Array.from(wanted));
    if (error || !Array.isArray(data)) return;

    const byId = new Map<string, { full_name: string | null; email: string | null }>();
    for (const p of data as Array<Record<string, unknown>>) {
      const id = text(p.id);
      if (id) byId.set(id, { full_name: text(p.full_name), email: text(p.email) });
    }

    for (const row of rows) {
      const self = row.user_id ? byId.get(row.user_id) : undefined;
      if (self) {
        row.full_name = row.full_name ?? self.full_name;
        row.email = row.email ?? self.email;
      }
      if (row.appointed_by && !row.appointed_by_name) {
        row.appointed_by_name = byId.get(row.appointed_by)?.full_name ?? null;
      }
      if (row.removed_by && !row.removed_by_name) {
        row.removed_by_name = byId.get(row.removed_by)?.full_name ?? null;
      }
    }
  }

  // ── Writes ─────────────────────────────────────────────────────────────────

  /**
   * Appoint one person. `cohortId` null (the default) means the whole programme.
   * Returns the new appointment id.
   */
  static async appoint(input: {
    userId: string;
    programmeKind: string;
    cohortId?: string | null;
    note?: string | null;
  }): Promise<string> {
    const { data, error } = await (this.supabase as any).rpc(
      'fn_cohort_coordinator_appoint',
      {
        p_user_id: input.userId,
        p_programme_kind: input.programmeKind,
        p_cohort_id: input.cohortId ?? null,
        p_note: input.note?.trim() ? input.note.trim() : null,
      }
    );
    if (error) throw explain(error, 'This person could not be appointed.');
    return String(data ?? '');
  }

  /**
   * Step down a coordinator. The reason is REQUIRED — the database refuses a
   * blank one, so the panel keeps its confirm button disabled until words are
   * typed rather than letting the person meet a refusal after committing.
   */
  static async remove(input: {
    appointmentId: string;
    reason: string;
  }): Promise<boolean> {
    const { data, error } = await (this.supabase as any).rpc(
      'fn_cohort_coordinator_remove',
      { p_appointment_id: input.appointmentId, p_reason: input.reason.trim() }
    );
    if (error) throw explain(error, 'This coordinator could not be removed.');
    return data === true;
  }

  /** Put back an appointment that was removed. */
  static async reinstate(appointmentId: string): Promise<boolean> {
    const { data, error } = await (this.supabase as any).rpc(
      'fn_cohort_coordinator_reinstate',
      { p_appointment_id: appointmentId }
    );
    if (error) throw explain(error, 'This coordinator could not be put back.');
    return data === true;
  }

  // ── Telling people ─────────────────────────────────────────────────────────

  /**
   * Ask the server to send the notifications for a change that just happened
   * (decisions D12 and D5). Only the appointment id and what happened are sent —
   * the server re-reads the appointment and decides who hears about it, so a
   * caller cannot address a message to anyone.
   *
   * Deliberately silent on failure. The appointment itself is already saved; a
   * notification that did not go out must not be reported as a failed
   * appointment, and the panel refreshes from the database either way.
   */
  static async announce(input: {
    appointmentId: string;
    action: 'appointed' | 'removed';
  }): Promise<void> {
    try {
      await fetch('/api/cohorts/coordinators/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
    } catch {
      // See above — never surfaced, never blocks.
    }
  }
}
