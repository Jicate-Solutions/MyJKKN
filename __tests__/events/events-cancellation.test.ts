// __tests__/events/events-cancellation.test.ts
//
// Cover for the general-event CANCEL path: the transition map, the two display
// helpers that decide what the hub says, the hub's status filter, the service
// guard, and — the one that matters most — the promise that the public
// registration page still works against a production schema that does NOT have
// the cancellation columns yet.
//
// ─── THE DEPLOY-ORDER RULE THIS FILE ENFORCES ────────────────────────────────
//
// Code ships before migrations in this repo. Verified read-only against
// production 2026-09-13: `events.cancellation_reason` / `cancelled_at` /
// `cancelled_by` DO NOT EXIST (42703), and no event is in `cancelled` (55 rows:
// 27 live, 23 draft, 5 archived). PostgREST fails an entire select when one
// named column is missing, so naming them in the public page's select would
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

describe('public registration page — survives a schema without the migration', () => {
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
  });

  it('refuses a blank reason before touching the database', async () => {
    await expect(GeneralEventService.cancel('e1', '   ')).rejects.toThrow(/reason/i);
    expect(getEvent).not.toHaveBeenCalled();
    expect(updateEvent).not.toHaveBeenCalled();
  });

  it('refuses to cancel an event that is not live', async () => {
    getEvent.mockResolvedValue(eventWith({ status: 'draft' }));

    await expect(GeneralEventService.cancel('e1', 'Venue flooded')).rejects.toThrow(
      /Invalid status transition/
    );
    expect(updateEvent).not.toHaveBeenCalled();
  });

  it('writes status and the trimmed reason, and never sends cancelled_at/by', async () => {
    getEvent.mockResolvedValue(eventWith({ status: 'live' }));
    updateEvent.mockResolvedValue(eventWith({ status: 'cancelled' }));

    await GeneralEventService.cancel('e1', '  Venue flooded  ');

    expect(updateEvent).toHaveBeenCalledWith('e1', {
      status: 'cancelled',
      cancellation_reason: 'Venue flooded',
    });
    // The stamps belong to the trigger, from auth.uid() — a client must not be
    // able to name somebody else as the canceller.
    const [, payload] = updateEvent.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload).not.toHaveProperty('cancelled_at');
    expect(payload).not.toHaveProperty('cancelled_by');
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

describe('migration 20261204113700 — the trigger must stay compatible with every writer', () => {
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

  it('does not RAISE, so flows that cancel without a reason keep working', () => {
    // `events` is shared by general events, marathons, tournaments and
    // inductions. A table-wide requirement here becomes a runtime 23514 for
    // every other cancel path the moment this file is applied. The requirement
    // belongs to GeneralEventService.cancel() and the dialog.
    expect(code).not.toMatch(/RAISE\s+EXCEPTION/i);
    expect(code).not.toContain('23514');
  });

  it('still stamps who and when, and normalises the reason', () => {
    expect(sql).toMatch(/NEW\.cancelled_at\s*:=\s*now\(\)/);
    expect(sql).toMatch(/NEW\.cancelled_by\s*:=\s*auth\.uid\(\)/);
    expect(sql).toMatch(/nullif\s*\(\s*btrim/i);
  });

  it('only fires on the transition into cancelled, never on an already-cancelled row', () => {
    expect(sql).toMatch(/OLD\.status\s+IS\s+DISTINCT\s+FROM\s+'cancelled'/i);
  });

  it('locks the SECURITY DEFINER function away from anon', () => {
    expect(sql).toMatch(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.fn_events_stamp_cancellation\(\)\s+FROM\s+anon,\s*PUBLIC/i
    );
    expect(sql).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.fn_events_stamp_cancellation\(\)\s+TO\s+authenticated/i
    );
  });

  it('adds the columns without a NOT NULL that existing rows could not satisfy', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS cancellation_reason\s+TEXT/i);
    expect(sql).not.toMatch(/cancellation_reason\s+TEXT\s+NOT NULL/i);
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
    expect(page).toMatch(/not<\/strong> shown on the public event page/i);
    expect(page).toMatch(/Recorded for your team members/i);
  });
});

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
