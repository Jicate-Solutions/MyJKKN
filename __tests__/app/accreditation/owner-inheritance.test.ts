import { describe, it, expect } from 'vitest';
import {
  resolveMetricOwners,
  tallyOwnership,
  tallyByBody,
  findBodyOwnerRow,
  findExplicitOwnerRow,
  metricCodesInCategory,
  categoriesForBody,
  bodyCodes,
  ownerSourceLabel,
  canAnswerAssignment,
  isAssignedTo,
  shouldSkipAssign,
  type OwnerRow,
  type FrameworkMetric,
  type AssignmentStatus,
} from '@/app/(routes)/accreditation/manage/owners/_lib/owner-inheritance';

// ---------------------------------------------------------------------------
// Shape mirrors production, verified 2026-08-02: sh_accreditation_metrics holds
// 107 rows keyed by metric_type (the awarding body) — NAAC 69, NIRF 17, NBA 9,
// then eight bodies with 1-2 each. accreditation_metric_owners holds 0 rows, so
// every case below starts from genuinely unowned and adds only what it tests.
//
// The single fact that carries this page: ONE row with metric_code NULL makes
// 69 NAAC metrics owned. If inheritance is wrong, the page either under-reports
// a real owner or invents one — both worse than the honest zero it replaces.
// ---------------------------------------------------------------------------

const INST = 'inst-pharmacy';
const OTHER_INST = 'inst-nursing';
const ALICE = 'user-alice';
const BOB = 'user-bob';

const metric = (
  metric_code: string,
  metric_type: string,
  category: string | null = null,
): FrameworkMetric => ({
  metric_code,
  metric_type,
  category,
  metric_name: `${metric_type} ${metric_code}`,
});

let rowSeq = 0;
const row = (over: Partial<OwnerRow> = {}): OwnerRow => ({
  id: `row-${(rowSeq += 1)}`,
  institution_id: INST,
  body_code: 'NAAC',
  metric_code: null,
  programme_id: null,
  owner_user_id: ALICE,
  assignment_status: 'pending' as AssignmentStatus,
  acknowledged_at: null,
  previous_owner_user_id: null,
  owner_changed_at: null,
  ...over,
});

const NAAC_1_2 = metric('1.2', 'NAAC', 'Attribute 1: Curriculum');
const NAAC_3_1_1 = metric('3.1.1', 'NAAC', 'Attribute 3: Infrastructure');
const NAAC_3_2_1 = metric('3.2.1', 'NAAC', 'Attribute 3: Infrastructure');
const NIRF_TLR = metric('TLR.1', 'NIRF', 'TLR');
const NBA_T1 = metric('T1.1', 'NBA', 'Tier 1');

const FRAMEWORK = [NAAC_1_2, NAAC_3_1_1, NAAC_3_2_1, NIRF_TLR, NBA_T1];

describe('resolveMetricOwners — the zero state', () => {
  it('reports every metric unowned when no rows exist', () => {
    const resolved = resolveMetricOwners(FRAMEWORK, [], INST);

    expect(resolved).toHaveLength(5);
    expect(resolved.every((r) => r.source === 'none')).toBe(true);
    expect(resolved.every((r) => r.ownerUserId === null)).toBe(true);
    expect(resolved.every((r) => r.isOwned === false)).toBe(true);
  });
});

describe('resolveMetricOwners — inheritance from the body owner', () => {
  it('one metric_code NULL row covers every metric of that body', () => {
    // The whole reason the column was made nullable: name one person for NAAC
    // instead of writing 69 near-identical rows.
    const resolved = resolveMetricOwners(FRAMEWORK, [row({ body_code: 'NAAC' })], INST);

    const naac = resolved.filter((r) => r.bodyCode === 'NAAC');
    expect(naac).toHaveLength(3);
    expect(naac.every((r) => r.source === 'inherited')).toBe(true);
    expect(naac.every((r) => r.ownerUserId === ALICE)).toBe(true);
    expect(naac.every((r) => r.isOwned)).toBe(true);
  });

  it('does not leak across bodies', () => {
    const resolved = resolveMetricOwners(FRAMEWORK, [row({ body_code: 'NAAC' })], INST);

    expect(resolved.find((r) => r.metricCode === 'TLR.1')!.source).toBe('none');
    expect(resolved.find((r) => r.metricCode === 'T1.1')!.source).toBe('none');
  });

  it('does not leak across institutions', () => {
    // role_has_institution_access can hand back rows for several campuses at
    // once; resolving against the wrong one would name an owner who was never
    // assigned here.
    const resolved = resolveMetricOwners(
      FRAMEWORK,
      [row({ institution_id: OTHER_INST })],
      INST,
    );

    expect(resolved.every((r) => r.source === 'none')).toBe(true);
  });

  it('ignores programme-scoped rows at institution level', () => {
    // A programme_id row owns one degree's NBA slice. It is a different axis,
    // and must not satisfy institution-level ownership.
    const resolved = resolveMetricOwners(
      FRAMEWORK,
      [row({ body_code: 'NBA', programme_id: 'prog-bpharm' })],
      INST,
    );

    expect(resolved.find((r) => r.metricCode === 'T1.1')!.source).toBe('none');
  });
});

