// __tests__/campus-walk/scoreboard.test.ts
// ============================================================================
// The Campus Walk boards, tested at the level of the RULINGS rather than the
// arithmetic. Each block below corresponds to something a person decided and
// which a future refactor could quietly undo:
//
//   D9  — departments, never named people (and no one-person department)
//   D9  — a department is not charged for time it could not end
//   D12 — a day with no reading is never a zero, and the gap is not a failure
//   D13 — the symptom/system split, and when a run of symptoms is visible
//   D9  — an unowned area names the kind of work, never the unreachable person
//
// These are pure functions, so none of this needs a database or a browser.
// ============================================================================

import { describe, expect, it } from 'vitest';
import {
  areaCellKey,
  buildCoverageBoard,
  buildFixBoard,
  buildOwnershipBoard,
  buildSplitBoard,
  daysToVerifiedClosure,
  describeStepFeed,
  isVerifiedClosure,
  LAST_READING_DATE_OUTSIDE_MYJKKN,
  MIN_DISTINCT_FIXERS_TO_SHOW_A_DEPARTMENT,
  roundStartedAt,
  STEP_GOAL_PER_DAY,
  SYSTEM_GAP_CANDIDATE_THRESHOLD,
  type StaffDepartmentIndex,
  type StepDay,
  type WalkTaskRow
} from '@/lib/campus-walk/scoreboard';

// ── Fixtures ─────────────────────────────────────────────────────────────────

let seq = 0;

function task(overrides: Partial<WalkTaskRow> & { metadata?: Record<string, any> }): WalkTaskRow {
  seq += 1;
  const { metadata, ...rest } = overrides;
  return {
    id: `task-${seq}`,
    title: `Condition ${seq}`,
    status_key: 'todo',
    is_blocked: false,
    due_date: null,
    completed_at: null,
    created_at: '2026-08-01T09:00:00.000Z',
    owner_staff_id: null,
    ...rest,
    metadata: { source: 'campus-walk', kind: 'symptom', ...(metadata ?? {}) }
  };
}

/** A task that was fixed and whose fix photo was approved (D4). */
function closed(
  overrides: Partial<WalkTaskRow> & { metadata?: Record<string, any> } = {}
): WalkTaskRow {
  const { metadata, ...rest } = overrides;
  return task({
    status_key: 'done',
    completed_at: '2026-08-03T09:00:00.000Z',
    ...rest,
    metadata: {
      fix: { submitted_at: '2026-08-03T08:00:00.000Z', approval: { state: 'approved' } },
      ...(metadata ?? {})
    }
  });
}

function staffIndex(entries: Array<[string, string | null, string | null]>): StaffDepartmentIndex {
  const m: StaffDepartmentIndex = new Map();
  for (const [staffId, departmentId, departmentName] of entries) {
    m.set(staffId, { departmentId, departmentName });
  }
  return m;
}

const NOW = new Date('2026-09-03T12:00:00.000Z');

// ── D9 — departments, never named people ─────────────────────────────────────

