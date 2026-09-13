// __tests__/events/events-cancellation.test.ts
//
// Cover for the general-event CANCEL path: the transition map, the two display
// helpers that decide what the hub says, the hub's status filter, the service
// guard, and — the ones that matter most — the two promises below.
//
// ─── 1. THE REASON IS NOT ON THE ANON-READABLE TABLE ─────────────────────────
//
// `events_public_read` has no TO clause and `is_public` defaults to true, so
// `public.events` is readable with the public anon key. The reason is KEPT when
// a cancelled event is reinstated — so a column there would publish the
// organiser's verbatim text the moment the event went live again, with no page
// printing it and nothing to notice. Director's ruling, 13 Sep 2026: "keep the
// reason out of the public table entirely." It lives in
// `public.event_cancellations`, which anon holds no grant on and no policy
// names. The `migration 20261204113700` block below fails if it moves back.
//
// ─── 2. THE PUBLIC PAGE READS NO CANCELLATION DATA AT ALL ────────────────────
//
// Verified read-only against production 2026-09-13: no event is in `cancelled`
// (55 rows: 27 live, 23 draft, 5 archived) and the migration is unapplied.
// PostgREST fails an entire select when one named column is missing, so naming
// a column that does not exist on `events` — and these never will — would
// return no row for EVERY event and take public registration down for all 55.
// `PUBLIC_EVENT_COLUMNS must not name the cancellation columns` below is the
// guard; it fails the moment someone adds them back.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  GENERAL_EVENT_STATUS_TRANSITIONS,
  generalEventStatusLabel,
  isGeneralEventActive,
} from '@/types/events';
import type { Event } from '@/types/events';
import {
  PUBLIC_CANCELLATION_CONTACT_EMAIL,
  PUBLIC_CANCELLATION_NOTICE,
  PUBLIC_EVENT_COLUMNS,
} from '@/app/p/event/[id]/register/_lib/cancellation';
import {
  isEventOpen,
  matchesEventStatusFilter,
} from '@/app/(routes)/events/_components/event-display';

// The service pulls in EventBaseService, which builds a Supabase client at
// MODULE level. Replace the whole module: these tests are about the rules the
// service applies BEFORE it writes, not about the write.
const getEvent = vi.fn();
const updateEvent = vi.fn();
vi.mock('@/lib/services/events/core/event-base-service', () => {
  const noop = () => Promise.resolve(null);
  return {
    EventBaseService: {
      getEvent: (...args: unknown[]) => getEvent(...args),
      updateEvent: (...args: unknown[]) => updateEvent(...args),
      // MarathonEventService re-exports these at class-init time via .bind(),
      // so they must exist on the mock or importing that module throws.
      getEvents: noop,
      createEvent: noop,
      deleteEvent: noop,
      getCategories: noop,
      createCategory: noop,
      updateCategory: noop,
      deleteCategory: noop,
    },
  };
});

// GeneralEventService now holds a browser client of its own: the cancellation
// reason is a row in `public.event_cancellations`, not a column on `events`, so
// it writes one table through EventBaseService and the other directly.
const cancellationUpsert = vi.fn();
const cancellationMaybeSingle = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({
    from: () => ({
      upsert: (...args: unknown[]) => cancellationUpsert(...args),
      select: () => ({
        eq: () => ({ maybeSingle: () => cancellationMaybeSingle() }),
      }),
    }),
  }),
}));

import { GeneralEventService } from '@/lib/services/events/core/general-event-service';
import { MarathonEventService } from '@/lib/services/events/marathon/marathon-event-service';

/** Just enough of an Event for the helpers under test. */
const eventWith = (patch: Partial<Event>): Event =>
  ({
    id: 'e1',
    name: 'Annual Day',
    event_type: 'cultural',
    status: 'live',
    created_by: 'u1',
    institution_id: 'i1',
    ...patch,
  }) as Event;

// ─────────────────────────────────────────────────────────────────────────────

