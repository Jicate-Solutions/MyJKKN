// ============================================================================
// lib/services/id-cards/morning-page-service.ts
// Created: 2026-08-14 — the one page campus scanning is read from each morning.
//
// WHAT THIS IS FOR
// Card scanning at the mess doors and the hostel gate will produce tens of
// thousands of rows. Nobody reads tens of thousands of rows. This service
// answers the three questions a morning actually has:
//
//   1. What needs a human today?   → a short ranked exception list
//   2. Who is outside right now?   → open gate passes
//   3. How much of this can we believe? → the coverage / trust meter
//
// THE HONESTY RULE THIS FILE IS BUILT AROUND
// A meter reporting "100% verified" is worth less than one reporting "94%
// could be photo-verified, 6% could not", because the second one can be
// trusted. So:
//
//   • coveragePercent() returns NULL, never 0 and never 100, when there is
//     nothing to divide by. "Not measurable yet" and "perfect" must not
//     render the same.
//   • the cluster average is always published NEXT TO its worst college, and
//     never on its own — the cluster number hides that one college sits at
//     26% while another sits at 93%.
//   • the QR is not the identity control. A QR is a number, and a phone photo
//     of somebody else's card scans identically. The PHOTO on the operator's
//     screen is the control, so "verifiable" here means exactly one thing:
//     a human could have compared a face to a picture on file.
//   • an exception class with no recording substrate is declared as a gap
//     (UNRECORDED_EXCEPTION_CLASSES), never rendered as a reassuring zero.
//
// SHAPE. Everything above the "readers" divider is pure — no Supabase client,
// no React — so the ranking, the arithmetic and the honesty rules are unit
// tested in vitest's default `node` environment
// (__tests__/lib/id-cards/morning-page.test.ts).
//
// NOTE. Column identifiers (`learners_profiles.student_photo_url`, the
// `staff` table, `staff.profile_picture`) are existing database identifiers
// and are terminology-exempt; the copy this file produces is not.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { chunkIdsForIn } from '@/lib/utils/postgrest-in-chunks';

// ────────────────────────────────────────────────────────────────────────────
// PURE — types
// ────────────────────────────────────────────────────────────────────────────

export type MorningExceptionKind =
  | 'gate_pass_overdue'
  | 'pass_holder_has_left'
  | 'second_open_pass'
  | 'meal_scanned_for_someone_who_left'
  | 'scans_without_a_photo_to_check'
  | 'card_print_failed';

export type MorningException = {
  /** Stable within one render — used as the React key. */
  id: string;
  kind: MorningExceptionKind;
  /** One line naming who/what. */
  headline: string;
  /** One line saying what a human should do about it. */
  detail: string;
  /** ISO timestamp the thing happened, when there is one. */
  occurredAt: string | null;
  /** Higher = wants attention sooner. Set by weighExceptionKind(). */
  weight: number;
};

export type OpenGatePass = {
  id: string;
  passNumber: string;
  /** Display name, or a plain fallback — never a raw id in the UI. */
  personName: string;
  destination: string;
  outTime: string | null;
  expectedReturn: string;
  status: string;
};

export type CoverageRow = {
  institutionId: string;
  institutionName: string;
  learnersTotal: number;
  learnersWithPhoto: number;
  teamTotal: number;
  teamWithPhoto: number;
  /**
   * True when any of the four counts above could not be read.
   *
   * Load-bearing. Coercing a failed count to 0 produces exactly the lie this
   * file exists to prevent: a failed `withPhoto` read renders a college at 0%
   * (reads as a catastrophe), and a failed `total` read drops the college out
   * of the table entirely (reads as nothing at all). Both are read failures
   * wearing a number's clothes, so they are flagged and rendered as "could
   * not be read" instead.
   */
  readFailed: boolean;
};

/** A percentage that knows the difference between "zero" and "unknowable". */
export type Measurable = {
  withPhoto: number;
  total: number;
  /** null when total is 0 — there is no honest percentage for no people. */
  percent: number | null;
};