describe('D9 — the fixing board names departments and never people', () => {
  it('carries no team member id or person field anywhere in its output', () => {
    const rows = [
      closed({ owner_staff_id: 'staff-a' }),
      closed({ owner_staff_id: 'staff-b' }),
      closed({ owner_staff_id: 'staff-c' })
    ];
    const board = buildFixBoard(
      rows,
      staffIndex([
        ['staff-a', 'dept-1', 'Maintenance'],
        ['staff-b', 'dept-1', 'Maintenance'],
        ['staff-c', 'dept-1', 'Maintenance']
      ]),
      NOW
    );

    // The strongest available assertion: serialise the whole board and prove
    // no identifier that could resolve to a person survives into it.
    const serialised = JSON.stringify(board);
    expect(serialised).not.toContain('staff-a');
    expect(serialised).not.toContain('staff-b');
    expect(serialised).not.toContain('staff-c');
    expect(serialised).not.toContain('owner_staff_id');

    const row = board.rows.find((r) => r.departmentName === 'Maintenance');
    expect(row?.verifiedClosures).toBe(3);
  });

  it('folds a department with only one fixer into an aggregate row', () => {
    const rows = [
      closed({ owner_staff_id: 'solo' }),
      closed({ owner_staff_id: 'solo' }),
      closed({ owner_staff_id: 'pair-1' }),
      closed({ owner_staff_id: 'pair-2' })
    ];
    const board = buildFixBoard(
      rows,
      staffIndex([
        ['solo', 'dept-solo', 'Horticulture'],
        ['pair-1', 'dept-pair', 'Maintenance'],
        ['pair-2', 'dept-pair', 'Maintenance']
      ]),
      NOW
    );

    // The one-person department must not appear by name — that row would be
    // one individual's personal record with a department label on it.
    expect(board.rows.map((r) => r.departmentName)).not.toContain('Horticulture');
    expect(board.suppressedDepartmentCount).toBe(1);

    // ...but its work is still counted, not dropped.
    const bucket = board.rows.find((r) => r.key === '__too_few_fixers__');
    expect(bucket?.verifiedClosures).toBe(2);
    expect(board.totals.verifiedClosures).toBe(4);

    // And the named department is unaffected.
    expect(board.rows.find((r) => r.departmentName === 'Maintenance')?.verifiedClosures).toBe(2);
  });

  it('honours the documented minimum-fixer threshold', () => {
    expect(MIN_DISTINCT_FIXERS_TO_SHOW_A_DEPARTMENT).toBeGreaterThanOrEqual(2);
  });

  it('buckets tasks with no owner rather than discarding them', () => {
    const board = buildFixBoard([closed({ owner_staff_id: null })], staffIndex([]), NOW);
    const bucket = board.rows.find((r) => r.key === '__unassigned__');
    expect(bucket?.verifiedClosures).toBe(1);
    expect(bucket?.isBucket).toBe(true);
    expect(bucket?.bucketReason).toBeTruthy();
    expect(board.totals.verifiedClosures).toBe(1);
  });

  it('ignores project tasks that are not campus walk rows', () => {
    const foreign = task({ owner_staff_id: 'staff-a' });
    foreign.metadata = { source: 'meetings' };
    const board = buildFixBoard([foreign], staffIndex([['staff-a', 'd', 'Maintenance']]), NOW);
    expect(board.rows).toHaveLength(0);
  });
});

// ── D9 — fairness (guardrail G1) ─────────────────────────────────────────────

