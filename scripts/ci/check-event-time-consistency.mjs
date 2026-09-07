#!/usr/bin/env node
/**
 * scripts/ci/check-event-time-consistency.mjs
 *
 * Fails when an event row stores the SAME moment twice and the two copies
 * disagree.
 *
 * THE FAILURE CLASS
 *   public.events carries an event's time in two independent shapes:
 *
 *     event_date (date) + start_time / end_time (time)   the plain wall clock.
 *                                                        This is what the event
 *                                                        page renders to people.
 *     start_date / end_date (timestamptz)                what scheduling logic
 *                                                        reads and compares to
 *                                                        now().
 *
 *   Nothing keeps them equal. app/(routes)/events/_components/edit-general-event-dialog.tsx
 *   posts all five as separate form fields — event_date, start_date, end_date,
 *   start_time, end_time — and validates only that end_date is not before
 *   start_date. Edit the clock and forget the timestamp (or the reverse) and the
 *   row now says two different things, with no error and no warning.
 *
 *   It is INVISIBLE FROM INSIDE THE DATA. Each shape is perfectly self-consistent:
 *   start_time is before end_time, start_date is before end_date. Every constraint
 *   holds. Only a human comparing the rendered page against the scheduler's
 *   behaviour can see the two disagree — which means nobody sees it until
 *   something fires at the wrong moment.
 *
 * THE INCIDENT, 2026-09-07
 *   'SEMINAR - LOGISTICS SUPPLY CHAIN MANAGEMENT', 9 Sep, a live event.
 *     end_time  says 14:00 IST   ← what the page shows attendees
 *     end_date  says 13:00 IST   ← what the scheduler believes
 *   Found by reading the page. Every data-layer check was green, because from
 *   inside the data both columns are perfectly valid.
 *
 *   WHAT DID NOT HAPPEN, stated plainly so nobody re-derives a scarier story
 *   from this comment. The seminar's feedback form
 *   (event_feedback_forms a708a6a8-1d20-44e0-a8d7-274158f987d7, the only row in
 *   that table) opens 9 Sep 14:00 IST and closes 16 Sep 14:00 IST. That is the
 *   CLOCK value. Whoever set it picked the column the page shows, so the form
 *   did NOT open early and no attendee was asked to rate a running session.
 *   The window is set by hand — starts_at / ends_at are plain columns and no
 *   code derives them from end_date — so this was a human choosing between two
 *   disagreeing columns and, this once, choosing the right one.
 *
 *   THAT IS THE POINT, NOT A REASON TO RELAX. The row still says two different
 *   things, nothing decided which is authoritative, and the next reader — human
 *   or query — has an even chance of taking the other one. Four code paths
 *   already take the other one:
 *     fn_person_availability (20260629120000_person_availability_brain.sql)
 *       treats ev.start_date/ev.end_date as a person's busy window for anyone
 *       holding an event human role, so a wrong end_date books them free or busy
 *       at the wrong hour.
 *     The calendar and .ics feeds (20260623120000, 20260623130000, 20260623160000)
 *       take COALESCE(e.end_date, e.start_date, e.event_date) — end_date FIRST,
 *       so it, not the clock the page renders, is what lands in people's calendars.
 *     fn_induction_my_enrollments (20260730110000) reads e.end_date::date.
 *     The NAAC evidence emitter (20260726110000) derives an event's academic-year
 *       label from COALESCE(e.end_date, e.start_date).
 *   Every one of those reads the copy nobody is looking at, and none of them can
 *   tell that the copy people ARE looking at says something else.
 *
 * WHAT THIS GUARD COMPARES (and, more importantly, what it does NOT)
 *   Four comparisons, each gated ONLY by the fields it actually reads:
 *     start_time_of_day   start_time  vs (start_date AT TIME ZONE IST)::time
 *     end_time_of_day     end_time    vs (end_date   AT TIME ZONE IST)::time
 *     start_calendar_day  event_date  vs (start_date AT TIME ZONE IST)::date
 *     end_calendar_day    event_date  vs (end_date   AT TIME ZONE IST)::date,
 *                                        EARLIER direction only — see below
 *
 *   The four predicates are independent on purpose, and the first version of
 *   this gate got it wrong: a single shared predicate required event_date AND
 *   the clock AND both timestamptz parts before ANY start-side check ran, so the
 *   calendar-day comparison — which reads no clock field — was vetoed whenever
 *   start_time happened to be NULL. Ten production rows have exactly that shape
 *   and three of them disagree about the start day, including a LIVE event six
 *   days out. The gate called them "nothing to compare" and exited 0. A
 *   precondition wider than the check it guards does not harden the check, it
 *   silences it.
 *
 *   THE END CALENDAR DAY IS COMPARED IN ONE DIRECTION ONLY. A multi-day event
 *   legitimately ends on a LATER date than event_date, so a later end date is
 *   never flagged. An end date EARLIER than event_date is a different animal: no
 *   multi-day reading explains an event that ends before the day it starts, so
 *   that direction is always a defect. One production row has it today
 *   (Government job fair, 22 Jul with an end day of 21 Jul) and its end_time is
 *   NULL, which is why the original end-side check never saw it either.
 *
 *   A LATER end date is never flagged because a multi-day event legitimately has
 *   one while its clock times are exactly right — seven rows in production do,
 *   including CERTIFICATE COURSES (1 Aug -> 15 Sep, 09:00-15:30 in both shapes)
 *   and the Business Analytics workshop (10 -> 11 Aug, 09:45-15:45 in both).
 *   Flagging those would make the gate cry wolf on every multi-day event, and a
 *   gate that cries wolf gets switched off. Only the end TIME OF DAY has to
 *   match, which is the check that catches the seminar (14:00 vs 13:00 on the
 *   same day) while leaving every multi-day event alone.
 *
 *   The START day gets no such freedom: an event that starts on a day other than
 *   its own event_date is the same defect, not a longer event.
 *
 *   ACCEPTED BLIND SPOT: a single-day event whose end_date lands on a LATER day
 *   at the right time of day reads, from here, exactly like a multi-day event.
 *   There is no column saying "this event is multi-day", so the two are genuinely
 *   indistinguishable. Missing that case is the price of never false-positiving
 *   on real multi-day events, and that trade is deliberate. It costs nothing in
 *   the earlier direction, which is why that half is now checked.
 *
 *   Asia/Kolkata is fixed at +05:30 and observes no DST, so the conversion is
 *   unambiguous. It is done in Postgres, not in JS, so the runner's own timezone
 *   cannot change the answer.
 *
 * AUDITED AGAINST PRODUCTION 2026-09-07 — all 51 events:
 *    19   comparable (at least one field pair populated on both sides)
 *    32   skipped — no field pair populated on both sides. Nothing to compare is
 *         not a pass and not a failure; it is counted and printed, never silently
 *         dropped. NOTE: the first version of this gate reported 9 comparable and
 *         42 skipped, and asserted the 42 had "nothing to compare". That was
 *         wrong — 10 of them carried event_date and a start timestamptz, three of
 *         those disagreed, and the gate could not see any of it. The claim, not
 *         just the count, is what this audit corrects.
 *     7   recognised as multi-day (later end DATE) — NOT flagged
 *     7   divergences across 5 events:
 *           SEMINAR - LOGISTICS SUPPLY CHAIN MANAGEMENT  end 14:00 vs 13:00       (live)  FAILS
 *           JKKN School of Influencer      start day 4 Aug vs 29 Jul, 6 days apart (live)  FAILS
 *           Renewable Energy Day           09:00-13:00 vs 18:30-22:30            (draft) ledger
 *           Government job fair            start AND end day both a day early     (draft) ledger
 *           tsese                          start day 5 Aug vs 4 Aug               (draft) ledger
 *         The two live ones fail the sweep by design; see the baseline note below.
 *
 * THE BASELINE IS A DEBT LEDGER, NOT A PARDON — AND IT NEVER COVERS A LIVE EVENT
 *   (scripts/ci/event-time-divergence-baseline.json — same precedent as
 *   ungrantable-permissions-baseline.json.)
 *
 *   The first version of this gate justified the ledger by saying that failing on
 *   pre-existing divergence "would fail the first run on untouched main and block
 *   every open PR". THAT WAS FALSE, and the workflow next to it proves it: the
 *   sweep job carries `if: github.event_name != 'pull_request'`, so it never runs
 *   on a PR and a red sweep cannot block one. Only the offline self-test runs on
 *   PRs. The argument protected nothing — and it bought its imagined safety by
 *   downgrading the 9 Sep seminar, whose end time is wrong in production RIGHT
 *   NOW, to a yellow warning under a green exit code.
 *
 *   The ledger still earns its place, for a different reason: a sweep that is
 *   permanently red because of debt nobody is acting on gets ignored just as
 *   surely as one that is switched off, and then a genuinely new divergence
 *   arrives into a channel no one reads. Separating "known, already logged" from
 *   "new since yesterday" keeps the red signal meaningful.
 *
 *   So the line is drawn at LIVE, not at OLD:
 *     draft / archived / cancelled / completed   may be enrolled. Nobody is being
 *                                                shown a wrong time; it is real
 *                                                debt and it warns on every run.
 *     live                                       NEVER enrolled, never pardoned,
 *                                                always fails — however long it
 *                                                has been wrong. A live event's
 *                                                wrong time is being acted on
 *                                                today, and a red scheduled run
 *                                                is exactly the alarm wanted.
 *   An unrecognised status counts as live, so a new status value makes this gate
 *   louder rather than quietly widening the pardon. --update-baseline enforces
 *   the same rule when it writes, so nobody can silence a live event by
 *   regenerating the ledger.
 *
 *   Consequence, deliberately: the scheduled sweep is RED today, on the seminar
 *   and on JKKN School of Influencer. That is the gate working, not the gate
 *   misconfigured. It goes green when someone fixes those two rows in the Events
 *   UI. No pull request is affected either way.
 *
 *   An entry that stops diverging is reported as stale so the ledger shrinks
 *   instead of rotting. The ledger is keyed by event id + which field diverges,
 *   not by the values: a baselined row that starts diverging in a SECOND field is
 *   a new finding and fails. The debt is "this row's end time is known-wrong",
 *   not "this row is exempt".
 *
 * IT NEVER WRITES. One read-only SELECT over public.events. No DDL, no update,
 * no migration. A false positive costs a red scheduled run, never a changed row.
 *
 * Exit codes:  0 clean (or baselined only) · 2 new divergence · 1 operational error.
 *
 * Usage:
 *   node scripts/ci/check-event-time-consistency.mjs
 *   … --self-test          run the built-in fixtures offline; no credentials, no network
 *   … --fixture <file>     read rows from a JSON file instead of the database
 *   … --json               machine-readable output
 *   … --report-only        print findings, always exit 0
 *   … --update-baseline    rewrite the debt ledger from what production says now
 *   … --baseline <file> / --no-baseline
 *
 * Credentials (either route, same as the sibling live gates):
 *   SUPABASE_DB_URL                                direct Postgres (session pooler)
 *   SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF   Supabase Management API
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m',
      DIM = '\x1b[2m', BOLD = '\x1b[1m', RESET = '\x1b[0m';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flagValue = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : null;
};

const JSON_OUT = argv.includes('--json');
const REPORT_ONLY = argv.includes('--report-only');
const SELF_TEST = argv.includes('--self-test');
const UPDATE_BASELINE = argv.includes('--update-baseline');
const NO_BASELINE = argv.includes('--no-baseline');
const FIXTURE = flagValue('--fixture');
const BASELINE_PATH = resolve(
  process.cwd(),
  flagValue('--baseline') ?? resolve(HERE, 'event-time-divergence-baseline.json'),
);

const TZ = 'Asia/Kolkata';

/* ───────────────────────── the query ────────────────────────────────────────
 * Every timezone conversion happens here, in Postgres. Doing it in JS would
 * make the answer depend on the runner's TZ env var, and a guard whose verdict
 * changes with the machine it runs on is not a guard.
 *
 * substring(… from 1 for 8) truncates to whole seconds. `time` values in this
 * table come from a minute-resolution picker; a few timestamptz values carry
 * milliseconds (Fresher Induction rows sit at …:21.371). Comparing those at
 * sub-second resolution would report a divergence nobody entered and nobody can
 * fix from the UI.
 */