describe('GENERAL_EVENT_STATUS_TRANSITIONS — where cancelled can be reached from', () => {
  it('allows live -> cancelled', () => {
    expect(GENERAL_EVENT_STATUS_TRANSITIONS.live).toContain('cancelled');
  });

  it('does NOT allow draft -> cancelled: a draft was never announced', () => {
    expect(GENERAL_EVENT_STATUS_TRANSITIONS.draft ?? []).not.toContain('cancelled');
  });

  it('keeps live -> draft, so the old two-state flip is not lost', () => {
    expect(GENERAL_EVENT_STATUS_TRANSITIONS.live).toContain('draft');
  });

  it('lets a cancelled event be reinstated to either draft or live', () => {
    expect(GENERAL_EVENT_STATUS_TRANSITIONS.cancelled).toEqual(
      expect.arrayContaining(['draft', 'live'])
    );
  });
});

describe('status display helpers', () => {
  it('names cancelled instead of collapsing it into Active', () => {
    expect(generalEventStatusLabel('cancelled')).toBe('Cancelled');
  });

  it('still reads draft as Draft and every other value as Active', () => {
    expect(generalEventStatusLabel('draft')).toBe('Draft');
    expect(generalEventStatusLabel('live')).toBe('Active');
    expect(generalEventStatusLabel('post_event')).toBe('Active');
  });

  it('does not count a cancelled event as open', () => {
    expect(isGeneralEventActive('cancelled')).toBe(false);
    expect(isGeneralEventActive('draft')).toBe(false);
    expect(isGeneralEventActive('live')).toBe(true);
  });
});