describe('D9 — a department is never charged for time it could not end', () => {
  it('counts a job marked done WITHOUT an approved fix photo as not closed', () => {
    const noPhoto = task({ status_key: 'done', completed_at: '2026-08-02T09:00:00.000Z' });
    expect(isVerifiedClosure(noPhoto)).toBe(false);

    const board = buildFixBoard([noPhoto], staffIndex([]), NOW);
    expect(board.totals.verifiedClosures).toBe(0);
  });

  it('reports waiting-on-approval separately from open work', () => {
    const waiting = task({
      status_key: 'review',
      owner_staff_id: 's1',
      metadata: { fix: { approval: { state: 'awaiting_approval' } } }
    });
    const board = buildFixBoard(
      [waiting, task({ owner_staff_id: 's2' })],
      staffIndex([
        ['s1', 'd', 'Maintenance'],
        ['s2', 'd', 'Maintenance']
      ]),
      NOW
    );
    const row = board.rows.find((r) => r.departmentName === 'Maintenance');
    expect(row?.openJobs).toBe(2);
    expect(row?.awaitingApproval).toBe(1);
  });

  it('reports blocked jobs separately (D8 — waiting on money or a return)', () => {
    const board = buildFixBoard(
      [
        task({ owner_staff_id: 's1', is_blocked: true }),
        task({ owner_staff_id: 's2', is_blocked: false })
      ],
      staffIndex([
        ['s1', 'd', 'Maintenance'],
        ['s2', 'd', 'Maintenance']
      ]),
      NOW
    );
    expect(board.rows.find((r) => r.departmentName === 'Maintenance')?.blockedJobs).toBe(1);
  });

  it('subtracts paused days from how long a fix took', () => {
    const paused = closed({
      created_at: '2026-08-01T00:00:00.000Z',
      completed_at: '2026-08-11T00:00:00.000Z',
      metadata: {
        fix: { approval: { state: 'approved' } },
        sla: { paused_days_total: 6 }
      }
    });
    // 10 calendar days, 6 of them paused waiting on a budget decision.
    expect(daysToVerifiedClosure(paused)).toBe(4);
  });

  it('never reports a negative duration when paused days exceed the elapsed time', () => {
    const odd = closed({
      created_at: '2026-08-01T00:00:00.000Z',
      completed_at: '2026-08-02T00:00:00.000Z',
      metadata: { fix: { approval: { state: 'approved' } }, sla: { paused_days_total: 99 } }
    });
    expect(daysToVerifiedClosure(odd)).toBe(0);
  });

  it('measures a reopened job from its latest report, not its first (D7)', () => {
    const reopened = closed({
      created_at: '2026-01-01T00:00:00.000Z',
      completed_at: '2026-08-04T00:00:00.000Z',
      metadata: {
        fix: { approval: { state: 'approved' } },
        occurrence_count: 3,
        occurrences: [
          { occurrence_number: 2, at: '2026-05-01T00:00:00.000Z' },
          { occurrence_number: 3, at: '2026-08-02T00:00:00.000Z' }
        ]
      }
    });
    expect(roundStartedAt(reopened)).toBe('2026-08-02T00:00:00.000Z');
    // Two days for the round that just closed — not seven months.
    expect(daysToVerifiedClosure(reopened)).toBe(2);
  });

  it('uses a middle value so one unusual job cannot swing a department', () => {
    const rows = [
      closed({
        owner_staff_id: 's1',
        created_at: '2026-08-01T00:00:00.000Z',
        completed_at: '2026-08-02T00:00:00.000Z'
      }),
      closed({
        owner_staff_id: 's2',
        created_at: '2026-08-01T00:00:00.000Z',
        completed_at: '2026-08-03T00:00:00.000Z'
      }),
      closed({
        owner_staff_id: 's1',
        created_at: '2026-08-01T00:00:00.000Z',
        completed_at: '2026-11-01T00:00:00.000Z'
      })
    ];
    const board = buildFixBoard(
      rows,
      staffIndex([
        ['s1', 'd', 'Maintenance'],
        ['s2', 'd', 'Maintenance']
      ]),
      NOW
    );
    // Durations are 1, 2 and 92 days. A mean would say 31.7; the middle is 2.
    expect(board.rows.find((r) => r.departmentName === 'Maintenance')?.medianDaysToClose).toBe(2);
  });

  it('counts an open job past its date as overdue, and a closed one never', () => {
    const overdue = task({ owner_staff_id: 's1', due_date: '2026-08-01' });
    const lateButClosed = closed({ owner_staff_id: 's2', due_date: '2026-08-01' });
    const board = buildFixBoard(
      [overdue, lateButClosed],
      staffIndex([
        ['s1', 'd', 'Maintenance'],
        ['s2', 'd', 'Maintenance']
      ]),
      NOW
    );
    expect(board.rows.find((r) => r.departmentName === 'Maintenance')?.overdueJobs).toBe(1);
  });

  it('does not call a job due TODAY overdue', () => {
    // D6 gives an unsafe condition a 0-day due date — due today, deliberately.
    // Comparing instants rather than days would show every urgent job as late
    // the moment it was reported.
    const dueToday = task({ owner_staff_id: 's1', due_date: '2026-09-03' });
    const dueYesterday = task({ owner_staff_id: 's2', due_date: '2026-09-02' });
    const board = buildFixBoard(
      [dueToday, dueYesterday],
      staffIndex([
        ['s1', 'd', 'Maintenance'],
        ['s2', 'd', 'Maintenance']
      ]),
      NOW // 2026-09-03T12:00:00Z — midday on the day the first job is due
    );
    expect(board.rows.find((r) => r.departmentName === 'Maintenance')?.overdueJobs).toBe(1);
  });

  it('never counts a job with no due date as overdue', () => {
    // Two fixers, or the department is folded into the privacy bucket and
    // there is no named row to assert on.
    const board = buildFixBoard(
      [
        task({ owner_staff_id: 's1', due_date: null }),
        task({ owner_staff_id: 's2', due_date: null })
      ],
      staffIndex([
        ['s1', 'd', 'Maintenance'],
        ['s2', 'd', 'Maintenance']
      ]),
      NOW
    );
    expect(board.rows.find((r) => r.departmentName === 'Maintenance')?.overdueJobs).toBe(0);
  });
});