const EVENTS_SQL = `
SELECT
  id::text                                                        AS id,
  name,
  COALESCE(status, '')                                            AS status,
  event_date::text                                                AS event_date,
  substring(start_time::text from 1 for 8)                        AS clock_start,
  substring(end_time::text   from 1 for 8)                        AS clock_end,
  (start_date AT TIME ZONE '${TZ}')::date::text                   AS tz_start_date,
  substring((start_date AT TIME ZONE '${TZ}')::time::text from 1 for 8) AS tz_start_clock,
  (end_date   AT TIME ZONE '${TZ}')::date::text                   AS tz_end_date,
  substring((end_date   AT TIME ZONE '${TZ}')::time::text from 1 for 8) AS tz_end_clock
FROM public.events
ORDER BY event_date NULLS LAST, name
`.trim();

async function fetchEvents() {
  if (FIXTURE) {
    const parsed = JSON.parse(readFileSync(resolve(process.cwd(), FIXTURE), 'utf8'));
    return Array.isArray(parsed) ? parsed : parsed.rows ?? [];
  }

  const DB_URL = process.env.SUPABASE_DB_URL;
  const MGMT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
  const MGMT_REF = process.env.SUPABASE_PROJECT_REF;

  if (DB_URL) {
    const pg = (await import('pg')).default;
    const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
      const res = await client.query(EVENTS_SQL);
      return res.rows;
    } finally {
      await client.end();
    }
  }

  const res = await fetch(`https://api.supabase.com/v1/projects/${MGMT_REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MGMT_TOKEN}`,
      'Content-Type': 'application/json',
      // Required — the endpoint refuses a request without a browser-ish UA.
      'User-Agent': 'Mozilla/5.0 (Macintosh)',
    },
    body: JSON.stringify({ query: EVENTS_SQL }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(body)) {
    // A failed request and an empty table must never look the same to a gate.
    throw new Error(
      `Management API query failed (HTTP ${res.status}): ${JSON.stringify(body)?.slice(0, 300)}`,
    );
  }
  return body;
}