describe('Events Hub status filter — the list must agree with the badge', () => {
  const cancelled = eventWith({ status: 'cancelled' });
  const draft = eventWith({ status: 'draft' });
  const live = eventWith({ status: 'live' });

  it('does NOT put a cancelled event in the Draft bucket', () => {
    // The regression: "Draft" used to mean !isEventOpen, and a cancelled event
    // is not open — so it showed up in the Draft list wearing a Cancelled badge.
    expect(matchesEventStatusFilter(cancelled, 'draft')).toBe(false);
    expect(generalEventStatusLabel(cancelled.status)).toBe('Cancelled');
  });

  it('puts a cancelled event in its own Cancelled bucket', () => {
    expect(matchesEventStatusFilter(cancelled, 'cancelled')).toBe(true);
    expect(matchesEventStatusFilter(draft, 'cancelled')).toBe(false);
    expect(matchesEventStatusFilter(live, 'cancelled')).toBe(false);
  });

  it('keeps Active meaning open, and Draft meaning draft', () => {
    expect(matchesEventStatusFilter(live, 'active')).toBe(true);
    expect(matchesEventStatusFilter(cancelled, 'active')).toBe(false);
    expect(matchesEventStatusFilter(draft, 'draft')).toBe(true);
  });

  it('shows every row under All', () => {
    for (const e of [cancelled, draft, live]) {
      expect(matchesEventStatusFilter(e, 'all')).toBe(true);
    }
  });

  it('every bucket agrees with the green-badge predicate it renders beside', () => {
    // Whatever bucket a row lands in, "Active" and only "Active" is green.
    expect(matchesEventStatusFilter(live, 'active')).toBe(isEventOpen(live));
    expect(matchesEventStatusFilter(cancelled, 'active')).toBe(isEventOpen(cancelled));
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('public registration page — names no column that does not exist', () => {
  it('PUBLIC_EVENT_COLUMNS must not name the cancellation columns', () => {
    // One missing column fails the WHOLE PostgREST select (42703) and the page
    // then treats every event as "not found". These columns are not on
    // production. Do not add them here — fetch them separately.
    for (const col of ['cancellation_reason', 'cancelled_at', 'cancelled_by']) {
      expect(PUBLIC_EVENT_COLUMNS).not.toContain(col);
    }
  });

  it('still asks for every column the page actually reads', () => {
    for (const col of [
      'id',
      'name',
      'event_type',
      'status',
      'event_date',
      'start_date',
      'venue',
      'venue_text',
      'registration_open_date',
      'registration_close_date',
      'max_registrations',
    ]) {
      expect(PUBLIC_EVENT_COLUMNS).toContain(col);
    }
  });

  it('reads no cancellation column anywhere on the public path', () => {
    // Stronger than the select guard above, and the reason it is affordable:
    // since the public page stopped printing the organiser's text there is no
    // second best-effort query either, so no missing column can reach this
    // route at all. If a `.select('cancellation_reason')` ever reappears here,
    // this fails before it reaches a production schema that lacks it.
    const lib = readFileSync(
      join(process.cwd(), 'app/p/event/[id]/register/_lib/cancellation.ts'),
      'utf8'
    );
    const page = readFileSync(
      join(process.cwd(), 'app/p/event/[id]/register/page.tsx'),
      'utf8'
    );
    const code = (src: string) =>
      src
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join('\n');

    for (const col of ['cancellation_reason', 'cancelled_at', 'cancelled_by']) {
      expect(code(lib)).not.toContain(col);
      expect(code(page)).not.toContain(col);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('the public cancellation line — standard, not the organiser\'s free text', () => {
  // Director's ruling, 13 Sep: "Short public line, full reason kept inside."
  // The reason is typed at the worst moment of an event's life with no review
  // step between the textarea and everyone holding the link.
  const page = readFileSync(
    join(process.cwd(), 'app/p/event/[id]/register/page.tsx'),
    'utf8'
  );

  it('still names the event as cancelled — the fact is not what was withheld', () => {
    expect(PUBLIC_CANCELLATION_NOTICE.headline).toMatch(/cancelled/i);
    expect(page).toContain('PUBLIC_CANCELLATION_NOTICE.headline');
  });

  it('says registrations are closed and that an existing entry survives', () => {
    expect(PUBLIC_CANCELLATION_NOTICE.body).toMatch(/no further registrations/i);
    expect(PUBLIC_CANCELLATION_NOTICE.alreadyRegistered).toMatch(/has not been removed/i);
  });

  it('gives somewhere to ask, since the reason is no longer printed', () => {
    expect(PUBLIC_CANCELLATION_CONTACT_EMAIL).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
    expect(page).toContain('PUBLIC_CANCELLATION_CONTACT_EMAIL');
    expect(page).toContain('mailto:');
  });

  it('names the event in the mailto subject, because one mailbox takes them all', () => {
    // PUBLIC_CANCELLATION_CONTACT_EMAIL is ONE institution-wide address for
    // every cancelled event at every college. A bare mailto arrives with
    // nothing saying which event it is about, so the subject is the whole of
    // the routing. Costs nothing and needs no schema — it is independent of
    // whether the Director keeps this address.
    expect(page).toMatch(/mailto:\$\{PUBLIC_CANCELLATION_CONTACT_EMAIL\}\?subject=/);
    expect(page).toContain('encodeURIComponent');
    expect(page).toMatch(/Cancelled event: \$\{ev\.name\} \(\$\{id\}\)/);
  });

  it('renders no organiser-supplied text in the cancelled branch', () => {
    // The regression this guards: `{reason}` back in the markup. Every string
    // the cancelled branch renders must come from the frozen notice constant.
    expect(page).not.toMatch(/whitespace-pre-line/);
    expect(page).not.toMatch(/The organiser has not recorded a reason/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('GeneralEventService.cancel', () => {
  beforeEach(() => {
    getEvent.mockReset();
    updateEvent.mockReset();
    cancellationUpsert.mockReset();
    cancellationUpsert.mockResolvedValue({ error: null });
  });

  it('refuses a blank reason before touching the database', async () => {
    await expect(GeneralEventService.cancel('e1', '   ')).rejects.toThrow(/reason/i);
    expect(getEvent).not.toHaveBeenCalled();
    expect(updateEvent).not.toHaveBeenCalled();
  });

  it('does not tell the organiser their reason will be shown to the registrants', async () => {
    // This is the one message an organiser sees at the exact moment of writing
    // the reason, and it is in a file the UI copy changes never touched — which
    // is why a source-level assertion on the dialog could not catch it.
    const message = await GeneralEventService.cancel('e1', '').then(
      () => 'it did not throw',
      (e: unknown) => (e as Error).message
    );
    expect(message).not.toMatch(/the people registered will be shown it/i);
    expect(message).toMatch(/colleagues at your institution/i);
    expect(message).toMatch(/standard notice/i);
  });

  it('refuses to cancel an event that is not live', async () => {
    getEvent.mockResolvedValue(eventWith({ status: 'draft' }));

    await expect(GeneralEventService.cancel('e1', 'Venue flooded')).rejects.toThrow(
      /Invalid status transition/
    );
    expect(updateEvent).not.toHaveBeenCalled();
  });

  it('sends the reason to event_cancellations and NEVER to the events table', async () => {
    getEvent.mockResolvedValue(eventWith({ status: 'live' }));
    updateEvent.mockResolvedValue(eventWith({ status: 'cancelled' }));

    await GeneralEventService.cancel('e1', '  Venue flooded  ');

    // events gets the status and nothing else. A cancellation_reason here would
    // put the organiser's words back on the anon-readable table — the exact
    // thing the Director's ruling of 13 Sep took them off.
    expect(updateEvent).toHaveBeenCalledWith('e1', { status: 'cancelled' });
    const [, payload] = updateEvent.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload).not.toHaveProperty('cancellation_reason');
    expect(payload).not.toHaveProperty('cancelled_at');
    expect(payload).not.toHaveProperty('cancelled_by');

    // The reason goes to its own table, trimmed.
    const [row] = cancellationUpsert.mock.calls[0] as [Record<string, unknown>];
    expect(row).toEqual({ event_id: 'e1', reason: 'Venue flooded' });
    // The stamps belong to the trigger, from auth.uid() — a client must not be
    // able to name somebody else as the canceller.
    expect(row).not.toHaveProperty('cancelled_at');
    expect(row).not.toHaveProperty('cancelled_by');
  });

  it('records the reason BEFORE flipping the status, so a half-failure is the safe one', async () => {
    // Order is the whole guarantee. If the status flip came first and the record
    // failed, the event would be cancelled — bookings already released by
    // tr_event_cancelled_cascade_release — with no record of why. The reverse
    // leaves an unread row on a still-live event, which the next attempt
    // overwrites.
    const order: string[] = [];
    getEvent.mockResolvedValue(eventWith({ status: 'live' }));
    cancellationUpsert.mockImplementation(() => {
      order.push('reason');
      return Promise.resolve({ error: null });
    });
    updateEvent.mockImplementation(() => {
      order.push('status');
      return Promise.resolve(eventWith({ status: 'cancelled' }));
    });

    await GeneralEventService.cancel('e1', 'Venue flooded');

    expect(order).toEqual(['reason', 'status']);
  });

  it('does not cancel the event at all when the reason cannot be recorded', async () => {
    getEvent.mockResolvedValue(eventWith({ status: 'live' }));
    cancellationUpsert.mockResolvedValue({ error: { message: 'permission denied' } });

    await expect(GeneralEventService.cancel('e1', 'Venue flooded')).rejects.toThrow(
      /still active/i
    );
    // The event is untouched: no status flip, so no cascade, so no released rooms.
    expect(updateEvent).not.toHaveBeenCalled();
  });
});

describe('the other writer the database rule has to live with: marathon', () => {
  beforeEach(() => {
    getEvent.mockReset();
    updateEvent.mockReset();
  });

  // `events` is one table. MarathonEventService.updateStatus reaches 'cancelled'
  // from draft / planning / preparation / execution through its own transition
  // map, and three UI paths call it: the marathon list's "Change Status"
  // dropdown (app/(routes)/events/marathon/page.tsx), the dashboard's
  // EventStatusControl, and the live console's Emergency Stop
  // (_components/race-controls.tsx). None of them collects a reason — there is
  // no field. A reason requirement written at the TABLE would have broken all
  // three at runtime; that is why it lives in GeneralEventService.cancel().
  it.each(['draft', 'planning', 'preparation', 'execution'] as const)(
    'cancels a %s marathon with no reason at all, and must keep being allowed to',
    async (from) => {
      getEvent.mockResolvedValue(eventWith({ status: from, event_type: 'marathon' }));
      updateEvent.mockResolvedValue(eventWith({ status: 'cancelled' }));

      await MarathonEventService.updateStatus('m1', 'cancelled');

      expect(updateEvent).toHaveBeenCalledWith('m1', { status: 'cancelled' });
      const [, payload] = updateEvent.mock.calls[0] as [string, Record<string, unknown>];
      expect(payload).not.toHaveProperty('cancellation_reason');
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Two invariants that live in text no unit test can otherwise reach: the trigger
// must not raise, and the dialog must not go quiet about the cascade. Both are
// the kind of thing a later tidy-up removes by accident.

describe('migration 20261204113700 — the reason lives off the anon-readable table', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'supabase/migrations/20261204113700_events_cancellation_reason_and_stamp.sql'
    ),
    'utf8'
  );

  /** The SQL that actually runs — `--` prose is free to explain what was rejected. */
  const code = sql
    .split('\n')
    .map((line) => line.replace(/^\s*--.*$/, ''))
    .join('\n');

  /** The stamp function's body alone — the file's own guard blocks RAISE freely. */
  const triggerBody = code.slice(
    code.indexOf('CREATE OR REPLACE FUNCTION public.fn_event_cancellation_stamp()'),
    code.indexOf('REVOKE EXECUTE ON FUNCTION public.fn_event_cancellation_stamp()')
  );

  it('puts the reason on its OWN table, never back on the anon-readable events', () => {
    // The ruling itself, in the one file that decides it. events_public_read has
    // no TO clause and is_public defaults to true, and the reason survives a
    // reinstatement — so a column on `events` publishes it to the anon key the
    // moment a cancelled event goes live again.
    expect(code).toMatch(/CREATE TABLE IF NOT EXISTS public\.event_cancellations/);
    expect(code).not.toMatch(/ALTER TABLE public\.events\s+ADD COLUMN/i);
  });

  it('leaves anon no grant at all, and names authenticated in the revoke', () => {
    // Naming `authenticated` is the point: Supabase's ALTER DEFAULT PRIVILEGES
    // gives it its OWN direct grant on every new table, separate from PUBLIC, so
    // `FROM anon, PUBLIC` alone would leave DELETE sitting on the role every
    // signed-in browser uses.
    expect(code).toMatch(
      /REVOKE ALL ON public\.event_cancellations FROM anon, PUBLIC, authenticated/i
    );
    expect(code).toMatch(
      /GRANT SELECT, INSERT, UPDATE ON public\.event_cancellations TO authenticated/i
    );
    // No DELETE for anyone: a cancellation record is not erasable from a console.
    expect(code).not.toMatch(/GRANT[^;]*DELETE[^;]*event_cancellations/i);
    // And never the keyword that freezes the fleet-wide ship gate.
    expect(code).not.toMatch(/REVOKE\s+TRUNCATE/i);
  });

  it('asserts its own end state with has_table_privilege rather than trusting the grants', () => {
    for (const verb of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      expect(code).toContain(`has_table_privilege('anon', 'public.event_cancellations', '${verb}')`);
    }
    expect(code).toContain(
      "has_table_privilege('authenticated', 'public.event_cancellations', 'DELETE')"
    );
  });

  it('turns RLS on and gives anon no policy', () => {
    expect(code).toMatch(/ALTER TABLE public\.event_cancellations ENABLE ROW LEVEL SECURITY/i);
    // Every policy is TO authenticated. An anon policy here would undo the table.
    const policies = code.match(/CREATE POLICY[^;]+;/g) ?? [];
    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) {
      expect(policy).toMatch(/TO authenticated/);
      expect(policy).not.toMatch(/TO anon/);
    }
  });

  it('the stamp trigger does not RAISE, so a cancellation without a reason still records', () => {
    // Scoped to the trigger body: the file's own repair and assertion blocks
    // RAISE on purpose, and asserting over the whole file would forbid that.
    expect(triggerBody).not.toMatch(/RAISE\s+EXCEPTION/i);
    expect(triggerBody).not.toContain('23514');
  });

  it('still stamps who and when from the server, and normalises the reason', () => {
    expect(triggerBody).toMatch(/NEW\.cancelled_at\s*:=\s*now\(\)/);
    expect(triggerBody).toMatch(/NEW\.cancelled_by\s*:=\s*auth\.uid\(\)/);
    expect(triggerBody).toMatch(/nullif\s*\(\s*btrim/i);
  });

  it('locks the SECURITY DEFINER function away from anon', () => {
    expect(code).toMatch(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.fn_event_cancellation_stamp\(\)\s+FROM\s+anon,\s*PUBLIC/i
    );
    expect(code).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.fn_event_cancellation_stamp\(\)\s+TO\s+authenticated/i
    );
  });

  it('does not let its own stamp trigger eat the history it backfills', () => {
    // trg_event_cancellation_stamp fires BEFORE INSERT unconditionally and
    // overwrites cancelled_at with now() and cancelled_by with auth.uid() —
    // NULL on a migration connection. Left enabled over the backfill it would
    // replace the real who and when of every cancellation recorded under the old
    // shape with "now, nobody", and the next statement drops the source columns,
    // so the loss is irreversible. Disabling it for the copy keeps the trigger
    // unconditional everywhere else, which is what stops a browser naming
    // somebody else as the canceller.
    expect(code).toMatch(/DISABLE TRIGGER trg_event_cancellation_stamp/i);
    expect(code).toMatch(/ENABLE TRIGGER trg_event_cancellation_stamp/i);
    // …and it proves the values survived before destroying the source.
    expect(code).toMatch(/the backfill did not preserve cancelled_at/i);
  });

  it('builds the backfill dynamically, so a PARTIAL old shape does not half-apply', () => {
    // Static SQL naming e.cancellation_reason cannot plan when that column is
    // the missing one, and it would abort AFTER the table, policies and trigger
    // were created — a half-applied migration no re-run can clear.
    const backfill = code.slice(code.indexOf('$events_cancellation_drop_old$'));
    expect(backfill).toMatch(/EXECUTE format\(/);
    expect(backfill).toMatch(/NULL::timestamptz/);
    expect(backfill).toMatch(/NULL::uuid/);
  });

  it('lets everyone who can WRITE a reason read it back', () => {
    // maybeSingle() returns data:null with NO error for a row RLS hides, so a
    // creator or in-charge who could write but not read would be told "No reason
    // was recorded" about the sentence they had just written.
    const read = code.slice(
      code.indexOf('CREATE POLICY "event_cancellations_auth_read"'),
      code.indexOf('CREATE POLICY "event_cancellations_auth_write"')
    );
    expect(read).toMatch(/created_by = \(SELECT auth\.uid\(\)\)/);
    expect(read).toMatch(/fn_is_event_incharge/);
  });

  it('removes the old column-based shape instead of leaving it beside the new one', () => {
    // A database that applied the earlier draft keeps the anon exposure unless
    // this file takes it away. The drop is guarded on dependent views and is
    // never CASCADEd — one of them serves an external site.
    expect(code).toMatch(/DROP TRIGGER\s+IF EXISTS trg_events_stamp_cancellation ON public\.events/i);
    expect(code).toMatch(/DROP FUNCTION IF EXISTS public\.fn_events_stamp_cancellation\(\)/i);
    expect(code).toMatch(/DROP COLUMN IF EXISTS cancellation_reason/i);
    expect(code).toMatch(/FROM pg_depend/i);
    expect(code).not.toMatch(/DROP\s+(VIEW|COLUMN)[^;]*CASCADE/i);
  });

  it('the catalog comment a DBA reads says where the reason lives and why', () => {
    // A COMMENT ON TABLE outlives every TSX comment in this repo: it is the
    // authoritative description the next builder or DBA opens, and it is what
    // stops someone "tidying" this back onto events. The file is not applied
    // anywhere, so editing it in place changes both the repo AND the catalog.
    const start = code.indexOf('COMMENT ON TABLE public.event_cancellations IS');
    expect(start).toBeGreaterThan(-1);
    const comment = code.slice(start);
    // Terminate on the STATEMENT end (`';`), not the first semicolon: the text
    // itself contains semicolons, which would cut the body short and make every
    // assertion below pass without inspecting the rest.
    const end = comment.indexOf("';");
    expect(end).toBeGreaterThan(-1);
    const body = comment.slice(0, end);
    expect(body.length).toBeGreaterThan(400);
    expect(body).toMatch(/anon-readable/);
    expect(body).toMatch(/REINSTATED/i);
    expect(body).not.toMatch(/PUBLIC — printed on/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('no anon-readable relation may republish what the ruling took off the page', () => {
  // The public page not reading a column proves nothing about whether the DATA
  // is reachable. `marathon_events` is an APPROVED anon-readable view over
  // `public.events` (GRANT SELECT ... TO anon in the same file), and its
  // fresh-rebuild branch selects every column on `events` minus an exclusion
  // list. Apply 20261204113700, then rebuild any environment from setup — a new
  // staging project, a DR restore, a dropped-and-recreated view — and the three
  // cancellation columns get appended and published, with no migration and no
  // review. Not live today only because production's view has its list frozen
  // from before the columns existed.
  const views = readFileSync(join(process.cwd(), 'supabase/setup/05_views.sql'), 'utf8');

  /**
   * The DO block, with BOTH markers proved present first. An unguarded
   * `slice(indexOf(a), indexOf(b))` silently inspects the wrong region — or the
   * whole file — when a marker is missing, which is how a guard passes while
   * guarding nothing.
   */
  const doBlock = (() => {
    const from = views.indexOf('DO $marathon_events_pin$');
    const to = views.indexOf('END $marathon_events_pin$;');
    if (from === -1 || to === -1 || to <= from) return null;
    return views.slice(from, to);
  })();

  it('the marathon_events pin block is where this test thinks it is', () => {
    expect(doBlock).not.toBeNull();
    expect(doBlock).toContain('CREATE OR REPLACE VIEW public.marathon_events');
  });

  it('marathon_events excludes the cancellation columns when it is rebuilt from scratch', () => {
    // …inside the NOT IN exclusion specifically, not merely somewhere in the block.
    const notIn = doBlock!.slice(doBlock!.indexOf('NOT IN ('));
    const list = notIn.slice(0, notIn.indexOf(')'));
    for (const col of ['cancellation_reason', 'cancelled_at', 'cancelled_by']) {
      expect(list).toContain(`'${col}'`);
    }
  });

  it('refuses to rebuild a view whose predicate it cannot reproduce', () => {
    // The rebuild hardcodes WHERE e.event_type = 'marathon'. If the live view's
    // predicate were ever narrower, rebuilding from the hardcoded one would
    // silently publish MORE rows to the anonymous internet — and the DROP a few
    // lines later destroys the original definition, so nobody could tell after.
    expect(doBlock).toMatch(/pg_get_viewdef/);
    expect(doBlock).toMatch(/predicate this rebuild does not reproduce/i);
  });

  it('repairs an ALREADY-DRIFTED view instead of pinning the exposure in place', () => {
    // The exclusion above only covers the fresh-rebuild branch. The other
    // branch reuses the live view's own column list VERBATIM — so an
    // environment that applied 20261204113700 and rebuilt this view before the
    // exclusion landed already publishes the three columns, and re-running
    // setup would freeze that definition forever. Filtering that list is not
    // the fix either: CREATE OR REPLACE VIEW may append columns, never drop
    // them, so it would simply error. The drifted view has to be dropped.
    expect(doBlock).toMatch(/DROP VIEW public\.marathon_events/);
    expect(doBlock).not.toMatch(/DROP VIEW[^;]*CASCADE/i);

    // …and only when it is actually carrying one of the three.
    const guard = doBlock!.slice(0, doBlock!.indexOf('DROP VIEW'));
    expect(guard).toMatch(/column_name IN \(\s*'cancellation_reason', 'cancelled_at', 'cancelled_by'\s*\)/);
  });
});

describe('the console banner is the only place the reason is shown, so it must not lie', () => {
  const page = readFileSync(join(process.cwd(), 'app/(routes)/events/[id]/page.tsx'), 'utf8');

  it('says something different when the read FAILED than when there was no reason', () => {
    // useEventCancellation sets retry:false and getCancellation throws on an RLS
    // denial or a network error, so a failure arrives as isLoading:false with
    // data:undefined — identical in shape to an empty result. Without a separate
    // branch the page claims "No reason was recorded for this cancellation",
    // which is a false statement about what a colleague did, made because the
    // query broke.
    expect(page).toMatch(/isError:\s*cancellationFailed/);
    expect(page).toMatch(/cancellationFailed\s*\n?\s*\?/);
    expect(page).toMatch(/could not be loaded/i);
    expect(page).toMatch(/has not been deleted/i);
  });

  it('still distinguishes "loading" from "no reason"', () => {
    expect(page).toMatch(/cancellationLoading/);
    expect(page).toMatch(/Loading the reason/);
  });
});

describe('the service must not build a browser client at module evaluation', () => {
  const svc = readFileSync(
    join(process.cwd(), 'lib/services/events/core/general-event-service.ts'),
    'utf8'
  );

  it('constructs the Supabase client inside a method, not in a static field', () => {
    // A static field initializer runs at MODULE EVALUATION, so the client would
    // be constructed during SSR/prerender of every route whose client tree
    // imports this file — where cookies and `document` do not exist. That turns
    // a bad query into an import-time throw that takes the whole event console
    // down, and pins one instance for the process lifetime.
    expect(svc).not.toMatch(/static\s+supabase\s*=\s*createClientSupabaseClient\(\)/);
    expect(svc).toMatch(/private static cancellations\(\)[\s\S]{0,400}createClientSupabaseClient\(\)/);
  });
});

describe('the cancel dialog must keep telling the organiser what cancelling releases', () => {
  const page = readFileSync(join(process.cwd(), 'app/(routes)/events/[id]/page.tsx'), 'utf8');

  it('names the rooms and the role assignments that the cascade takes away', () => {
    // tr_event_cancelled_cascade_release (20260417000004) cancels every linked
    // resource_reservations row and un-assigns every invited/accepted
    // event_human_roles row. Reassuring copy over that would be a lie.
    expect(page).toMatch(/released/i);
    expect(page).toMatch(/un-assigned/i);
  });

  it('says plainly that reinstating does not undo it', () => {
    expect(page).toMatch(/Reinstating the event later does not get any of this back/i);
  });

  it('no longer claims nothing is deleted', () => {
    // The old copy — "Everyone who already registered stays on the list —
    // nothing is deleted" — was true of registrations and false of everything
    // else the write sets off.
    expect(page).not.toMatch(/nothing is deleted/i);
  });

  it('no longer promises the organiser that their reason will be published', () => {
    // It was true when PR #3700 shipped and is false now. An organiser who
    // believes they are writing to the public writes a different sentence from
    // one writing to their colleagues, so this is not cosmetic.
    // The exact old promise: "will say the event is cancelled and show your
    // reason". The phrase survives only inside its own negation, asserted next.
    expect(page).not.toMatch(/cancelled and show your reason/i);
    expect(page).toMatch(/does <strong>not<\/strong> show your reason/i);
    expect(page).not.toMatch(/Required, and shown publicly/i);
  });

  it('tells the organiser plainly that the reason is internal', () => {
    expect(page).toMatch(/not<\/strong> shown on\s+the public event page/i);
    expect(page).toMatch(/colleagues at your institution\s+who can open this event will read it/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('GeneralEventService.updateStatus', () => {
  beforeEach(() => {
    getEvent.mockReset();
    updateEvent.mockReset();
  });

  it('refuses cancelled and names the door that takes a reason', async () => {
    await expect(GeneralEventService.updateStatus('e1', 'cancelled')).rejects.toThrow(
      /cancel\(\)/
    );
    expect(updateEvent).not.toHaveBeenCalled();
  });

  it('still reinstates a cancelled event back to live', async () => {
    getEvent.mockResolvedValue(eventWith({ status: 'cancelled' }));
    updateEvent.mockResolvedValue(eventWith({ status: 'live' }));

    await GeneralEventService.updateStatus('e1', 'live');

    expect(updateEvent).toHaveBeenCalledWith('e1', { status: 'live' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Appended at the END of the file deliberately: the sibling PR
// feat/events-cancel-public-wording rewrites the middle of this file, and a
// block added there would collide with it for no reason.

describe('the reinstate path must carry the same warning the cancel path does', () => {
  const page = readFileSync(join(process.cwd(), 'app/(routes)/events/[id]/page.tsx'), 'utf8');

  it('is a confirm dialog, not a bare button with a tooltip', () => {
    // A `title` tooltip does not exist on a phone and is attached to the very
    // button it is warning about. Reinstating is allowed; doing it unwarned is
    // what changed.
    expect(page).toContain('function ReinstateEventDialog');
    expect(page).toContain('<ReinstateEventDialog');
  });

  it('says the released rooms and the un-assigned people do not come back', () => {
    expect(page).toMatch(/The bookings and the people do NOT come back/);
    expect(page).toMatch(/whoever was next in line for each one has already been given/i);
    expect(page).toMatch(/They are not re-invited/i);
  });

  it('offers a way out of the dialog that changes nothing', () => {
    expect(page).toMatch(/Leave it cancelled/);
  });

  it('does not leave the old tooltip behind as a second, quieter warning', () => {
    // The tooltip is what this replaces. Keeping both would mean two copies of
    // the cascade warning drifting apart.
    expect(page).not.toMatch(/Reinstate this event — it becomes visible and open again/);
  });
});