// ── D12 — a day with no reading is never a zero ──────────────────────────────

describe('D12 — an absent step reading is never rendered as zero', () => {
  const stepDay = (step_date: string, steps: number): StepDay => ({
    step_date,
    steps,
    source: 'test',
    recorded_at: `${step_date}T06:00:00.000Z`
  });

  it('reports "never reported" when MyJKKN holds nothing at all', () => {
    const feed = describeStepFeed([], NOW);
    expect(feed.state).toBe('never_reported');
    expect(feed.latestReadingDate).toBeNull();
    expect(feed.lastReadingDateOutsideMyJKKN).toBe(LAST_READING_DATE_OUTSIDE_MYJKKN);
  });

  it('describes the gap as no reading taken, never as a system failure', () => {
    // The ruling: the sync job was verified alive on 2026-09-03 and logged
    // "0 written, 3 days with no ring data". Saying the feed is broken would
    // send somebody to debug working software and would excuse a gap that is
    // not a software gap.
    const forbidden = /\b(broken|down|failing|failed|failure|outage|not working|offline)\b/i;
    for (const feed of [
      describeStepFeed([], NOW),
      describeStepFeed([stepDay('2026-04-18', 12_000)], NOW)
    ]) {
      expect(`${feed.headline} ${feed.detail}`).not.toMatch(forbidden);
    }
  });

  it('names the date of the last reading when one exists', () => {
    const feed = describeStepFeed([stepDay('2026-08-30', 12_000)], NOW);
    expect(feed.state).toBe('stale');
    expect(feed.latestReadingDate).toBe('2026-08-30');
    expect(feed.headline).toContain('2026-08-30');
    expect(feed.daysSinceLatestReading).toBe(4);
  });

  it('lists only days that have a reading — the range is never padded', () => {
    const board = buildCoverageBoard(
      [],
      [stepDay('2026-09-01', 21_000), stepDay('2026-09-03', 9_000)],
      NOW
    );
    // 2026-09-02 has no reading. It must be absent, not present as zero.
    expect(board.days.map((d) => d.date)).toEqual(['2026-09-01', '2026-09-03']);
    expect(board.days.some((d) => d.steps === 0)).toBe(false);
    expect(board.daysWithAReading).toBe(2);
  });

  it('measures days against the 20,000 objective', () => {
    expect(STEP_GOAL_PER_DAY).toBe(20_000);
    const board = buildCoverageBoard(
      [],
      [stepDay('2026-09-01', 20_000), stepDay('2026-09-02', 19_999)],
      NOW
    );
    expect(board.daysMeetingGoal).toBe(1);
  });

  it('reports no typical day rather than zero when there are no readings', () => {
    const board = buildCoverageBoard([], [], NOW);
    expect(board.medianStepsOnDaysWithAReading).toBeNull();
    expect(board.daysWithAReading).toBe(0);
  });
});

// ── D12 — area coverage from the observations already recorded ───────────────

