/**
 * AI Assistant scheduled questions — shared types.
 * Table + RPCs: supabase/migrations/20270305090000_ai_query_schedules.sql
 */

export type ScheduleCadence = 'daily' | 'weekly' | 'monthly';
export type ScheduleChannel = 'in_app' | 'email';

export type ScheduleStatus =
  | 'scheduled'
  | 'queued'
  | 'delivering'
  | 'delivered'
  | 'failed'
  | 'skipped_limit'
  | 'skipped_busy'
  | 'skipped_offline'
  | 'paused_failures'
  | 'paused_no_access';

/** One row of public.ai_query_schedules as the owner reads it. */
export interface AIQuerySchedule {
  id: string;
  owner_id: string;
  title: string;
  question: string;
  cadence: ScheduleCadence;
  /** weekly only: 0 = Sunday … 6 = Saturday (IST) */
  weekday: number | null;
  /** monthly only: 1 … 31; a shorter month runs on its last day */
  day_of_month: number | null;
  /** 'HH:MM' or 'HH:MM:SS', wall-clock time in IST */
  time_ist: string;
  channels: ScheduleChannel[];
  active: boolean;
  next_run_at: string;
  last_run_at: string | null;
  last_job_id: string | null;
  last_status: ScheduleStatus;
  consecutive_failures: number;
  created_at: string;
  updated_at: string;
}

/** What the "Repeat…" dialog sends to fn_ai_query_schedule_create. */
export interface ScheduleInput {
  title: string;
  question: string;
  cadence: ScheduleCadence;
  weekday: number | null;
  day_of_month: number | null;
  /** 'HH:MM' in IST */
  time_ist: string;
  channels: ScheduleChannel[];
}

/** Every RPC in the migration answers with this envelope. */
export interface ScheduleRpcResult {
  ok: boolean;
  id?: string;
  error?: string;
  status?: string;
  job_id?: string;
  next_run_at?: string;
  active?: boolean;
  cap?: number;
  used?: number;
  limit?: number;
}

/** Most ACTIVE schedules one person may hold (enforced in SQL). */
export const MAX_ACTIVE_SCHEDULES = 10;

/** Failed runs in a row after which a schedule pauses itself (enforced in SQL). */
export const PAUSE_AFTER_FAILURES = 3;