function haveCredentials() {
  return Boolean(
    FIXTURE ||
    process.env.SUPABASE_DB_URL ||
    (process.env.SUPABASE_ACCESS_TOKEN && process.env.SUPABASE_PROJECT_REF),
  );
}

/* ───────────────────────── the comparison ───────────────────────────────── */

const present = (v) => v !== null && v !== undefined && v !== '';

/**
 * Classify one event row.
 *
 * Returns { comparable, multiDay, findings[] }.
 *
 * FOUR COMPARISONS, FOUR INDEPENDENT PREDICATES. Each check requires exactly
 * the fields it reads and nothing more:
 *
 *   start_time_of_day    clock_start  + tz_start_clock          (no date needed)
 *   end_time_of_day      clock_end    + tz_end_clock            (no date needed)
 *   start_calendar_day   event_date   + tz_start_date           (no clock needed)
 *   end_calendar_day     event_date   + tz_end_date             (no clock needed)
 *
 * This is deliberate and was a REAL BUG in the first version of this gate: one
 * shared predicate demanded all four of event_date, clock_start, tz_start_date
 * and tz_start_clock before ANY start-side check ran. Ten production rows carry
 * event_date and a start timestamptz but no start_time, so the calendar-day
 * check — which never needed the clock at all — was vetoed by a missing field
 * it does not read. Three of those ten disagree about the start day, one of them
 * a LIVE event six days out, and the gate reported them as "nothing to compare"
 * and exited green. A precondition wider than the check it guards does not make
 * the check safer; it makes it silent.
 *
 * A row with neither shape populated for any pair is counted as skipped —
 * never as clean.
 */
