// lib/services/onemark/vault-service.ts
// OneMark learner modes — client-side service.
//
// Two kinds of call, kept apart on purpose:
//
//   1. The attempt API (/api/foundation/onemark/attempts…). Every read of a
//      question and every verdict goes through those routes, because fp_items
//      carries the answer key and is operator-gated under RLS. The browser
//      NEVER queries fp_items. Correctness comes back from Lane S's
//      fn_onemark_record_response; the explanation only after a response.
//
//   2. The learner's OWN Mistake Vault rows, read through the browser client
//      under RLS (onemark_mistake_vault_select = fn_fp_can_view_student, which
//      admits the learner themself). The rows carry item ids and dates only —
//      no question text, no answers — which is exactly what the "when does
//      what come back" list needs and nothing more.
//
// Rulings of record: specs/onemark-decisions-2026-09-02.md.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  MistakeVaultRow,
  OneMarkAttemptMode,
  OneMarkOptionLayout,
} from '@/types/onemark';

const getSupabase = (): any => createClientSupabaseClient();

// ---------------------------------------------------------------------------
// Types — the shapes the attempt routes return
// ---------------------------------------------------------------------------

export interface OneMarkSubject {
  examDefinitionId: string;
  key: string;
  name: string;
  questionCount: number;
  poolReady: boolean;
}

export type LivePaperStatus = 'open' | 'upcoming' | 'closed' | 'submitted' | 'in_progress';

export interface OneMarkLivePaper {
  assessmentId: string;
  title: string;
  examDefinitionId: string;
  examName: string | null;
  opensAt: string;
  closesAt: string | null;
  durationMin: number | null;
  questionCount: number;
  status: LivePaperStatus;
  attemptId: string | null;
}

export interface OneMarkVaultSummary {
  examDefinitionId: string;
  active: number;
  eligibleNow: number;
  mastered: number;
  nextEligibleAt: string | null;
}

export interface OneMarkHome {
  learner: { id: string; full_name: string; grade: string | null } | null;
  subjects: OneMarkSubject[];
  live: OneMarkLivePaper[];
  vault: OneMarkVaultSummary[];
  policy: { timedMinutes: number; questionCount: number } | null;
}

export interface OneMarkOption {
  key: string;
  text: string;
}

export interface OneMarkQuestion {
  id: string;
  stem: string;
  stemTa: string | null;
  options: OneMarkOption[];
  optionsTa: OneMarkOption[] | null;
  optionLayout: OneMarkOptionLayout;
  qType: string | null;
  topicId: string | null;
}

export interface OneMarkSitting {
  attemptId: string;
  sessionId: string | null;
  mode: OneMarkAttemptMode;
  examDefinitionId: string;
  assessmentId: string;
  assessmentTitle: string | null;
  startedAt: string;
  deadlineAt: string | null;
  lockedNavigation: boolean;
  revealAfterAnswer: boolean;
  resumed: boolean;
  alreadyAnswered: string[];
  questions: OneMarkQuestion[];
}

export interface StartSittingInput {
  mode: OneMarkAttemptMode;
  examDefinitionId?: string;
  assessmentId?: string;
}

export interface RespondInput {
  attemptId: string;
  itemId: string;
  chosen?: string;
  skipped?: boolean;
  timeMs?: number;
}

export interface RespondResult {
  itemId: string;
  skipped: boolean;
  isCorrect: boolean | null;
  vaultStatus: string | null;
  streak: number | null;
  reveal: {
    correctAnswer: unknown;
    explanation: string | null;
    explanationTa: string | null;
  } | null;
}

export interface ReviewQuestion {
  itemId: string;
  stem: string;
  stemTa: string | null;
  options: OneMarkOption[];
  optionsTa: OneMarkOption[] | null;
  chosen: unknown;
  skipped: boolean;
  isCorrect: boolean | null;
  correctAnswer: unknown;
  explanation: string | null;
  explanationTa: string | null;
  timeMs: number | null;
}

export interface SittingReview {
  attemptId: string;
  mode: OneMarkAttemptMode | null;
  submittedAt: string | null;
  score: number | null;
  correct: number;
  answered: number;
  skipped: number;
  total: number;
  alreadySubmitted: boolean;
  questions: ReviewQuestion[];
}

/** Thrown by the API wrappers so a caller can branch on the status and on
 *  the structured flags the routes set (expired, alreadySubmitted, empty). */
export class OneMarkApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, body: any) {
    super(body?.error ?? `Request failed (${status})`);
    this.name = 'OneMarkApiError';
    this.status = status;
    this.body = body;
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new OneMarkApiError(res.status, body);
  return body as T;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class OneMarkVaultService {
  /** The learner's OneMark home: subjects, live papers, vault counts. */
  static async getHome(): Promise<OneMarkHome> {
    return call<OneMarkHome>('/api/foundation/onemark/attempts', { method: 'GET' });
  }

  /** Open a sitting. Questions arrive WITHOUT answers. */
  static async startSitting(input: StartSittingInput): Promise<OneMarkSitting> {
    return call<OneMarkSitting>('/api/foundation/onemark/attempts', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /** Record one answer or one skip. The verdict is the RPC's. */
  static async respond(input: RespondInput): Promise<RespondResult> {
    const { attemptId, ...rest } = input;
    return call<RespondResult>(
      `/api/foundation/onemark/attempts/${encodeURIComponent(attemptId)}/respond`,
      { method: 'POST', body: JSON.stringify(rest) },
    );
  }

  /** Close the sitting. Blank questions are passed as skips. A sitting that
   *  was already closed comes back as 409 WITH the review — handled here so
   *  the caller always gets the review either way, flagged alreadySubmitted. */
  static async finalize(attemptId: string, skippedItemIds: string[]): Promise<SittingReview> {
    try {
      return await call<SittingReview>(
        `/api/foundation/onemark/attempts/${encodeURIComponent(attemptId)}/finalize`,
        { method: 'POST', body: JSON.stringify({ skippedItemIds }) },
      );
    } catch (err) {
      if (
        err instanceof OneMarkApiError &&
        err.status === 409 &&
        err.body?.alreadySubmitted === true &&
        Array.isArray(err.body?.questions)
      ) {
        return err.body as SittingReview;
      }
      throw err;
    }
  }

  /** The learner's own vault rows (RLS-scoped). Ids and dates only. */
  static async listMyVault(studentId: string): Promise<MistakeVaultRow[]> {
    const { data, error } = await getSupabase()
      .from('onemark_mistake_vault')
      .select(
        'id, student_id, item_id, consecutive_correct_count, last_correct_session_id, total_wrong, status, mastered_at, next_eligible_at, created_at, updated_at',
      )
      .eq('student_id', studentId)
      .order('next_eligible_at', { ascending: true, nullsFirst: true });
    if (error) throw error;
    return (data ?? []) as MistakeVaultRow[];
  }
}

/** Group upcoming vault reviews by calendar day, for the "what comes back
 *  when" list. Pure, so it is unit-testable and the panel stays dumb. */
export function upcomingVaultDays(
  rows: MistakeVaultRow[],
  now: number = Date.now(),
): Array<{ day: string; count: number }> {
  const byDay = new Map<string, number>();
  for (const r of rows) {
    if (r.status !== 'active' || !r.next_eligible_at) continue;
    const at = new Date(r.next_eligible_at).getTime();
    if (!Number.isFinite(at) || at <= now) continue;
    const day = new Date(at).toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, count]) => ({ day, count }));
}
