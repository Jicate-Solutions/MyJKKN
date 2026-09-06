// lib/services/cohort-core/cohort-coordinator-service.ts
// Cohort Coordinators — the read/write client for the appointment record that
// says WHO RUNS each cohort in MyJKKN.
//
// Every call here goes through the API routes in app/api/cohorts/coordinators/*,
// not straight to PostgREST. That keeps the super-admin gate in one auditable
// place per operation, and the routes call the SECURITY DEFINER RPCs from
// 20260809100000_cohort_coordinators_console.sql, which gate again. A caller who
// is not a super administrator gets an explicit 403 with a message, never an
// empty list that reads as "no data".
//
// Connected to: app/(routes)/cohorts/coordinators/ (the console)
//               supabase/migrations/20260809100000_cohort_coordinators_console.sql

/** The six kinds public.cohorts.kind admits. Order is the display order. */
export const COHORT_PROGRAMME_KINDS = [
  'school_of_influence',
  'sf100',
  'mba_associate',
  'foundations',
  'cdc',
  'trainer',
] as const;

export type CohortProgrammeKind = (typeof COHORT_PROGRAMME_KINDS)[number];

/** Plain-English programme names. The database stores the key; people read this. */
export const COHORT_PROGRAMME_LABELS: Record<CohortProgrammeKind, string> = {
  school_of_influence: 'School of Influence',
  sf100: 'Solve for 100',
  mba_associate: 'MBA Associates',
  foundations: 'Foundations',
  cdc: 'CDC Training',
  trainer: 'Trainer Development',
};

export interface CoordinatorAppointment {
  appointment_id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  appointed_at: string;
  note: string | null;
}

export interface CoordinatedCohort {
  id: string;
  name: string;
  status: string;
  academic_year: string | null;
  member_count: number;
  coordinators: CoordinatorAppointment[];
}

export interface RemovedAppointment {
  appointment_id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  cohort_id: string | null;
  removed_at: string | null;
  removal_reason: string | null;
  evidence_field: string | null;
  evidence_value: string | null;
  automatic: boolean;
}

export interface ProgrammeOverview {
  kind: CohortProgrammeKind;
  /** Appointments that cover EVERY cohort of this kind, including future ones. */
  programme_coordinators: CoordinatorAppointment[];
  cohorts: CoordinatedCohort[];
  removed: RemovedAppointment[];
}

export interface CoordinatorsOverview {
  programmes: ProgrammeOverview[];
}

async function callApi<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string } & Record<string, unknown>;
  if (!res.ok) {
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return body as T;
}

export class CohortCoordinatorService {
  /** Every cohort across all six programmes, with who coordinates each. */
  static async overview(): Promise<CoordinatorsOverview> {
    const body = await callApi<{ overview: CoordinatorsOverview }>(
      '/api/cohorts/coordinators'
    );
    return body.overview;
  }

  /**
   * Appoint a coordinator. Pass `cohortId` to pin the appointment to a single
   * cohort; leave it out to cover the whole programme, present and future.
   */
  static async appoint(input: {
    userId: string;
    programmeKind?: CohortProgrammeKind;
    cohortId?: string | null;
    note?: string | null;
  }): Promise<string> {
    const body = await callApi<{ appointmentId: string }>(
      '/api/cohorts/coordinators/appoint',
      { method: 'POST', body: JSON.stringify(input) }
    );
    return body.appointmentId;
  }

  /** Step down a coordinator. The record is written before the removal. */
  static async remove(appointmentId: string, reason?: string): Promise<void> {
    await callApi('/api/cohorts/coordinators/remove', {
      method: 'POST',
      body: JSON.stringify({ appointmentId, reason }),
    });
  }

  /** Put a removed appointment back — the one-click undo for a wrong departure. */
  static async reinstate(appointmentId: string): Promise<void> {
    await callApi('/api/cohorts/coordinators/reinstate', {
      method: 'POST',
      body: JSON.stringify({ appointmentId }),
    });
  }
}