/**
 * Exception classes this page CANNOT show, because nothing records them.
 * Published on the page verbatim. A gap that is named is a gap somebody can
 * close; a gap rendered as "0" is one nobody knows about.
 */
export const UNRECORDED_EXCEPTION_CLASSES: readonly { title: string; why: string }[] = [
  {
    title: 'Cards that were rejected at the door',
    why:
      'When a card is not recognised, the scan screen says so and writes nothing. There is no table of refused scans yet, so none can be listed here.',
  },
  {
    title: 'Someone presenting a card twice for the same meal',
    why:
      'A repeat scan is refused by the database itself (one meal per learner per sitting), so the second attempt is never stored and cannot be counted.',
  },
] as const;

/** How many exception lines a morning page is allowed to be. */
export const EXCEPTION_LINE_CAP = 12;

/**
 * Anything under this many hours late is still a normal late return, not a
 * line on the Director's morning page.
 */
export const OVERDUE_GRACE_HOURS = 1;

/** Window the morning page looks back over. */
export const MORNING_WINDOW_HOURS = 24;

// ────────────────────────────────────────────────────────────────────────────
// PURE — ranking
// ────────────────────────────────────────────────────────────────────────────

/**
 * Base urgency per class. Ordered by what a human loses by not acting:
 * a person unaccounted for outranks a card that would not print.
 */
const BASE_WEIGHT: Record<MorningExceptionKind, number> = {
  gate_pass_overdue: 100,
  pass_holder_has_left: 90,
  meal_scanned_for_someone_who_left: 80,
  second_open_pass: 70,
  scans_without_a_photo_to_check: 40,
  card_print_failed: 30,
};

export function weighExceptionKind(kind: MorningExceptionKind): number {
  return BASE_WEIGHT[kind];
}

/** Whole hours between two instants; negative when `later` precedes `earlier`. */
export function hoursBetween(earlier: string | Date, later: string | Date): number {
  const a = earlier instanceof Date ? earlier : new Date(earlier);
  const b = later instanceof Date ? later : new Date(later);
  return (b.getTime() - a.getTime()) / 3_600_000;
}

/**
 * An overdue return gets more urgent the longer it runs, but the escalation
 * is capped so a single ancient unclosed pass cannot permanently own the top
 * of the page and push a fresh problem out of view.
 */
export function weighOverdue(hoursLate: number): number {
  const escalation = Math.min(Math.max(hoursLate, 0), 48) * 2;
  return BASE_WEIGHT.gate_pass_overdue + escalation;
}

/**
 * Rank and truncate. Returns what to show plus how many were held back —
 * the count is rendered, so the list is never quietly shortened.
 * Ties break on recency (newest first), then on id so renders are stable.
 */
export function rankExceptions(
  rows: readonly MorningException[],
  cap: number = EXCEPTION_LINE_CAP
): { shown: MorningException[]; hiddenCount: number } {
  const sorted = [...rows].sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    const at = a.occurredAt ? Date.parse(a.occurredAt) : 0;
    const bt = b.occurredAt ? Date.parse(b.occurredAt) : 0;
    if (bt !== at) return bt - at;
    return a.id.localeCompare(b.id);
  });
  const safeCap = Math.max(cap, 0);
  return { shown: sorted.slice(0, safeCap), hiddenCount: Math.max(sorted.length - safeCap, 0) };
}

// ────────────────────────────────────────────────────────────────────────────
// PURE — the trust meter
// ────────────────────────────────────────────────────────────────────────────

/**
 * A share that refuses to lie about an empty denominator.
 *
 * `percent` is null when nobody is being counted. That is deliberate: with
 * zero people, 0/0 renders as "0%" (looks like a catastrophe) or as "100%"
 * (looks like success) depending on which way the code rounds, and both are
 * claims the data cannot support.
 */