describe('resolveMetricOwners — an explicit row overrides', () => {
  it('the exception wins over the inherited body owner', () => {
    const resolved = resolveMetricOwners(
      FRAMEWORK,
      [row({ owner_user_id: ALICE }), row({ metric_code: '3.1.1', owner_user_id: BOB })],
      INST,
    );

    const exception = resolved.find((r) => r.metricCode === '3.1.1')!;
    expect(exception.source).toBe('explicit');
    expect(exception.ownerUserId).toBe(BOB);

    // Its siblings still inherit — one exception must not detach the rest.
    const sibling = resolved.find((r) => r.metricCode === '3.2.1')!;
    expect(sibling.source).toBe('inherited');
    expect(sibling.ownerUserId).toBe(ALICE);
  });

  it('an explicit row works with no body owner present', () => {
    const resolved = resolveMetricOwners(
      FRAMEWORK,
      [row({ metric_code: '1.2', owner_user_id: BOB })],
      INST,
    );

    expect(resolved.find((r) => r.metricCode === '1.2')!.source).toBe('explicit');
    expect(resolved.find((r) => r.metricCode === '3.1.1')!.source).toBe('none');
  });
});

describe('resolveMetricOwners — a decline is not ownership', () => {
  it('a declined body assignment leaves its metrics unowned', () => {
    const resolved = resolveMetricOwners(
      FRAMEWORK,
      [row({ assignment_status: 'declined', acknowledged_at: '2026-08-02T10:00:00Z' })],
      INST,
    );

    const naac = resolved.filter((r) => r.bodyCode === 'NAAC');
    // The row is still the reason the cell renders — but nobody is accountable.
    expect(naac.every((r) => r.source === 'inherited')).toBe(true);
    expect(naac.every((r) => r.isOwned === false)).toBe(true);
  });

  it('an explicitly declined metric does NOT fall back to the body owner', () => {
    // Falling back would silently re-impose the person the named owner just
    // refused on behalf of — erasing the refusal this page exists to surface.
    const resolved = resolveMetricOwners(
      FRAMEWORK,
      [
        row({ owner_user_id: ALICE, assignment_status: 'confirmed', acknowledged_at: 'x' }),
        row({
          metric_code: '3.1.1',
          owner_user_id: BOB,
          assignment_status: 'declined',
          acknowledged_at: 'x',
        }),
      ],
      INST,
    );

    const declined = resolved.find((r) => r.metricCode === '3.1.1')!;
    expect(declined.source).toBe('explicit');
    expect(declined.ownerUserId).toBe(BOB);
    expect(declined.isOwned).toBe(false);
  });

  it('pending counts as assigned but not as accepted', () => {
    const resolved = resolveMetricOwners([NAAC_1_2], [row({ metric_code: '1.2' })], INST);
    expect(resolved[0].isOwned).toBe(true);
    expect(resolved[0].status).toBe('pending');
  });
});

describe('tallyOwnership', () => {
  it('counts the zero state as wholly unassigned', () => {
    const tally = tallyOwnership(resolveMetricOwners(FRAMEWORK, [], INST));

    expect(tally).toMatchObject({
      total: 5,
      assigned: 0,
      confirmed: 0,
      pending: 0,
      declined: 0,
      unassigned: 5,
      explicit: 0,
      inherited: 0,
    });
  });

  it('separates confirmed, pending and declined', () => {
    const resolved = resolveMetricOwners(
      FRAMEWORK,
      [
        row({ metric_code: '1.2', assignment_status: 'confirmed', acknowledged_at: 'x' }),
        row({ metric_code: '3.1.1', assignment_status: 'pending' }),
        row({ metric_code: '3.2.1', assignment_status: 'declined', acknowledged_at: 'x' }),
      ],
      INST,
    );
    const tally = tallyOwnership(resolved);

    expect(tally.confirmed).toBe(1);
    expect(tally.pending).toBe(1);
    expect(tally.declined).toBe(1);
    expect(tally.assigned).toBe(2); // confirmed + pending, never declined
    expect(tally.unassigned).toBe(2); // NIRF + NBA, which have no row at all
  });

  it('every metric lands in exactly one of assigned / declined / unassigned', () => {
    const resolved = resolveMetricOwners(
      FRAMEWORK,
      [
        row({ assignment_status: 'confirmed', acknowledged_at: 'x' }),
        row({
          metric_code: '3.1.1',
          assignment_status: 'declined',
          acknowledged_at: 'x',
        }),
      ],
      INST,
    );
    const t = tallyOwnership(resolved);

    expect(t.assigned + t.declined + t.unassigned).toBe(t.total);
    expect(t.confirmed + t.pending).toBe(t.assigned);
  });
});