export function classifyEvent(row) {
  const findings = [];

  const startClockComparable = present(row.clock_start) && present(row.tz_start_clock);
  const endClockComparable   = present(row.clock_end)   && present(row.tz_end_clock);
  const startDayComparable   = present(row.event_date)  && present(row.tz_start_date);
  const endDayComparable     = present(row.event_date)  && present(row.tz_end_date);

  const comparable =
    startClockComparable || endClockComparable || startDayComparable || endDayComparable;

  // A later end DATE is what a multi-day event looks like. Recognised, counted,
  // and never flagged — see the header for why this carve-out is the whole point.
  const multiDay = Boolean(endDayComparable && row.tz_end_date > row.event_date);

  if (startClockComparable && row.clock_start !== row.tz_start_clock) {
    findings.push({
      field: 'start_time_of_day',
      clock: row.clock_start,
      timestamptz: row.tz_start_clock,
      detail: `start_time ${row.clock_start} IST vs start_date ${row.tz_start_clock} IST`,
    });
  }

  if (startDayComparable && row.event_date !== row.tz_start_date) {
    // Multi-day explains a later END date. It never explains a start on a day
    // other than the event's own date.
    findings.push({
      field: 'start_calendar_day',
      clock: row.event_date,
      timestamptz: row.tz_start_date,
      detail: `event_date ${row.event_date} vs start_date's day ${row.tz_start_date} IST`,
    });
  }

  if (endClockComparable && row.clock_end !== row.tz_end_clock) {
    findings.push({
      field: 'end_time_of_day',
      clock: row.clock_end,
      timestamptz: row.tz_end_clock,
      detail: `end_time ${row.clock_end} IST vs end_date ${row.tz_end_clock} IST`,
    });
  }

  if (endDayComparable && row.tz_end_date < row.event_date) {
    // ONLY the earlier direction. A LATER end date is the multi-day carve-out
    // and is never flagged; an event that ENDS before the day it starts cannot
    // be a longer event, so no carve-out can explain it. Asymmetric on purpose.
    findings.push({
      field: 'end_calendar_day',
      clock: row.event_date,
      timestamptz: row.tz_end_date,
      detail: `end_date's day ${row.tz_end_date} IST is BEFORE event_date ${row.event_date}`,
    });
  }

  return { comparable, multiDay, findings };
}

/* ───────────────────────── baseline ─────────────────────────────────────── */

// Keyed by event id + field. "This row's end time is known-wrong" — NOT "this
// row is exempt". A second field going wrong on a baselined row still fails.
const sigOf = (id, field) => `${id}|${field}`;

/**
 * A LIVE EVENT IS NEVER PARDONED — see the header. The ledger only ever covers
 * an event nobody is currently being shown a wrong time for.
 *
 * Pardonable statuses are named explicitly, and anything unrecognised counts as
 * live. Erring toward the alarm is the correct direction for a gate: a new
 * status value ('published', 'ongoing') arriving later should make this gate
 * louder, not quietly widen the pardon. Production today holds exactly three
 * values — live (25), draft (21), archived (5).
 */
const PARDONABLE_STATUSES = new Set(['draft', 'archived', 'cancelled', 'completed']);
const isPardonable = (status) =>
  PARDONABLE_STATUSES.has(String(status ?? '').trim().toLowerCase());