export function measure(withPhoto: number, total: number): Measurable {
  if (total <= 0) return { withPhoto: 0, total: 0, percent: null };
  return { withPhoto, total, percent: (withPhoto / total) * 100 };
}

/**
 * Learners and team members of one college, counted together. A college whose
 * counts could not be read measures as unknowable, never as zero.
 */
export function measureCollege(row: CoverageRow): Measurable {
  if (row.readFailed) return { withPhoto: 0, total: 0, percent: null };
  return measure(row.learnersWithPhoto + row.teamWithPhoto, row.learnersTotal + row.teamTotal);
}

/**
 * The cluster figure, over the colleges that could actually be read. Correct,
 * and on its own misleading — always publish it beside coverageSpread().
 */
export function measureCluster(rows: readonly CoverageRow[]): Measurable {
  const readable = rows.filter((r) => !r.readFailed);
  const withPhoto = readable.reduce((n, r) => n + r.learnersWithPhoto + r.teamWithPhoto, 0);
  const total = readable.reduce((n, r) => n + r.learnersTotal + r.teamTotal, 0);
  return measure(withPhoto, total);
}

/** Colleges whose counts failed to read. Named on the page, never hidden. */
export function unreadableColleges(rows: readonly CoverageRow[]): CoverageRow[] {
  return rows.filter((r) => r.readFailed);
}

/**
 * Rows worth a line. A college with nobody on its books carries no signal and
 * is dropped; a college that could not be READ is kept, because dropping it
 * would turn a read failure into an absence nobody notices.
 */
export function collegesWithPeople(rows: readonly CoverageRow[]): CoverageRow[] {
  return rows.filter((r) => r.readFailed || r.learnersTotal + r.teamTotal > 0);
}

/**
 * Worst first. The point of this section is that one college is nearly blind,
 * so the college that most needs photographs is the one at the top. Colleges
 * that could not be read go LAST — they are a reading problem, not a coverage
 * problem, and putting them on top would bury the real answer.
 */
export function sortCoverageWorstFirst(rows: readonly CoverageRow[]): CoverageRow[] {
  const kept = collegesWithPeople(rows);
  const readable = kept.filter((r) => !r.readFailed);
  const failed = kept.filter((r) => r.readFailed);
  readable.sort((a, b) => {
    const pa = measureCollege(a).percent ?? 0;
    const pb = measureCollege(b).percent ?? 0;
    if (pa !== pb) return pa - pb;
    return a.institutionName.localeCompare(b.institutionName);
  });
  failed.sort((a, b) => a.institutionName.localeCompare(b.institutionName));
  return [...readable, ...failed];
}

/**
 * The gap the cluster average conceals. Returned so the page can print it
 * beside the average instead of letting one number stand alone. Unreadable
 * colleges are excluded — an unknown is not a low score.
 */
export function coverageSpread(
  rows: readonly CoverageRow[]
): { worst: CoverageRow; best: CoverageRow; pointsApart: number } | null {
  const ordered = sortCoverageWorstFirst(rows).filter((r) => !r.readFailed);
  if (ordered.length < 2) return null;
  const worst = ordered[0];
  const best = ordered[ordered.length - 1];
  const pointsApart = (measureCollege(best).percent ?? 0) - (measureCollege(worst).percent ?? 0);
  return { worst, best, pointsApart };
}

// ────────────────────────────────────────────────────────────────────────────
// PURE — a read that never hangs
// ────────────────────────────────────────────────────────────────────────────

/** How long any one section may take before the page says so and gives up. */
export const READ_TIMEOUT_MS = 20_000;

/**
 * Turn a stalled or throwing read into a stated failure.
 *
 * Without this, a connection that neither answers nor errors leaves all three
 * sections on their skeletons and the Read-again button disabled forever — a
 * permanently-spinning page, which is the one outcome worse than bad news.
 * Resolves rather than rejects so no caller needs a try/catch to stay honest.
 */