describe('tallyByBody', () => {
  it('breaks the count down per body, largest framework first', () => {
    const resolved = resolveMetricOwners(FRAMEWORK, [row()], INST);
    const byBody = tallyByBody(resolved);

    expect(byBody.map((b) => b.bodyCode)).toEqual(['NAAC', 'NBA', 'NIRF']);
    expect(byBody[0].tally).toMatchObject({ total: 3, assigned: 3, unassigned: 0 });
    expect(byBody[1].tally).toMatchObject({ total: 1, assigned: 0, unassigned: 1 });
  });
});

describe('row lookups', () => {
  it('findBodyOwnerRow ignores per-metric rows', () => {
    const rows = [row({ metric_code: '1.2' })];
    expect(findBodyOwnerRow(rows, INST, 'NAAC')).toBeNull();
  });

  it('findExplicitOwnerRow ignores the body row', () => {
    const rows = [row({ metric_code: null })];
    expect(findExplicitOwnerRow(rows, INST, 'NAAC', '1.2')).toBeNull();
  });
});

describe('bulk assignment by category', () => {
  it('selects only the metrics of that body and category', () => {
    expect(
      metricCodesInCategory(FRAMEWORK, 'NAAC', 'Attribute 3: Infrastructure'),
    ).toEqual(['3.1.1', '3.2.1']);
  });

  it('treats near-duplicate category strings as distinct', () => {
    // Production really does carry both. Folding them together would assign
    // metrics the coordinator did not select.
    const metrics = [
      metric('9.1', 'NAAC', 'Attribute 9: Research'),
      metric('9.2', 'NAAC', 'Attribute 9: Research & Innovation Outcomes'),
    ];

    expect(metricCodesInCategory(metrics, 'NAAC', 'Attribute 9: Research')).toEqual([
      '9.1',
    ]);
    expect(categoriesForBody(metrics, 'NAAC')).toEqual([
      'Attribute 9: Research',
      'Attribute 9: Research & Innovation Outcomes',
    ]);
  });

  it('skips metrics with no category', () => {
    expect(categoriesForBody([metric('X', 'UGC', null)], 'UGC')).toEqual([]);
  });
});

describe('bodyCodes', () => {
  it('orders bodies by how many metrics they carry', () => {
    expect(bodyCodes(FRAMEWORK)).toEqual(['NAAC', 'NBA', 'NIRF']);
  });
});

describe('canAnswerAssignment — the buttons must be reachable at BOTH levels', () => {
  // The defect this covers: Accept/Decline existed only in the body-owner table,
  // so a metric-level assignment (and every row "assign a whole category" writes)
  // landed as pending with no control anywhere on the page to answer it.
  it('offers the pair on an explicit pending row addressed to me', () => {
    const resolved = resolveMetricOwners(
      [NAAC_3_1_1],
      [row({ metric_code: '3.1.1', owner_user_id: BOB })],
      INST,
    );

    expect(resolved[0].source).toBe('explicit');
    expect(canAnswerAssignment(resolved[0], BOB)).toBe(true);
  });

  it('offers nothing to anyone but the named person', () => {
    const resolved = resolveMetricOwners(
      [NAAC_3_1_1],
      [row({ metric_code: '3.1.1', owner_user_id: BOB })],
      INST,
    );

    expect(canAnswerAssignment(resolved[0], ALICE)).toBe(false);
    expect(canAnswerAssignment(resolved[0], null)).toBe(false);
    expect(canAnswerAssignment(resolved[0], undefined)).toBe(false);
  });

  it('does NOT duplicate the body row pair onto every inherited metric', () => {
    // An inherited row's `row` is the body-level row, already answerable in the
    // Body owners table. Rendering it per metric would put one pair per metric
    // on screen, all driving the same single write.
    const resolved = resolveMetricOwners(FRAMEWORK, [row({ owner_user_id: ALICE })], INST);
    const naac = resolved.filter((r) => r.bodyCode === 'NAAC');

    expect(naac).toHaveLength(3);
    expect(naac.every((r) => r.source === 'inherited')).toBe(true);
    expect(naac.every((r) => canAnswerAssignment(r, ALICE) === false)).toBe(true);
  });

  it('stops offering once the row has been answered', () => {
    const accepted = resolveMetricOwners(
      [NAAC_3_1_1],
      [
        row({
          metric_code: '3.1.1',
          owner_user_id: BOB,
          assignment_status: 'confirmed',
          acknowledged_at: 'x',
        }),
      ],
      INST,
    );
    const declined = resolveMetricOwners(
      [NAAC_3_1_1],
      [
        row({
          metric_code: '3.1.1',
          owner_user_id: BOB,
          assignment_status: 'declined',
          acknowledged_at: 'x',
        }),
      ],
      INST,
    );

    expect(canAnswerAssignment(accepted[0], BOB)).toBe(false);
    expect(canAnswerAssignment(declined[0], BOB)).toBe(false);
  });

  it('offers nothing on a metric nobody owns', () => {
    const resolved = resolveMetricOwners([NAAC_3_1_1], [], INST);
    expect(resolved[0].source).toBe('none');
    expect(canAnswerAssignment(resolved[0], BOB)).toBe(false);
  });
});