describe('D12 — area coverage is derived, and a missing location is counted', () => {
  it('groups nearby observations into the same spot and distant ones apart', () => {
    const a = areaCellKey({ lat: 11.4521, lng: 77.8034 });
    const aNudged = areaCellKey({ lat: 11.45213, lng: 77.80338 });
    const b = areaCellKey({ lat: 11.4560, lng: 77.8090 });
    expect(a).toBe(aNudged);
    expect(a).not.toBe(b);
  });

  it('returns null for an observation saved without a location fix', () => {
    expect(areaCellKey(null)).toBeNull();
    expect(areaCellKey(undefined)).toBeNull();
    expect(areaCellKey({})).toBeNull();
    expect(areaCellKey({ lat: 'x', lng: 'y' })).toBeNull();
  });

  it('counts location-less observations instead of hiding them', () => {
    const board = buildCoverageBoard(
      [
        task({ metadata: { geo: { lat: 11.4521, lng: 77.8034 }, institution_id: 'inst-1', category: 'Cleanliness' } }),
        task({ metadata: { geo: { lat: 11.4521, lng: 77.8034 }, institution_id: 'inst-1', category: 'cleanliness' } }),
        task({ metadata: { geo: null, institution_id: 'inst-2', category: 'Lighting' } })
      ],
      [],
      NOW
    );
    expect(board.coverage.observations).toBe(3);
    expect(board.coverage.distinctAreas).toBe(1);
    expect(board.coverage.observationsWithoutLocation).toBe(1);
    expect(board.coverage.distinctInstitutions).toBe(2);
    // Category matching is case-insensitive, so "Cleanliness" and
    // "cleanliness" are one kind of problem and not two.
    expect(board.coverage.distinctCategories).toBe(2);
  });

  it('still reports area coverage when there are no step readings at all', () => {
    const board = buildCoverageBoard(
      [task({ metadata: { geo: { lat: 11.45, lng: 77.8 } } })],
      [],
      NOW
    );
    expect(board.feed.state).toBe('never_reported');
    expect(board.coverage.distinctAreas).toBe(1);
  });
});

// ── D13 — the symptom / system split ─────────────────────────────────────────

describe('D13 — one action versus a missing system', () => {
  it('splits on the kind already recorded at intake', () => {
    const board = buildSplitBoard([
      task({ metadata: { kind: 'symptom' } }),
      task({ metadata: { kind: 'symptom' } }),
      task({ metadata: { kind: 'system_gap' } })
    ]);
    expect(board.symptomCount).toBe(2);
    expect(board.systemGapCount).toBe(1);
  });

  it('treats an unrecognised kind as a symptom, the overwhelmingly common case', () => {
    const board = buildSplitBoard([task({ metadata: { kind: undefined } })]);
    expect(board.symptomCount).toBe(1);
    expect(board.systemGapCount).toBe(0);
  });

  it('surfaces one problem reported at or above the threshold', () => {
    const board = buildSplitBoard([
      task({ title: 'Block C toilets', metadata: { occurrence_count: SYSTEM_GAP_CANDIDATE_THRESHOLD } }),
      task({ title: 'Corridor light', metadata: { occurrence_count: 2 } })
    ]);
    expect(board.repeatingSymptoms.map((s) => s.title)).toEqual(['Block C toilets']);
    expect(board.repeatingSymptoms[0].occurrenceCount).toBe(SYSTEM_GAP_CANDIDATE_THRESHOLD);
  });

  it('surfaces a run of separate problems sharing one kind of cause', () => {
    const board = buildSplitBoard([
      task({ metadata: { category: 'Cleanliness' } }),
      task({ metadata: { category: 'cleanliness' } }),
      task({ metadata: { category: 'CLEANLINESS' } }),
      task({ metadata: { category: 'Lighting' } })
    ]);
    expect(board.candidateClusters.map((c) => c.category)).toEqual(['cleanliness']);
    expect(board.candidateClusters[0].symptomCount).toBe(3);
  });

  it('stops flagging a kind of problem once a wider gap has been raised for it', () => {
    const board = buildSplitBoard([
      task({ metadata: { category: 'Cleanliness' } }),
      task({ metadata: { category: 'Cleanliness' } }),
      task({ metadata: { category: 'Cleanliness' } }),
      task({ metadata: { kind: 'system_gap', category: 'Cleanliness' } })
    ]);
    expect(board.candidateClusters).toHaveLength(0);
  });

  it('does not guess that two differently-worded reports are the same thing', () => {
    // repeats.ts refuses to auto-match; clusters must not reintroduce that
    // guess. Different categories stay separate however similar they read.
    const board = buildSplitBoard([
      task({ metadata: { category: 'Toilet cleaning' } }),
      task({ metadata: { category: 'Toilet cleanliness' } }),
      task({ metadata: { category: 'Washroom cleaning' } })
    ]);
    expect(board.candidateClusters).toHaveLength(0);
  });

  it('ignores project tasks belonging to other lanes', () => {
    const foreign = task({});
    foreign.metadata = { source: 'meetings', kind: 'symptom' };
    const board = buildSplitBoard([foreign]);
    expect(board.symptomCount).toBe(0);
  });
});