function loadBaseline() {
  if (NO_BASELINE) return new Set();
  if (!existsSync(BASELINE_PATH)) return new Set();
  const raw = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const list = Array.isArray(raw) ? raw : raw.divergent ?? [];
  return new Set(list.map((e) => (typeof e === 'string' ? e : sigOf(e.id, e.field))));
}

/* ───────────────────────── self-test ────────────────────────────────────── */

/**
 * The gate's own tests, in the gate. A guard that is not exercised is a guard
 * that quietly stops guarding, and this one has a specific way of doing it:
 * loosen the multi-day carve-out into "skip any row whose dates differ" and it
 * stops seeing the seminar entirely — silence that is indistinguishable from
 * a clean sweep.
 *
 * Every case below is a real production shape (see the header's audit).
 */
const SELF_TEST_CASES = [
  {
    name: 'single-day, both shapes agree → clean',
    row: {
      id: 'a', name: 'Skill Development Program', status: 'live',
      event_date: '2026-09-03', clock_start: '09:30:00', clock_end: '15:30:00',
      tz_start_date: '2026-09-03', tz_start_clock: '09:30:00',
      tz_end_date: '2026-09-03', tz_end_clock: '15:30:00',
    },
    expect: { comparable: true, multiDay: false, fields: [] },
  },
  {
    name: 'MULTI-DAY 6 weeks, clock times identical → must NOT flag',
    row: {
      id: 'b', name: 'CERTIFICATE COURSES', status: 'live',
      event_date: '2026-08-01', clock_start: '09:00:00', clock_end: '15:30:00',
      tz_start_date: '2026-08-01', tz_start_clock: '09:00:00',
      tz_end_date: '2026-09-15', tz_end_clock: '15:30:00',
    },
    expect: { comparable: true, multiDay: true, fields: [] },
  },
  {
    name: 'MULTI-DAY 2 days, clock times identical → must NOT flag',
    row: {
      id: 'c', name: 'HANDS-ON WORKSHOP "BUSINESS ANALYTICS"', status: 'live',
      event_date: '2026-08-10', clock_start: '09:45:00', clock_end: '15:45:00',
      tz_start_date: '2026-08-10', tz_start_clock: '09:45:00',
      tz_end_date: '2026-08-11', tz_end_clock: '15:45:00',
    },
    expect: { comparable: true, multiDay: true, fields: [] },
  },
  {
    name: 'the seminar — end time of day off by an hour → flag end only',
    row: {
      id: 'd', name: 'SEMINAR - LOGISTICS SUPPLY CHAIN MANAGEMENT', status: 'live',
      event_date: '2026-09-09', clock_start: '10:30:00', clock_end: '14:00:00',
      tz_start_date: '2026-09-09', tz_start_clock: '10:30:00',
      tz_end_date: '2026-09-09', tz_end_clock: '13:00:00',
    },
    expect: { comparable: true, multiDay: false, fields: ['end_time_of_day'] },
  },
  {
    name: 'Renewable Energy Day — 9.5h shift on both ends → flag both',
    row: {
      id: 'e', name: 'Renewable Energy Day', status: 'draft',
      event_date: '2026-08-20', clock_start: '09:00:00', clock_end: '13:00:00',
      tz_start_date: '2026-08-20', tz_start_clock: '18:30:00',
      tz_end_date: '2026-08-20', tz_end_clock: '22:30:00',
    },
    expect: { comparable: true, multiDay: false, fields: ['start_time_of_day', 'end_time_of_day'] },
  },
  {
    name: 'MULTI-DAY whose end CLOCK also drifted → still flag the clock',
    row: {
      id: 'f', name: 'hypothetical multi-day with a real bug', status: 'live',
      event_date: '2026-08-01', clock_start: '09:00:00', clock_end: '15:30:00',
      tz_start_date: '2026-08-01', tz_start_clock: '09:00:00',
      tz_end_date: '2026-09-15', tz_end_clock: '11:00:00',
    },
    expect: { comparable: true, multiDay: true, fields: ['end_time_of_day'] },
  },
  {
    name: 'whole event shifted a day earlier → flag BOTH days; multi-day explains neither',
    row: {
      id: 'g', name: 'hypothetical shifted start', status: 'draft',
      event_date: '2026-07-22', clock_start: '10:00:00', clock_end: '16:30:00',
      tz_start_date: '2026-07-21', tz_start_clock: '10:00:00',
      tz_end_date: '2026-07-21', tz_end_clock: '16:30:00',
    },
    // Both clock times match exactly; only the calendar days moved. The end day
    // is EARLIER than event_date, which no multi-day reading can account for.
    expect: {
      comparable: true, multiDay: false,
      fields: ['start_calendar_day', 'end_calendar_day'],
    },
  },
  /* ── THE SHAPE THE FIRST VERSION OF THIS GATE WAS BLIND TO ──────────────
   * event_date and the timestamptz day are both populated; start_time is NULL.
   * The calendar-day comparison needs neither clock field, but the original
   * shared predicate demanded clock_start before any start-side check ran, so
   * these rows were reported as "nothing to compare" and the gate exited green.
   * Ten production rows have this shape and THREE of them disagree.
   *
   * The self-test could not catch it because every case was built from a shape
   * that already passed: case 'g' supplies clock_start (so it reached the day
   * check through the clock gate) and case 'h' nulls event_date (where skipping
   * is correct). 10/10 green coexisted with a blind guard. These are the real
   * production rows.
   */
  {
    name: 'BLIND SPOT: no start_time, start day disagrees → flag (was silently skipped)',
    row: {
      id: 'k', name: 'JKKN School of Influencer', status: 'live',
      event_date: '2026-08-04', clock_start: null, clock_end: null,
      tz_start_date: '2026-07-29', tz_start_clock: '10:00:00',
      tz_end_date: '2026-09-30', tz_end_clock: '17:00:00',
    },
    expect: { comparable: true, multiDay: true, fields: ['start_calendar_day'] },
  },
  {
    name: 'BLIND SPOT: no start_time, start day agrees → clean, still comparable',
    row: {
      id: 'l', name: 'Onam Celebration 2k26', status: 'live',
      event_date: '2026-08-20', clock_start: null, clock_end: null,
      tz_start_date: '2026-08-20', tz_start_clock: '09:00:00',
      tz_end_date: '2026-08-20', tz_end_clock: '17:00:00',
    },
    expect: { comparable: true, multiDay: false, fields: [] },
  },
  {
    name: 'BLIND SPOT (end side): no end_time, end day BEFORE event_date → flag',
    row: {
      id: 'm', name: 'Government job fair', status: 'draft',
      event_date: '2026-07-22', clock_start: null, clock_end: null,
      tz_start_date: '2026-07-21', tz_start_clock: '10:00:00',
      tz_end_date: '2026-07-21', tz_end_clock: '16:30:00',
    },
    expect: {
      comparable: true, multiDay: false,
      fields: ['start_calendar_day', 'end_calendar_day'],
    },
  },
  {
    name: 'end date EARLIER than event_date → flag; multi-day cannot explain it',
    row: {
      id: 'n', name: 'hypothetical backwards end', status: 'live',
      event_date: '2026-09-10', clock_start: '09:00:00', clock_end: '17:00:00',
      tz_start_date: '2026-09-10', tz_start_clock: '09:00:00',
      tz_end_date: '2026-09-09', tz_end_clock: '17:00:00',
    },
    expect: { comparable: true, multiDay: false, fields: ['end_calendar_day'] },
  },
  {
    name: 'end date LATER stays free even with no clocks → multi-day, no finding',
    row: {
      id: 'o', name: 'CERTIFICATE COURSES, clock-free', status: 'live',
      event_date: '2026-08-01', clock_start: null, clock_end: null,
      tz_start_date: '2026-08-01', tz_start_clock: '09:00:00',
      tz_end_date: '2026-09-15', tz_end_clock: '15:30:00',
    },
    expect: { comparable: true, multiDay: true, fields: [] },
  },
  {
    name: 'no event_date but both clocks present → compared on time of day alone',
    row: {
      id: 'p', name: 'hypothetical dateless row', status: 'live',
      event_date: null, clock_start: '09:00:00', clock_end: '17:00:00',
      tz_start_date: '2026-08-18', tz_start_clock: '09:00:00',
      tz_end_date: '2026-08-18', tz_end_clock: '16:00:00',
    },
    expect: { comparable: true, multiDay: false, fields: ['end_time_of_day'] },
  },
  {
    name: 'no clock fields at all → skipped, not clean',
    row: {
      id: 'h', name: 'SCHOOL ZONAL KABADDI TOURNAMENT', status: 'draft',
      event_date: null, clock_start: null, clock_end: null,
      tz_start_date: '2026-08-18', tz_start_clock: '05:30:00',
      tz_end_date: '2026-08-18', tz_end_clock: '05:30:00',
    },
    expect: { comparable: false, multiDay: false, fields: [] },
  },
  {
    name: 'clock but no timestamptz → skipped, not clean',
    row: {
      id: 'i', name: 'Kumarapalayam Bypass Marathon - 2026', status: 'live',
      event_date: '2026-04-12', clock_start: '06:00:00', clock_end: null,
      tz_start_date: null, tz_start_clock: null,
      tz_end_date: null, tz_end_clock: null,
    },
    expect: { comparable: false, multiDay: false, fields: [] },
  },
  {
    name: 'sub-second timestamptz vs minute-resolution clock → not a divergence',
    row: {
      id: 'j', name: 'fractional seconds', status: 'live',
      event_date: '2026-08-08', clock_start: '15:29:21', clock_end: '15:29:21',
      tz_start_date: '2026-08-08', tz_start_clock: '15:29:21',
      tz_end_date: '2026-08-08', tz_end_clock: '15:29:21',
    },
    expect: { comparable: true, multiDay: false, fields: [] },
  },
];

