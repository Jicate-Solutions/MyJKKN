/**
 * Schools Network — Leadership scoreboard fetch helper (self-contained).
 *
 * Kept OUT of the shared `_lib/api.ts` deliberately: this file is touched only
 * by the scoreboard build, so parallel agents editing nearby files never
 * collide here. Mirrors `api.ts`'s `call()` envelope handling (server wraps in
 * `{ success, data }` via `lib/api/response.ts`).
 */

const BASE = '/api/schools-network';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  // Abort if the request stalls past 30s (the RPC's own statement_timeout is
  // 20s) so useQuery(retry:false) surfaces an error rather than an endless
  // skeleton if the network layer hangs.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let res: Response;
  try {
    res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const body = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    data?: unknown;
    error?: string;
    message?: string;
  };
  if (!res.ok || (body && body.success === false)) {
    const err = new Error(
      body?.message || body?.error || `Request failed: ${res.status}`
    ) as Error & { status?: number };
    err.status = res.status; // callers branch on 403 → access denied
    throw err;
  }
  return (body?.data ?? body) as T;
}

/** One row in the gainers / losers top-movers tables. */
export interface ScoreboardMover {
  school_name: string;
  /** Learners enrolled from this school in the active cycle (so far). */
  current: number;
  /** Learners enrolled from this school in the prior cycle. */
  prior: number;
  /** current − prior (positive = gainer, negative = loser). */
  delta: number;
}

/** The full momentum board payload from fn_schools_network_scoreboard. */
export interface Scoreboard {
  /** Active admission cycle the board measures (latest with learners, or the
   *  pinned year). */
  cycle_year: number | null;
  /** Prior cycle compared against (next-lower year with learners — not
   *  necessarily cycle_year − 1). NULL when there is no earlier cohort. */
  prior_cycle_year: number | null;
  /** Total learners enrolled from ALL feeder schools in the active cycle. */
  total_current: number;
  /** Total learners enrolled from all feeder schools in the prior cycle. */
  total_prior: number;
  /** total_current − total_prior — the headline momentum number. */
  total_delta: number;
  /** Feeder schools already adopted into the network. */
  adopted_count: number;
  /** Distinct feeder schools tracked (enrolled ∪ marketing prospects). */
  feeder_count: number;
  /** Top schools sending MORE this cycle (delta > 0), biggest first. */
  gainers: ScoreboardMover[];
  /** Top schools sending FEWER this cycle (delta < 0), biggest drop first. */
  losers: ScoreboardMover[];
}

/** Fetch the leadership scoreboard. `cycleYear` pins a cycle; omit for latest. */
export function getScoreboard(cycleYear?: number): Promise<Scoreboard> {
  const q =
    cycleYear !== undefined && Number.isFinite(cycleYear)
      ? `?cycleYear=${cycleYear}`
      : '';
  return call<Scoreboard>(`${BASE}/scoreboard${q}`);
}