// ── Where nobody is attached ────────────────────────────────────────────────
//
// The signal that was recorded and told to nobody. Two conditions belong to
// it and they are deliberately NOT the same as `NOBODY WAS PAGED`, which
// keeps its own factual meaning (nothing was delivered to anyone) in
// lib/campus-walk/urgent-alert.ts, untouched by any of this.

describe('an unowned area is surfaced, and it names work rather than people', () => {
  it('counts the flag intake already writes, and groups it by kind of work', () => {
    const board = buildOwnershipBoard([
      task({
        metadata: {
          accountable_routed_to_eao_no_owner: true,
          category: 'Housekeeping / Cleanliness'
        }
      }),
      task({
        metadata: {
          accountable_routed_to_eao_no_owner: true,
          category: 'housekeeping / cleanliness'
        }
      }),
      task({ metadata: { accountable_routed_to_eao_no_owner: true, category: 'Electrical' } }),
      task({ metadata: { accountable_routed_to_eao_no_owner: false, category: 'Plumbing' } })
    ]);

    expect(board.observations).toBe(4);
    expect(board.unowned).toBe(3);
    // Biggest first, and one spelling of a kind of work, not two.
    expect(board.unownedByCategory.map((r) => r.category)).toEqual([
      'Housekeeping / Cleanliness',
      'Electrical'
    ]);
    expect(board.unownedByCategory[0].unownedCount).toBe(2);
  });

  it('never carries a person — the row shape has nowhere to put one (D9)', () => {
    const board = buildOwnershipBoard([
      task({
        owner_staff_id: 'staff-row-a',
        metadata: {
          accountable_routed_to_eao_no_owner: true,
          category: 'Electrical',
          unsafe: true,
          urgent_alert: {
            attempted: true,
            delivered: 1,
            usedFallback: false,
            attempts: [
              { profile_id: 'person-who-was-not-reached', role: 'accountable', ok: false },
              { profile_id: 'director-1', role: 'director_copy', ok: true }
            ]
          }
        }
      })
    ]);

    const serialised = JSON.stringify(board);
    expect(serialised).not.toContain('person-who-was-not-reached');
    expect(serialised).not.toContain('director-1');
    expect(serialised).not.toContain('staff-row-a');
    expect(serialised).not.toContain('profile_id');
  });

  it('separates "nobody is attached" from "the owner could not be reached"', () => {
    // An owner WAS resolved and reachable; only the ownership flag is absent.
    const board = buildOwnershipBoard([
      task({
        metadata: {
          accountable_routed_to_eao_no_owner: false,
          unsafe: true,
          urgent_alert: {
            attempted: true,
            delivered: 2,
            usedFallback: false,
            attempts: [
              { profile_id: 'a', role: 'accountable', ok: true },
              { profile_id: 'd', role: 'director_copy', ok: true }
            ]
          }
        }
      })
    ]);
    expect(board.unowned).toBe(0);
    expect(board.unreachableOwners).toHaveLength(0);
  });

  it('catches the case a delivered Director copy hides (PR #3267)', () => {
    // The Accountable's own send failed while the standing Director copy
    // succeeded, so `delivered` is 1 and NOBODY WAS PAGED correctly stays
    // down. The person who must ACT was still not reached, and only this
    // surfaces it.
    const board = buildOwnershipBoard([
      task({
        title: 'Exposed wire, Block C',
        metadata: {
          category: 'Electrical',
          unsafe: true,
          urgent_alert: {
            attempted: true,
            delivered: 1,
            usedFallback: false,
            at: '2026-09-04T06:00:00.000Z',
            attempts: [
              { profile_id: 'a', role: 'accountable', ok: false, error: 'phone off' },
              { profile_id: 'd', role: 'director_copy', ok: true }
            ]
          }
        }
      })
    ]);

    expect(board.unreachableOwners).toHaveLength(1);
    expect(board.unreachableOwners[0].title).toBe('Exposed wire, Block C');
    expect(board.unreachableOwners[0].reason).toBe('send_failed');
    expect(board.unreachableOwners[0].someoneElseWasReached).toBe(true);
  });

  it('reads a Director standing in as the owner having no usable number', () => {
    const board = buildOwnershipBoard([
      task({
        metadata: {
          unsafe: true,
          urgent_alert: {
            attempted: true,
            delivered: 1,
            usedFallback: true,
            attempts: [{ profile_id: 'd', role: 'director_fallback', ok: true }]
          }
        }
      })
    ]);
    expect(board.unreachableOwners[0].reason).toBe('no_usable_number');
    expect(board.unreachableOwners[0].someoneElseWasReached).toBe(true);
  });

  it('says nothing about observations the urgent lane never ran for', () => {
    const board = buildOwnershipBoard([
      task({ metadata: { unsafe: false } }),
      task({ metadata: { unsafe: false, urgent_alert: { attempted: false, delivered: 0 } } })
    ]);
    expect(board.unreachableOwners).toHaveLength(0);
  });

  it('knows the difference between holes in the routing and no routing at all', () => {
    // TRUE means the list is simply every observation — there is nothing to
    // compare it against, and the screen says so in plain words instead of
    // implying a record of who-owns-what exists and has gaps in it.
    const everything = buildOwnershipBoard([
      task({ metadata: { accountable_routed_to_eao_no_owner: true, category: 'Electrical' } }),
      task({ metadata: { accountable_routed_to_eao_no_owner: true, category: 'Plumbing' } })
    ]);
    expect(everything.everyObservationIsUnowned).toBe(true);

    const holes = buildOwnershipBoard([
      task({ metadata: { accountable_routed_to_eao_no_owner: true, category: 'Electrical' } }),
      task({ metadata: { accountable_routed_to_eao_no_owner: false, category: 'Plumbing' } })
    ]);
    expect(holes.everyObservationIsUnowned).toBe(false);

    // No observations at all is not "everything is unowned".
    expect(buildOwnershipBoard([]).everyObservationIsUnowned).toBe(false);
  });

  it('counts unsafe reports and separate spots within a kind of work', () => {
    const board = buildOwnershipBoard([
      task({
        metadata: {
          accountable_routed_to_eao_no_owner: true,
          category: 'Electrical',
          unsafe: true,
          geo: { lat: 11.4445, lng: 77.7302 }
        }
      }),
      task({
        metadata: {
          accountable_routed_to_eao_no_owner: true,
          category: 'Electrical',
          unsafe: false,
          geo: { lat: 11.4445, lng: 77.7302 }
        }
      }),
      task({
        metadata: {
          accountable_routed_to_eao_no_owner: true,
          category: 'Electrical',
          unsafe: false,
          geo: null
        }
      })
    ]);

    const row = board.unownedByCategory[0];
    expect(row.unownedCount).toBe(3);
    expect(row.unsafeCount).toBe(1);
    // Two reports from one spot is one spot; a report with no location fix
    // adds none rather than inventing one.
    expect(row.distinctSpots).toBe(1);
  });

  it('keeps an uncategorised report rather than dropping it, and sorts it last', () => {
    const board = buildOwnershipBoard([
      task({ metadata: { accountable_routed_to_eao_no_owner: true, category: '  ' } }),
      task({ metadata: { accountable_routed_to_eao_no_owner: true, category: 'Electrical' } })
    ]);
    expect(board.unowned).toBe(2);
    expect(board.unownedByCategory.map((r) => r.category)).toEqual(['Electrical', null]);
  });

  it('ignores project tasks belonging to other lanes', () => {
    const foreign = task({});
    foreign.metadata = { source: 'meetings', accountable_routed_to_eao_no_owner: true };
    const board = buildOwnershipBoard([foreign]);
    expect(board.observations).toBe(0);
    expect(board.unowned).toBe(0);
  });
});
