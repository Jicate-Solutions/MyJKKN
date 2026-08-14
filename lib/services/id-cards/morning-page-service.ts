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

/**
 * "3 hours late" / "2 days late" — plain enough to read before coffee.
 *
 * Under an hour is spelled out rather than floored: a red badge reading
 * "0 hours late" is self-contradicting on a page that trades on precision.
 */
export function formatLateness(hoursLate: number): string {
  const hours = Math.max(Math.floor(hoursLate), 0);
  if (hours < 1) return 'under an hour late';
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
 * Open gate passes read in one go. Both readers use the same cap so "who is
 * out now" and the overdue exceptions can never disagree about who is out.
 */
const OPEN_PASS_ROW_CAP = 500;

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

/**
 * A lookup that admits when it failed.
 *
 * An empty Map and a Map that could not be built look identical to every
 * caller, and the difference is not cosmetic here: an unreadable
 * learners_profiles turns every scan into "no photo on file" and fires a large
 * false alarm, while quietly dropping every lifecycle exception. Same class of
 * lie as a coerced count, one level down — so the error travels with the data.
 */
type Lookup<T> = { map: Map<string, T>; error: string | null };

/** True only for a real, non-blank image reference. '' means no picture. */
function isRealPhoto(value: string | null | undefined): boolean {
  return Boolean(value && value.trim() !== '');
}

/** profiles.id → display name, for the ids handed in. Chunked per the gateway limit. */
async function namesForProfileIds(
  client: AnyClient,
  ids: readonly string[]
): Promise<Lookup<{ fullName: string; learnerProfileId: string | null; email: string | null }>> {
  const map = new Map<string, { fullName: string; learnerProfileId: string | null; email: string | null }>();
  for (const chunk of chunkIdsForIn(ids)) {
    const { data, error } = await client
      .from('profiles')
      .select('id, full_name, learner_id, email')
      .in('id', chunk);
    if (error) return { map, error: errText(error) };
    for (const row of (data ?? []) as {
      id: string;
      full_name: string | null;
      learner_id: string | null;
      email: string | null;
    }[]) {
      map.set(row.id, {
        fullName: row.full_name ?? 'Unnamed person',
        learnerProfileId: row.learner_id,
        email: row.email,
      });
    }
  }
  return { map, error: null };
}

/** learners_profiles.id → the two facts the morning page judges a scan on. */
async function learnerFactsFor(
  client: AnyClient,
  ids: readonly string[]
): Promise<Lookup<{ lifecycleStatus: string | null; hasPhoto: boolean }>> {
  const map = new Map<string, { lifecycleStatus: string | null; hasPhoto: boolean }>();
  for (const chunk of chunkIdsForIn(ids)) {
    const { data, error } = await client
      .from('learners_profiles')
      .select('id, lifecycle_status, student_photo_url')
      .in('id', chunk);
    if (error) return { map, error: errText(error) };
    for (const row of (data ?? []) as {
      id: string;
      lifecycle_status: string | null;
      student_photo_url: string | null;
    }[]) {
      map.set(row.id, {
        lifecycleStatus: row.lifecycle_status,
        hasPhoto: isRealPhoto(row.student_photo_url),
      });
    }
  }
  return { map, error: null };
}

/**
 * Email → does this team member have a picture on file?
 *
 * A team member's card resolves to a `profiles` row with `learner_id = null`,
 * so the learner lookup above knows nothing about them. Without this, every
 * meal a team member eats counts as "nobody could check a face" and inflates
 * the trust gap — dishonest in the opposite direction, but still dishonest.
 *
 * The bridge is the canonical one used by the card renderer: `staff` has no
 * user_id column, so it is matched on `profiles.email == staff.institution_email`
 * with `staff.email` as the fallback (lib/id-cards/render-data.ts).
 */
async function teamPhotosForEmails(
  client: AnyClient,
  emails: readonly string[]
): Promise<Lookup<boolean>> {
  const map = new Map<string, boolean>();
  if (emails.length === 0) return { map, error: null };
  for (const column of ['institution_email', 'email'] as const) {
    for (const chunk of chunkIdsForIn(emails)) {
      const { data, error } = await client
        .from('staff')
        .select(`${column}, profile_picture`)
        .in(column, chunk);
      if (error) return { map, error: errText(error) };
      for (const row of (data ?? []) as Record<string, string | null>[]) {
        const key = (row[column] ?? '').trim().toLowerCase();
        // A team member with two rows keeps the one that HAS a picture — an
        // absent row must never overwrite a present one.
        if (key && !map.get(key)) map.set(key, isRealPhoto(row.profile_picture));
      }
    }
  }
  return { map, error: null };
}

// ── Section 2 — who is out now ──────────────────────────────────────────────

export type WhoIsOutNow = {
  passes: OpenGatePass[];
  /**
   * True when the read hit its cap. The exceptions card carries the same flag,
   * but somebody reading only this table would otherwise see a list that had
   * been shortened without saying so — the rule this page is built on.
   */
  truncated: boolean;
};

export async function readWhoIsOutNow(client: AnyClient): Promise<ReadResult<WhoIsOutNow>> {
  const { data, error } = await client
    .from('hostel_gate_passes')
    .select('id, pass_number, learner_id, destination, out_time, expected_return, status')
    .in('status', OPEN_PASS_STATUSES as unknown as string[])
    .is('actual_return', null)
    .order('expected_return', { ascending: true })
    .limit(OPEN_PASS_ROW_CAP);

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
  // Without names every line reads "Unnamed person", which is a list nobody can
  // act on. Better to say the read failed than to publish an anonymous roster.
  if (names.error) return { ok: false, message: names.error };

  return {
    ok: true,
    data: {
      passes: rows.map((r) => ({
        id: r.id,
        passNumber: r.pass_number,
        personName: names.map.get(r.learner_id)?.fullName ?? 'Unnamed person',
        destination: r.destination,
        outTime: r.out_time,
        expectedReturn: r.expected_return,
        status: r.status,
      })),
      truncated: rows.length >= OPEN_PASS_ROW_CAP,
    },
  };
}

// ── Section 1 — exceptions ──────────────────────────────────────────────────

export type ExceptionReadout = {
  exceptions: MorningException[];
  /** True when the meal read hit its row cap, so the counts below are a floor. */
  mealsTruncated: boolean;
  /**
   * True when the open-pass read hit its row cap. Same reason as above and
   * more urgent: a page that promises never to shorten itself silently cannot
   * quietly stop at 500 people who are still outside.
   */
  passesTruncated: boolean;
  /**
   * Every scan the window contained, for the trust meter's numerator — or
   * null when the identity sources could not be read, which is a different
   * fact from "no scan could be verified" and must not render as 0%.
   */
  scanVerifiability: Measurable | null;
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
  // ORDERED, and the order is load-bearing: an unordered `.limit()` lets
  // Postgres return an arbitrary 500, so on a busy weekend the MOST overdue
  // return — the row this page exists to surface — could be the one dropped.
  // Oldest due-back first means the cap bites on the least urgent rows.
  const passes = await client
    .from('hostel_gate_passes')
    .select('id, pass_number, learner_id, expected_return, out_time, status')
    .in('status', OPEN_PASS_STATUSES as unknown as string[])
    .is('actual_return', null)
    .order('expected_return', { ascending: true })
    .limit(OPEN_PASS_ROW_CAP);

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
  const unreadableSources: string[] = [];
  const profileIds = [...new Set([...passRows.map((p) => p.learner_id), ...mealRows.map((m) => m.learner_id)])];
  const names = await namesForProfileIds(client, profileIds);
  if (names.error) return { ok: false, message: names.error };

  const learnerProfileIds = [
    ...new Set(
      [...names.map.values()].map((v) => v.learnerProfileId).filter((v): v is string => Boolean(v))
    ),
  ];
  const facts = await learnerFactsFor(client, learnerProfileIds);

  // Team members carry no learner link, so their picture lives on `staff`.
  const teamEmails = [
    ...new Set(
      [...names.map.values()]
        .filter((v) => !v.learnerProfileId && v.email)
        .map((v) => (v.email as string).trim().toLowerCase())
        .filter((e) => e !== '')
    ),
  ];
  const teamPhotos = await teamPhotosForEmails(client, teamEmails);

  // A failed lookup is recorded, never absorbed. Without learner records every
  // scan would read as "no photo on file" and fire a large false alarm while
  // silently dropping every lifecycle exception — the same lie as a coerced
  // count, one level down.
  if (facts.error) unreadableSources.push(`Learner records (${facts.error})`);
  if (teamPhotos.error) unreadableSources.push(`Team-member records (${teamPhotos.error})`);
  const identityReadable = !facts.error && !teamPhotos.error;

  const factFor = (profileId: string) => {
    const learnerProfileId = names.map.get(profileId)?.learnerProfileId ?? null;
    return learnerProfileId ? facts.map.get(learnerProfileId) ?? null : null;
  };
  const nameFor = (profileId: string) => names.map.get(profileId)?.fullName ?? 'Unnamed person';
  /** Could an operator have compared a face to a picture for this person? */
  const hadPhotoOnFile = (profileId: string): boolean => {
    const entry = names.map.get(profileId);
    if (!entry) return false;
    if (entry.learnerProfileId) return facts.map.get(entry.learnerProfileId)?.hasPhoto ?? false;
    const email = (entry.email ?? '').trim().toLowerCase();
    return email ? teamPhotos.map.get(email) ?? false : false;
  };

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
  // null, not a number, when the identity sources could not be read: with an
  // empty lookup EVERY scan measures as unverifiable, which would publish a
  // read failure as a 0% trust score.
  const scanVerifiability = identityReadable
    ? measureVerifiableScans(mealRows.map((m) => ({ hadPhotoOnFile: hadPhotoOnFile(m.learner_id) })))
    : null;

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
  const unverifiable = scanVerifiability ? scanVerifiability.total - scanVerifiability.withPhoto : 0;
  if (scanVerifiability && unverifiable > 0) {
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
      passesTruncated: passRows.length >= OPEN_PASS_ROW_CAP,
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
 * Colleges counted at a time. Each one costs four count requests, so an
 * unbounded fan-out is 4 x every college fired at once — enough, on a full
 * cluster, for the browser's own connection limit to serialise them past
 * READ_TIMEOUT_MS and collapse the whole section into "did not answer within
 * 20s". Three at a time keeps twelve requests in flight, which is well inside
 * every browser's per-host budget and still finishes in one round of latency.
 */
const COVERAGE_CONCURRENCY = 3;

/**
 * `Promise.all` with a ceiling on how many run at once. Order of results
 * matches order of input.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const size = Math.max(1, Math.min(limit, items.length));
  const runners = Array.from({ length: size }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await work(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

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

  const rows = await mapWithConcurrency(
    institutions,
    COVERAGE_CONCURRENCY,
    async (inst): Promise<CoverageRow> => {
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
    }
  );

  return { ok: true, data: rows };
}