function runSelfTest() {
  let pass = 0;
  const failures = [];
  for (const c of SELF_TEST_CASES) {
    const got = classifyEvent(c.row);
    const gotFields = got.findings.map((f) => f.field).sort();
    const wantFields = [...c.expect.fields].sort();
    const ok =
      got.comparable === c.expect.comparable &&
      got.multiDay === c.expect.multiDay &&
      JSON.stringify(gotFields) === JSON.stringify(wantFields);
    if (ok) {
      pass++;
      console.log(`  ${GREEN}✓${RESET} ${c.name}`);
    } else {
      failures.push(c.name);
      console.log(`  ${RED}✗${RESET} ${c.name}`);
      console.log(`      want comparable=${c.expect.comparable} multiDay=${c.expect.multiDay} fields=[${wantFields}]`);
      console.log(`      got  comparable=${got.comparable} multiDay=${got.multiDay} fields=[${gotFields}]`);
    }
  }
  console.log(`\n${pass}/${SELF_TEST_CASES.length} self-test cases passed.`);
  if (failures.length > 0) {
    console.error(`${RED}FAIL${RESET}: the guard's own logic is wrong — ${failures.length} case(s).`);
    process.exit(2);
  }
  console.log(`${GREEN}OK${RESET}: multi-day events are not flagged; real divergence is.`);
  process.exit(0);
}