describe('isAssignedTo — the "Assigned to me" view', () => {
  // A PENDING row counts as owned, so it drops out of the 'unassigned' view the
  // page opens on. Without this filter the named person has no path to their own
  // pending rows short of scanning all 107.
  it('finds a pending metric addressed to me that the default view hides', () => {
    const resolved = resolveMetricOwners(
      FRAMEWORK,
      [row({ metric_code: '3.1.1', owner_user_id: BOB })],
      INST,
    );
    const mine = resolved.filter((r) => isAssignedTo(r, BOB));

    expect(mine.map((r) => r.metricCode)).toEqual(['3.1.1']);
    // The row this test exists for: owned, therefore invisible under 'unassigned'.
    expect(mine[0].isOwned).toBe(true);
    expect(resolved.filter((r) => !r.isOwned).map((r) => r.metricCode)).not.toContain(
      '3.1.1',
    );
  });

  it('includes inherited metrics, so a body owner sees their whole scope', () => {
    const resolved = resolveMetricOwners(FRAMEWORK, [row({ owner_user_id: ALICE })], INST);
    expect(resolved.filter((r) => isAssignedTo(r, ALICE))).toHaveLength(3);
  });

  it('keeps a declined row in view — it is still addressed to them', () => {
    const resolved = resolveMetricOwners(
      [NAAC_3_1_1],
      [
        row({
          metric_code: '3.1.1',
          owner_user_id: BOB,
          assignment_status: 'declined',
          acknowledged_at: 'x',
        }),
      ],
      INST,
    );
    expect(isAssignedTo(resolved[0], BOB)).toBe(true);
    expect(resolved[0].isOwned).toBe(false);
  });

  it('shows nothing to a signed-out or unnamed viewer', () => {
    const resolved = resolveMetricOwners(FRAMEWORK, [row({ owner_user_id: ALICE })], INST);
    expect(resolved.filter((r) => isAssignedTo(r, null))).toHaveLength(0);
    expect(resolved.filter((r) => isAssignedTo(r, BOB))).toHaveLength(0);
  });
});

describe('shouldSkipAssign — a decline must be re-sendable', () => {
  it('skips re-picking the person who already holds a live assignment', () => {
    expect(shouldSkipAssign(row({ owner_user_id: ALICE }), ALICE)).toBe(true);
    expect(
      shouldSkipAssign(
        row({ owner_user_id: ALICE, assignment_status: 'confirmed', acknowledged_at: 'x' }),
        ALICE,
      ),
    ).toBe(true);
  });

  it('does NOT skip re-picking the person who declined', () => {
    // Skipping wrote nothing and raised no toast, so a refusal was stuck: the
    // only route back to pending was to hand the metric to somebody else and
    // then hand it back.
    expect(
      shouldSkipAssign(
        row({ owner_user_id: ALICE, assignment_status: 'declined', acknowledged_at: 'x' }),
        ALICE,
      ),
    ).toBe(false);
  });

  it('never skips a genuine change of owner, whatever the status', () => {
    expect(shouldSkipAssign(row({ owner_user_id: ALICE }), BOB)).toBe(false);
    expect(
      shouldSkipAssign(
        row({ owner_user_id: ALICE, assignment_status: 'declined', acknowledged_at: 'x' }),
        BOB,
      ),
    ).toBe(false);
  });

  it('never skips a first assignment', () => {
    expect(shouldSkipAssign(null, ALICE)).toBe(false);
    expect(shouldSkipAssign(undefined, ALICE)).toBe(false);
  });
});

describe('ownerSourceLabel', () => {
  it('names the body an inherited owner came from', () => {
    const resolved = resolveMetricOwners([NAAC_1_2], [row()], INST);
    expect(ownerSourceLabel(resolved[0])).toBe('via NAAC owner');
  });

  it('marks an explicit exception as set for that metric', () => {
    const resolved = resolveMetricOwners([NAAC_1_2], [row({ metric_code: '1.2' })], INST);
    expect(ownerSourceLabel(resolved[0])).toBe('Set for this metric');
  });
});