export async function withReadTimeout<T>(
  work: Promise<ReadResult<T>>,
  what: string,
  timeoutMs: number = READ_TIMEOUT_MS
): Promise<ReadResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const seconds = Math.max(Math.round(timeoutMs / 1000), 1);
  const timeout = new Promise<ReadResult<T>>((resolve) => {
    timer = setTimeout(
      () => resolve({ ok: false, message: `${what} did not answer within ${seconds}s.` }),
      timeoutMs
    );
  });
  try {
    return await Promise.race([
      work.catch((err: unknown) => ({ ok: false as const, message: errText(err) })),
      timeout,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Of the scans actually taken in the window, how many showed the operator a
 * face to compare against? This — not the number of scans — is what the QR
 * can and cannot prove.
 */
export function measureVerifiableScans(
  scans: readonly { hadPhotoOnFile: boolean }[]
): Measurable {
  return measure(scans.filter((s) => s.hadPhotoOnFile).length, scans.length);
}

/** One decimal, or an em dash when there is no honest number to print. */
export function formatPercent(percent: number | null): string {
  return percent === null ? '—' : `${percent.toFixed(1)}%`;
}

/** "3 hours late" / "2 days late" — plain enough to read before coffee. */
export function formatLateness(hoursLate: number): string {
  const hours = Math.max(Math.floor(hoursLate), 0);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} late`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} late`;
}

// ────────────────────────────────────────────────────────────────────────────
// READERS — everything below talks to Supabase
// ────────────────────────────────────────────────────────────────────────────

/**
 * Gate-pass statuses that mean the person has not come back. `returned` and
 * `cancelled` are the only two that close a pass.
 */
const OPEN_PASS_STATUSES = ['issued', 'active', 'overdue'] as const;

/**
 * Read result that can say "the read failed" instead of returning an empty
 * list that looks exactly like "there is nothing to report" (CLAUDE.md #27).
 */
export type ReadResult<T> = { ok: true; data: T } | { ok: false; message: string };

type AnyClient = SupabaseClient;

function errText(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Unknown database error';
}

/** profiles.id → display name, for the ids handed in. Chunked per the gateway limit. */
async function namesForProfileIds(
  client: AnyClient,
  ids: readonly string[]
): Promise<Map<string, { fullName: string; learnerProfileId: string | null }>> {
  const out = new Map<string, { fullName: string; learnerProfileId: string | null }>();
  for (const chunk of chunkIdsForIn(ids)) {
    const { data } = await client.from('profiles').select('id, full_name, learner_id').in('id', chunk);
    for (const row of (data ?? []) as { id: string; full_name: string | null; learner_id: string | null }[]) {
      out.set(row.id, { fullName: row.full_name ?? 'Unnamed person', learnerProfileId: row.learner_id });
    }
  }
  return out;
}

/** learners_profiles.id → the two facts the morning page judges a scan on. */
async function learnerFactsFor(
  client: AnyClient,
  ids: readonly string[]
): Promise<Map<string, { lifecycleStatus: string | null; hasPhoto: boolean }>> {
  const out = new Map<string, { lifecycleStatus: string | null; hasPhoto: boolean }>();
  for (const chunk of chunkIdsForIn(ids)) {
    const { data } = await client
      .from('learners_profiles')
      .select('id, lifecycle_status, student_photo_url')
      .in('id', chunk);
    for (const row of (data ?? []) as {
      id: string;
      lifecycle_status: string | null;
      student_photo_url: string | null;
    }[]) {
      out.set(row.id, {
        lifecycleStatus: row.lifecycle_status,
        // An empty string is stored as often as NULL and means the same thing:
        // no picture. Treating '' as a photo is how a coverage meter lies.
        hasPhoto: Boolean(row.student_photo_url && row.student_photo_url.trim() !== ''),
      });
    }
  }
  return out;
}

// ── Section 2 — who is out now ──────────────────────────────────────────────

export async function readWhoIsOutNow(client: AnyClient): Promise<ReadResult<OpenGatePass[]>> {
  const { data, error } = await client
    .from('hostel_gate_passes')
    .select('id, pass_number, learner_id, destination, out_time, expected_return, status')
    .in('status', OPEN_PASS_STATUSES as unknown as string[])
    .is('actual_return', null)
    .order('expected_return', { ascending: true })
    .limit(500);

  if (error) return { ok: false, message: errText(error) };

  const rows = (data ?? []) as {
    id: string;
    pass_number: string;
    learner_id: string;
    destination: string;
    out_time: string | null;
    expected_return: string;
    status: string;
  }[];

  const names = await namesForProfileIds(client, [...new Set(rows.map((r) => r.learner_id))]);

  return {
    ok: true,
    data: rows.map((r) => ({
      id: r.id,
      passNumber: r.pass_number,
      personName: names.get(r.learner_id)?.fullName ?? 'Unnamed person',
      destination: r.destination,
      outTime: r.out_time,
      expectedReturn: r.expected_return,
      status: r.status,
    })),
  };
}

// ── Section 1 — exceptions ──────────────────────────────────────────────────

export type ExceptionReadout = {
  exceptions: MorningException[];
  /** True when the meal read hit its row cap, so the counts below are a floor. */
  mealsTruncated: boolean;
  /** Every scan the window contained, for the trust meter's numerator. */
  scanVerifiability: Measurable;
  /**
   * Sources that could not be read at all. Named on the page, because "no
   * failed print jobs" and "the failed-print source was unreadable" are two
   * different facts and only one of them is good news.
   */
  unreadableSources: string[];
};

/**
 * Rows read per source. High enough to cover a real morning, low enough that
 * a browser tab never pulls a whole term of scanning into memory.
 */
const MEAL_ROW_CAP = 2000;

export async function readMorningExceptions(
  client: AnyClient,
  now: Date = new Date()
): Promise<ReadResult<ExceptionReadout>> {
  const windowStart = new Date(now.getTime() - MORNING_WINDOW_HOURS * 3_600_000).toISOString();
  const exceptions: MorningException[] = [];

  // 1. Open gate passes — overdue returns, repeat passes, holders who left.
  const passes = await client
    .from('hostel_gate_passes')
    .select('id, pass_number, learner_id, expected_return, out_time, status')
    .in('status', OPEN_PASS_STATUSES as unknown as string[])
    .is('actual_return', null)
    .limit(500);

  if (passes.error) return { ok: false, message: errText(passes.error) };

  const passRows = (passes.data ?? []) as {
    id: string;
    pass_number: string;
    learner_id: string;
    expected_return: string;
    out_time: string | null;
    status: string;
  }[];

  // 2. Meals scanned inside the window.
  const meals = await client
    .from('mess_meal_records')
    .select('id, learner_id, meal_type, scan_time')
    .gte('scan_time', windowStart)
    .order('scan_time', { ascending: false })
    .limit(MEAL_ROW_CAP);

  if (meals.error) return { ok: false, message: errText(meals.error) };

  const mealRows = (meals.data ?? []) as {
    id: string;
    learner_id: string;
    meal_type: string;
    scan_time: string | null;
  }[];

  // 3. Everyone named by either source, resolved once.
  const profileIds = [...new Set([...passRows.map((p) => p.learner_id), ...mealRows.map((m) => m.learner_id)])];
  const names = await namesForProfileIds(client, profileIds);
  const learnerProfileIds = [...new Set([...names.values()].map((v) => v.learnerProfileId).filter((v): v is string => Boolean(v)))];
  const facts = await learnerFactsFor(client, learnerProfileIds);

  const factFor = (profileId: string) => {
    const learnerProfileId = names.get(profileId)?.learnerProfileId ?? null;
    return learnerProfileId ? facts.get(learnerProfileId) ?? null : null;
  };
  const nameFor = (profileId: string) => names.get(profileId)?.fullName ?? 'Unnamed person';

  // ── Gate-pass exceptions ─────────────────────────────────────────────────
  const openPassesPerPerson = new Map<string, number>();
  for (const p of passRows) {
    openPassesPerPerson.set(p.learner_id, (openPassesPerPerson.get(p.learner_id) ?? 0) + 1);

    const hoursLate = hoursBetween(p.expected_return, now);
    if (hoursLate > OVERDUE_GRACE_HOURS) {
      exceptions.push({
        id: `overdue:${p.id}`,
        kind: 'gate_pass_overdue',
        headline: `${nameFor(p.learner_id)} is ${formatLateness(hoursLate)} back`,
        detail: `Pass ${p.pass_number} is still open. Call the learner, then close or extend the pass.`,
        occurredAt: p.expected_return,
        weight: weighOverdue(hoursLate),
      });
    }

    const fact = factFor(p.learner_id);
    if (fact && fact.lifecycleStatus && fact.lifecycleStatus !== 'active') {
      exceptions.push({
        id: `left-with-pass:${p.id}`,
        kind: 'pass_holder_has_left',
        headline: `${nameFor(p.learner_id)} holds an open pass but the record says "${fact.lifecycleStatus}"`,
        detail: 'Either the record is stale or the pass belongs to somebody who should not have one. Check before the next gate shift.',
        occurredAt: p.out_time ?? p.expected_return,
        weight: weighExceptionKind('pass_holder_has_left'),
      });
    }
  }

  for (const [profileId, count] of openPassesPerPerson) {
    if (count > 1) {
      exceptions.push({
        id: `double-pass:${profileId}`,
        kind: 'second_open_pass',
        headline: `${nameFor(profileId)} has ${count} passes open at once`,
        detail: 'One person can only be out once. Close whichever pass was never returned.',
        occurredAt: null,
        weight: weighExceptionKind('second_open_pass'),
      });
    }
  }

  // ── Meal-scan exceptions ─────────────────────────────────────────────────
  const scanVerifiability = measureVerifiableScans(
    mealRows.map((m) => ({ hadPhotoOnFile: factFor(m.learner_id)?.hasPhoto ?? false }))
  );

  for (const m of mealRows) {
    const fact = factFor(m.learner_id);
    if (fact && fact.lifecycleStatus && fact.lifecycleStatus !== 'active') {
      exceptions.push({
        id: `meal-after-leaving:${m.id}`,
        kind: 'meal_scanned_for_someone_who_left',
        headline: `A ${m.meal_type} was taken on ${nameFor(m.learner_id)}'s card — that record reads "${fact.lifecycleStatus}"`,
        detail: 'A card that still works for somebody who has left is the card most likely to be passed around. Retire it.',
        occurredAt: m.scan_time,
        weight: weighExceptionKind('meal_scanned_for_someone_who_left'),
      });
    }
  }

  // Deliberately ONE aggregated line, not one per scan: this is the size of
  // the trust gap, and a dozen readable lines beat a thousand true ones.
  const unverifiable = scanVerifiability.total - scanVerifiability.withPhoto;
  if (unverifiable > 0) {
    exceptions.push({
      id: 'unverifiable-scans',
      kind: 'scans_without_a_photo_to_check',
      headline: `${unverifiable} of ${scanVerifiability.total} scans had no photo for the operator to check`,
      detail: 'The card was accepted on its number alone. Nothing proves the person holding it was the person on it.',
      occurredAt: null,
      weight: weighExceptionKind('scans_without_a_photo_to_check'),
    });
  }

  // ── Cards that would not print ───────────────────────────────────────────
  // id_card_print_jobs is newer than the generated Database types, so it is
  // read through the untyped client view (the pattern this module already
  // uses for id_card_agent_status).
  const jobs = await (client as AnyClient)
    .from('id_card_print_jobs')
    .select('id, status, enqueued_at, result')
    .eq('status', 'failed')
    .gte('enqueued_at', windowStart)
    .order('enqueued_at', { ascending: false })
    .limit(20);

  const unreadableSources: string[] = [];
  if (jobs.error) {
    // Skipping the block silently would render "no cards failed to print" for
    // a source nobody could read — the exact ambiguity this page exists to
    // remove. Say which source went dark instead.
    unreadableSources.push(`Card print jobs (${errText(jobs.error)})`);
  } else {
    for (const j of (jobs.data ?? []) as {
      id: string;
      enqueued_at: string;
      result: { error_message?: string | null } | null;
    }[]) {
      exceptions.push({
        id: `print-failed:${j.id}`,
        kind: 'card_print_failed',
        headline: 'A card did not print',
        detail: j.result?.error_message
          ? `Printer reported: ${j.result.error_message}`
          : 'No reason was reported. Re-queue it from the Print Queue page.',
        occurredAt: j.enqueued_at,
        weight: weighExceptionKind('card_print_failed'),
      });
    }
  }

  return {
    ok: true,
    data: {
      exceptions,
      mealsTruncated: mealRows.length >= MEAL_ROW_CAP,
      scanVerifiability,
      unreadableSources,
    },
  };
}

// ── Section 3 — coverage ────────────────────────────────────────────────────

/**
 * Only learners who are actually on the books get counted. Somebody who has
 * graduated will not be presenting a card at the mess door, and padding the
 * denominator with them would make every college look worse than it is —
 * dishonest in the opposite direction, but still dishonest.
 */
const COUNTED_LIFECYCLE_STATUS = 'active';

/**
 * Counted with `head: true`, so each request carries a number and no rows.
 * The alternative — pulling every learner row into the tab and counting in
 * JavaScript — is ~5,700 rows of payload for four integers per college.
 *
 * Returns NULL on a failed read, never 0. A count that could not be read is
 * not a count of zero, and the difference is the whole point of this page.
 */
async function countLearners(
  client: AnyClient,
  institutionId: string,
  withPhotoOnly: boolean
): Promise<number | null> {
  let q = client
    .from('learners_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('institution_id', institutionId)
    .eq('lifecycle_status', COUNTED_LIFECYCLE_STATUS);
  // An empty string is stored as often as NULL and means the same thing.
  if (withPhotoOnly) q = q.not('student_photo_url', 'is', null).neq('student_photo_url', '');
  const { count, error } = await q;
  return error ? null : count ?? 0;
}

async function countTeamMembers(
  client: AnyClient,
  institutionId: string,
  withPhotoOnly: boolean
): Promise<number | null> {
  let q = client
    .from('staff')
    .select('id', { count: 'exact', head: true })
    .eq('institution_id', institutionId);
  if (withPhotoOnly) q = q.not('profile_picture', 'is', null).neq('profile_picture', '');
  const { count, error } = await q;
  return error ? null : count ?? 0;
}

export async function readPhotoCoverage(client: AnyClient): Promise<ReadResult<CoverageRow[]>> {
  const { data, error } = await client.from('institutions').select('id, name').order('name');
  if (error) return { ok: false, message: errText(error) };

  const institutions = (data ?? []) as { id: string; name: string }[];

  const rows = await Promise.all(
    institutions.map(async (inst): Promise<CoverageRow> => {
      const counts = await Promise.all([
        countLearners(client, inst.id, false),
        countLearners(client, inst.id, true),
        countTeamMembers(client, inst.id, false),
        countTeamMembers(client, inst.id, true),
      ]);
      const [learnersTotal, learnersWithPhoto, teamTotal, teamWithPhoto] = counts;
      return {
        institutionId: inst.id,
        institutionName: inst.name,
        learnersTotal: learnersTotal ?? 0,
        learnersWithPhoto: learnersWithPhoto ?? 0,
        teamTotal: teamTotal ?? 0,
        teamWithPhoto: teamWithPhoto ?? 0,
        readFailed: counts.some((c) => c === null),
      };
    })
  );

  return { ok: true, data: rows };
}