/* ───────────────────────── main ─────────────────────────────────────────── */

async function main() {
  if (SELF_TEST) {
    console.log(`${DIM}event-time-consistency — self-test (no database, no credentials)${RESET}`);
    runSelfTest();
    return;
  }

  if (!haveCredentials()) {
    console.error(`${RED}✗ no route to the database — this gate reads production and cannot run.${RESET}
Set ONE of:
  SUPABASE_DB_URL                                (direct Postgres — session pooler,
                                                  port 6543; GitHub runners cannot
                                                  reach the direct 5432 host)
  SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF   (Management API)
or pass --fixture <file> to read rows from JSON, or --self-test for the offline
logic check.

Exiting 1 rather than 0: "the comparison did not run" and "no event diverges"
are the same silence, and treating the first as the second is exactly how the
seminar's wrong end time survived every green check.`);
    process.exit(1);
  }

  let rows;
  try {
    rows = await fetchEvents();
  } catch (err) {
    console.error(`${RED}✗ operational error: ${err.message}${RESET}`);
    console.error(`${DIM}A transport failure is not a pass. Exiting 1.${RESET}`);
    process.exit(1);
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    console.error(`${RED}✗ operational error: the events query returned no rows at all.${RESET}
public.events is not empty in this system, so zero rows means the query, the
credentials or the project ref is wrong — not that every event is consistent.`);
    process.exit(1);
  }

  const baseline = loadBaseline();

  let compared = 0, skipped = 0, multiDay = 0;
  const divergent = [];

  for (const row of rows) {
    const { comparable, multiDay: isMulti, findings } = classifyEvent(row);
    if (!comparable) { skipped++; continue; }
    compared++;
    if (isMulti) multiDay++;
    for (const f of findings) {
      // In the ledger is not the same as pardoned: a live event is never
      // pardoned, however long its divergence has been on the books.
      const inLedger = baseline.has(sigOf(row.id, f.field));
      const pardoned = inLedger && isPardonable(row.status);
      divergent.push({
        id: row.id,
        name: row.name,
        status: row.status,
        multiDay: isMulti,
        ...f,
        baselined: pardoned,
        pardonRefused: inLedger && !pardoned,
      });
    }
  }

  const fresh = divergent.filter((d) => !d.baselined);
  const known = divergent.filter((d) => d.baselined);
  const refused = divergent.filter((d) => d.pardonRefused);
  const live = new Set(divergent.map((d) => sigOf(d.id, d.field)));
  const stale = [...baseline].filter((s) => !live.has(s)).sort();

  if (UPDATE_BASELINE) {
    const payload = {
      _comment:
        'Events whose two stored times disagree (clock fields vs timestamptz), recorded so ' +
        'a NEW divergence stands out from debt that was already on the books. Keyed by ' +
        'event id + field: a baselined row that starts diverging in a SECOND field still ' +
        'fails. SHRINK THIS LIST; DO NOT GROW IT. ' +
        'A LIVE EVENT IS NEVER LISTED HERE and is never pardoned — people are being shown ' +
        'its wrong time today, so it fails the sweep until someone fixes it in the Events ' +
        'UI. Only draft/archived/cancelled/completed events are enrolled. ' +
        'Regenerate: node scripts/ci/check-event-time-consistency.mjs --update-baseline',
      generated: new Date().toISOString().slice(0, 10),
      // Only pardonable statuses are written. Regenerating the ledger must never
      // be able to silence a live event: if --update-baseline could enrol one,
      // the documented "a live divergence always fails" rule would last exactly
      // until the next person ran this flag to get a green run.
      divergent: divergent
        .filter((d) => isPardonable(d.status))
        .map((d) => ({
          id: d.id,
          field: d.field,
          name: d.name,
          status: d.status,
          observed: d.detail,
        })),
    };
    writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    const notEnrolled = divergent.length - payload.divergent.length;
    console.log(`${GREEN}wrote${RESET} ${BASELINE_PATH} — ${payload.divergent.length} entries`);
    if (notEnrolled > 0) {
      console.log(
        `${YELLOW}${notEnrolled} live divergence(s) deliberately NOT enrolled${RESET} — ` +
        `a live event is never pardoned; fix it in the Events UI.`,
      );
    }
    process.exit(0);
  }

  /* ── report ───────────────────────────────────────────────────────────── */
  if (JSON_OUT) {
    console.log(JSON.stringify({
      events_total: rows.length,
      compared,
      skipped_not_comparable: skipped,
      multi_day_recognised: multiDay,
      divergent_new: fresh,
      divergent_baselined: known,
      divergent_pardon_refused: refused,
      baseline_stale: stale,
    }, null, 2));
  } else {
    console.log(`${DIM}event-time-consistency — clock fields vs timestamptz, in ${TZ}${RESET}`);
    console.log(`  events in table          ${rows.length}`);
    console.log(`  ${BOLD}events compared          ${compared}${RESET}   ${DIM}at least one field pair populated on both sides${RESET}`);
    console.log(`  skipped not-comparable   ${skipped}   ${DIM}no field pair populated on both sides${RESET}`);
    console.log(`  multi-day recognised     ${multiDay}   ${DIM}later end DATE, not flagged${RESET}`);
    console.log(`  ${BOLD}divergent (new)          ${fresh.length}${RESET}   ${DIM}blocks this run${RESET}`);
    console.log(`  divergent (baselined)    ${known.length}   ${DIM}known debt on a non-live event — warns${RESET}`);
    if (refused.length > 0) {
      console.log(`  ${BOLD}pardon refused (live)    ${refused.length}${RESET}   ${DIM}in the ledger, but the event is live — fails${RESET}`);
    }

    if (fresh.length > 0) {
      console.log(`\n${RED}DIVERGENT${RESET} — the page and the scheduler disagree about this event.`);
      console.log(`${DIM}The clock fields are what people are shown. The timestamptz fields are what${RESET}`);
      console.log(`${DIM}scheduling logic compares to now(). When they differ, something fires at the${RESET}`);
      console.log(`${DIM}wrong moment and nothing errors.${RESET}\n`);
      for (const d of fresh) {
        console.log(`  ${RED}✗${RESET} ${d.name} ${DIM}(${d.status})${RESET}`);
        console.log(`      ${d.detail}`);
        console.log(`      ${DIM}${d.field} · events.id ${d.id}${d.multiDay ? ' · multi-day' : ''}${RESET}`);
        if (d.pardonRefused) {
          console.log(`      ${YELLOW}in the baseline ledger, but this event is ${d.status} — a live event is never pardoned.${RESET}`);
        }
      }
      console.log(`\n${DIM}Fix in the Events UI: open the event, set the clock fields and the`);
      console.log(`start/end date-time to the same moment, and save. Decide which one is`);
      console.log(`right by asking the organiser — do not assume the timestamptz is correct`);
      console.log(`just because it is what the code reads.${RESET}`);
    }

    if (known.length > 0) {
      console.log(`\n${YELLOW}DIVERGENT (baselined)${RESET} — ${known.length} pre-existing, not failing this run.`);
      for (const d of known) {
        console.log(`  ${YELLOW}!${RESET} ${d.name} ${DIM}(${d.status})${RESET} — ${d.detail}`);
      }
      console.log(`${DIM}Each of these is a real disagreement someone still has to settle.${RESET}`);
    }

    if (stale.length > 0) {
      console.log(`\n${GREEN}Baseline entries that no longer diverge${RESET} (${stale.length}) — remove them:`);
      for (const s of stale) console.log(`  ${DIM}• ${s}${RESET}`);
      console.log(`${DIM}Run --update-baseline to rewrite the ledger.${RESET}`);
    }
  }

  if (fresh.length > 0 && !REPORT_ONLY) {
    if (!JSON_OUT) {
      console.log(`\n${RED}FAIL${RESET}: ${fresh.length} event time(s) disagree between the two shapes.`);
    }
    process.exit(2);
  }

  if (!JSON_OUT) {
    console.log(`\n${GREEN}OK${RESET}: ${compared} event(s) compared, ${skipped} carrying no comparable field pair, ${fresh.length} newly divergent.`);
  }
  process.exit(0);
}

// Importable without executing the CLI.
const INVOKED_DIRECTLY =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (INVOKED_DIRECTLY) {
  main().catch((err) => {
    console.error(`${RED}✗ ${err.stack || err.message}${RESET}`);
    process.exit(1);
  });
}
