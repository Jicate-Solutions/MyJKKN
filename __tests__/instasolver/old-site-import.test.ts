// __tests__/instasolver/old-site-import.test.ts
// ============================================================================
// The old InstaSolver site import (scripts/instasolver/import-old-site.ts).
//
// Every row here is SYNTHETIC. The real export holds names, emails and mobile
// numbers and must never be read by a test or committed.
//
// Pinned, because each one fails silently:
//   - college mapping, including the Main Office fallback and messy spacing;
//   - which old rows count as UNFINISHED (171 on the real export);
//   - an old 'Critical' row NEVER becomes an unsafe task (that would page phones);
//   - the 'Check if still broken' title on every unfinished job;
//   - the upsert never sends the task link or the Director's decision, so a
//     re-run cannot undo them;
//   - a task is never created twice (already linked, or created but not linked);
//   - --apply is refused without INSTASOLVER_IMPORT_CONFIRM=yes.
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import institutionMapJson from '../../scripts/instasolver/institution-map.json';
import {
  ISSUE_IMPORT_NEVER_WRITES,
  REQUIREMENT_IMPORT_NEVER_WRITES,
  STILL_BROKEN_PREFIX,
  assertApplyAllowed,
  buildIssueRow,
  buildRequirementRow,
  buildWalkTaskInput,
  cleanIssueCategory,
  cleanPlace,
  cleanRequirementCategory,
  isOpenIssue,
  mapInstitution,
  normaliseKey,
  parseArgs,
  reporterHasLeft,
  type CleanCategories,
  type CleanPlaces,
  type InstitutionMapFile,
  type MappingContext,
  type OldIssue,
} from '../../scripts/instasolver/lib/old-site-mapping';

vi.mock('@/lib/services/campus-walk/campus-walk-service', () => ({
  createWalkTask: vi.fn(async () => {
    throw new Error('the real createWalkTask must never run in a test');
  }),
}));

import { createTasks } from '../../scripts/instasolver/lib/create-tasks';

const institutions = institutionMapJson as unknown as InstitutionMapFile;
const MAIN_OFFICE = 'b962527f-97ce-4238-89ce-7b532d7c2bc6';
const DENTAL = 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5';

const places: CleanPlaces = {
  institution_rules: [
    { regex: 'dental', institution: 'Dental College & Hospital' },
    { regex: 'boys hos', institution: 'Boys Hostel' },
    { regex: 'main office|public|others', institution: 'Main Office & others' },
  ],
  generic_regex: '^(jkkn|ground floor|office)$',
  tamil_transliteration_hints: {},
  site_override_rules: [{ regex: 'canteen', site: 'Campus common areas' }],
  area_rules_by_site: {
    'Dental College & Hospital': [{ regex: 'ortho', area: 'Orthodontics' }],
  },
  generic_area_rules: [
    { regex: 'toilet|washroom', area: 'Toilets & washrooms' },
    { regex: 'class ?room', area: 'Classrooms' },
  ],
  mapping: {
    'Dental College & Hospital || ortho dept': { site: 'Dental College & Hospital', area: 'Orthodontics' },
  },
};

const categories: CleanCategories = {
  raw_to_clean: { 'Electrical Issue': 'Electrical', 'Hostel Issues': 'Other' },
  resort_by_keywords: ['Hostel Issues'],
  keyword_rules: [
    { group: 'Plumbing & water', regex: 'tap|leak' },
    { group: 'Electrical', regex: 'fan|light' },
  ],
  requirement_category_map: { 'Civil Related': 'Infrastructure', '': 'Other' },
};

const NOW = new Date('2026-10-01T00:00:00Z');

function ctx(overrides: Partial<MappingContext> = {}): MappingContext {
  return {
    institutions,
    places,
    categories,
    profileIdByEmail: new Map([['reporter.one@example.test', 'profile-1']]),
    oldNameByEmail: new Map([['fixer@example.test', 'Fixer Name']]),
    notesByIssue: new Map(),
    notesByRequirement: new Map(),
    now: NOW,
    ...overrides,
  };
}

function issue(overrides: Partial<OldIssue> = {}): OldIssue {
  return {
    id: 101,
    date: '2026-09-01T10:00:00+05:30',
    created_at: '2026-09-01T10:00:00+05:30',
    institution: 'JKKN Dental College & Hospital',
    issue_category: 'Electrical Issue',
    issue_details: 'Fan not working in ortho dept',
    issue_location: 'Ortho dept',
    severity: 'Critical',
    status: 'Approved',
    completed: false,
    reporter: 'Reporter One',
    email_id: 'Reporter.One@example.test',
    assigned_to: 'fixer@example.test',
    image_url: 'https://old.example.test/storage/v1/object/public/x/1.jpg',
    ...overrides,
  };
}

describe('college mapping', () => {
  it('normalises spacing and case before looking up', () => {
    expect(normaliseKey('  JKKN Dental College  ')).toBe('jkkn dental college');
    expect(mapInstitution('  JKKN Dental College ', institutions)).toMatchObject({
      institutionId: DENTAL,
      mapped: true,
    });
  });

  it('sends an unknown college to Main Office and reports it as unmapped', () => {
    expect(mapInstitution('course_name', institutions)).toEqual({
      institutionId: MAIN_OFFICE,
      code: 'JMO',
      mapped: false,
      review: false,
    });
    expect(mapInstitution('', institutions).mapped).toBe(false);
  });

  it('sends hostels to Main Office, flagged for review', () => {
    expect(mapInstitution('Boys Hostal', institutions)).toMatchObject({
      institutionId: MAIN_OFFICE,
      mapped: true,
      review: true,
    });
  });

  it('never maps anything to the Testing Institution', () => {
    const ids = Object.values(institutions.map).map((t) => t.institution_id);
    expect(ids).not.toContain('183847c5-be1b-4903-86eb-bbc20c213071');
  });
});

describe('place and category cleaning', () => {
  it('uses the cleaned mapping for a known location', () => {
    expect(cleanPlace('JKKN Dental College & Hospital', 'Ortho dept', 'x', places)).toEqual({
      site: 'Dental College & Hospital',
      area: 'Orthodontics',
    });
  });

  it('derives a generic location from the details', () => {
    expect(cleanPlace('Main Office', 'JKKN', 'Washroom tap leaking', places)).toEqual({
      site: 'Main Office & others',
      area: 'Toilets & washrooms',
    });
  });

  it('re-sorts a vague category by keywords, else Other', () => {
    expect(cleanIssueCategory('Electrical Issue', 'anything', categories)).toBe('Electrical');
    expect(cleanIssueCategory('Hostel Issues', 'tap is leaking', categories)).toBe('Plumbing & water');
    expect(cleanIssueCategory('Hostel Issues', 'nothing matches', categories)).toBe('Other');
    expect(cleanRequirementCategory('Civil Related', categories)).toBe('Infrastructure');
    expect(cleanRequirementCategory('never seen', categories)).toBe('Other');
  });
});

describe('which old jobs are unfinished', () => {
  it('Approved or Pending, not completed', () => {
    expect(isOpenIssue({ status: 'Approved', completed: false })).toBe(true);
    expect(isOpenIssue({ status: 'Pending', completed: false })).toBe(true);
    expect(isOpenIssue({ status: 'Approved', completed: true })).toBe(false);
    expect(isOpenIssue({ status: 'Completed ', completed: false })).toBe(false);
    expect(isOpenIssue({ status: 'Rejected', completed: false })).toBe(false);
  });
});

describe('history rows', () => {
  it('matches the reporter by email, keeps the name, never the email or mobile', () => {
    const row = buildIssueRow(issue(), ctx());
    expect(row.reporter_profile_id).toBe('profile-1');
    expect(row.reporter_name).toBe('Reporter One');
    expect(JSON.stringify(row)).not.toContain('@example.test');
    expect(row).not.toHaveProperty('mobile_number');
    expect(row.legacy_assigned_to).toBe('Fixer Name');
  });

  it('leaves the reporter unmatched (null) when no profile has the email', () => {
    expect(buildIssueRow(issue({ email_id: 'nobody@example.test' }), ctx()).reporter_profile_id).toBeNull();
  });

  it('never sends the task link or a decision, so a re-run cannot undo them', () => {
    const issueRow = buildIssueRow(issue(), ctx());
    for (const k of ISSUE_IMPORT_NEVER_WRITES) expect(issueRow).not.toHaveProperty(k);
    const reqRow = buildRequirementRow(
      { id: 7, status: 'Pending MD Approval', requirement_details: 'Chairs', institution: 'Main Office' },
      ctx()
    );
    for (const k of REQUIREMENT_IMPORT_NEVER_WRITES) expect(reqRow).not.toHaveProperty(k);
  });

  it('flags the 23 Nov 2024 bulk-loaded rows', () => {
    expect(buildIssueRow(issue({ created_at: '2024-11-23T08:00:00+00:00' }), ctx()).reported_at_is_bulk_load).toBe(true);
  });
});

const NONE_LEFT: ReadonlySet<string> = new Set();
/** The importer's own call: left-ness decided by reporterHasLeft. */
const taskFor = (row: ReturnType<typeof buildIssueRow>, left: ReadonlySet<string> = NONE_LEFT) =>
  buildWalkTaskInput(row, reporterHasLeft(row, left));

describe('the Campus Walk task for an open job', () => {
  it('is NEVER unsafe, whatever the old severity said', () => {
    const input = taskFor(buildIssueRow(issue({ severity: 'Critical' }), ctx()));
    expect(input.isUnsafe).toBe(false);
    expect(input.kind).toBe('symptom');
    expect(input.extraMetadata).toMatchObject({ legacy_severity: 'Critical' });
  });

  it('carries the import markers and never an old photo as a bucket path', () => {
    const input = taskFor(buildIssueRow(issue(), ctx()));
    expect(input.extraMetadata).toMatchObject({
      front_door: 'instasolver',
      imported_from: 'old-instasolver',
      legacy_instasolver_id: 101,
      reporter_id: 'profile-1',
    });
    expect(input.photoStoragePath).toBeUndefined();
    expect(input.photos).toBeUndefined();
    expect(input.institutionId).toBe(DENTAL);
    expect(input.raisedByProfileId).toBe('profile-1');
  });

  it("leaves reporter_id out when nobody matched", () => {
    const input = taskFor(buildIssueRow(issue({ email_id: 'nobody@example.test' }), ctx()));
    expect(input.extraMetadata).not.toHaveProperty('reporter_id');
  });

  // Director ruling, 1 Oct 2026: a reporter who no longer works or studies at
  // JKKN still gets the job created, but with nobody to tell it was fixed.
  it('a reporter whose matched profile is inactive or login-disabled has LEFT: no reporter_id, no raised-by, reporter_left flag', () => {
    const row = buildIssueRow(issue(), ctx({ leftProfileIds: new Set(['profile-1']) }));
    expect(row.reporter_profile_id).toBe('profile-1'); // history keeps the match
    const input = taskFor(row, new Set(['profile-1']));
    expect(input.extraMetadata).not.toHaveProperty('reporter_id');
    expect(input.extraMetadata).toMatchObject({ reporter_left: true, front_door: 'instasolver' });
    expect(input.raisedByProfileId).toBeNull();
    expect(input.institutionId).toBe(DENTAL); // still routed to its own college
    expect(JSON.stringify(input)).not.toContain('reporter.one@example.test');
  });

  it('a reporter with no matched profile has LEFT too', () => {
    const row = buildIssueRow(issue({ email_id: 'nobody@example.test' }), ctx());
    expect(reporterHasLeft(row, NONE_LEFT)).toBe(true);
    const input = taskFor(row);
    expect(input.extraMetadata).toMatchObject({ reporter_left: true });
    expect(input.raisedByProfileId).toBeNull();
  });

  it('an active reporter has not left: reporter_id set, no reporter_left flag', () => {
    const row = buildIssueRow(issue(), ctx());
    expect(reporterHasLeft(row, NONE_LEFT)).toBe(false);
    expect(taskFor(row).extraMetadata).not.toHaveProperty('reporter_left');
  });

  it("titles EVERY unfinished old job 'Check if still broken', old or recent (Director, 2 Oct 2026)", () => {
    for (const date of ['2025-06-01T00:00:00Z', undefined]) {
      const task = taskFor(buildIssueRow(issue(date ? { date } : {}), ctx()));
      expect(task.title.startsWith(STILL_BROKEN_PREFIX)).toBe(true);
      expect(task.extraMetadata).toMatchObject({ needs_still_broken_check: true });
    }
  });

  it('keeps the title to one line of 160 characters', () => {
    const input = taskFor(buildIssueRow(issue({ issue_details: 'x'.repeat(500) }), ctx()));
    expect(input.title.length).toBeLessThanOrEqual(160);
  });
});

// ── Idempotent task creation ───────────────────────────────────────────────

type Linked = Record<number, string | null>;

/** A tiny stand-in for the Supabase client, covering only what createTasks calls. */
function fakeDb(linked: Linked, existingTaskFor: Record<number, string>) {
  const updates: Array<{ legacy_id: number; imported_task_id: string }> = [];
  const db = {
    from(table: string) {
      const state: Record<string, unknown> = {};
      const builder: any = {
        select() {
          return builder;
        },
        in(_col: string, ids: number[]) {
          state.ids = ids;
          return Promise.resolve({
            data: ids.map((id) => ({ legacy_id: id, imported_task_id: linked[id] ?? null })),
            error: null,
          });
        },
        eq(col: string, value: string | number) {
          state[col] = value;
          return builder;
        },
        is() {
          if (table === 'legacy_instasolver_issues' && state.pendingUpdate) {
            updates.push({
              legacy_id: Number(state.legacy_id),
              imported_task_id: (state.pendingUpdate as { imported_task_id: string }).imported_task_id,
            });
          }
          return Promise.resolve({ error: null });
        },
        limit() {
          const id = Number(state['metadata->>legacy_instasolver_id']);
          const hit = existingTaskFor[id];
          return Promise.resolve({ data: hit ? [{ id: hit }] : [], error: null });
        },
        update(payload: unknown) {
          state.pendingUpdate = payload;
          return builder;
        },
      };
      return builder;
    },
  };
  return { db: db as any, updates };
}

describe('createTasks never creates a task twice', () => {
  const rowFor = (id: number) => buildIssueRow(issue({ id }), ctx());

  it('skips a row that already has a task, re-links an orphan, creates the rest', async () => {
    const { db, updates } = fakeDb({ 1: 'task-already' }, { 2: 'task-orphan' });
    const createTask = vi.fn(async () => ({ taskId: 'task-new', attachmentId: null }));

    const result = await createTasks(db, [rowFor(1), rowFor(2), rowFor(3)], NONE_LEFT, createTask);

    expect(result).toEqual({ created: 1, alreadyLinked: 1, relinked: 1, failed: 0 });
    expect(createTask).toHaveBeenCalledTimes(1);
    expect(updates).toEqual([
      { legacy_id: 2, imported_task_id: 'task-orphan' },
      { legacy_id: 3, imported_task_id: 'task-new' },
    ]);
  });

  it('a second run over the same rows creates nothing', async () => {
    const { db } = fakeDb({ 1: 't1', 2: 't2' }, {});
    const createTask = vi.fn();
    const result = await createTasks(db, [rowFor(1), rowFor(2)], NONE_LEFT, createTask as any);
    expect(result.created).toBe(0);
    expect(createTask).not.toHaveBeenCalled();
  });

  it("creates a departed reporter's job without naming them (ruling 1 Oct 2026)", async () => {
    const { db } = fakeDb({}, {});
    const createTask = vi.fn(async () => ({ taskId: 'task-left', attachmentId: null }));
    const result = await createTasks(db, [rowFor(4)], new Set(['profile-1']), createTask);
    expect(result.created).toBe(1);
    const input = (createTask.mock.calls[0] as unknown[])[1] as ReturnType<typeof buildWalkTaskInput>;
    expect(input.raisedByProfileId).toBeNull();
    expect(input.extraMetadata).not.toHaveProperty('reporter_id');
    expect(input.extraMetadata).toMatchObject({ reporter_left: true });
  });

  it('counts a failed create and does not write a link', async () => {
    const { db, updates } = fakeDb({}, {});
    const result = await createTasks(db, [rowFor(9)], NONE_LEFT, vi.fn(async () => null));
    expect(result.failed).toBe(1);
    expect(updates).toEqual([]);
  });
});

describe('--apply guard', () => {
  it('defaults to a dry run', () => {
    expect(parseArgs(['--export-dir', '/x']).apply).toBe(false);
    expect(parseArgs(['--export-dir=/x', '--apply', '--dry-run']).apply).toBe(false);
  });

  it('refuses --apply without INSTASOLVER_IMPORT_CONFIRM=yes', () => {
    const args = parseArgs(['--export-dir', '/x', '--apply']);
    const creds = { NEXT_PUBLIC_SUPABASE_URL: 'https://x.test', SUPABASE_SERVICE_ROLE_KEY: 'k' };
    expect(() => assertApplyAllowed(args, creds)).toThrow(/INSTASOLVER_IMPORT_CONFIRM=yes/);
    expect(() => assertApplyAllowed(args, { ...creds, INSTASOLVER_IMPORT_CONFIRM: 'true' })).toThrow();
    expect(() => assertApplyAllowed(args, { ...creds, INSTASOLVER_IMPORT_CONFIRM: 'yes' })).not.toThrow();
  });

  it('refuses --apply without database credentials even when confirmed', () => {
    const args = parseArgs(['--apply']);
    expect(() => assertApplyAllowed(args, { INSTASOLVER_IMPORT_CONFIRM: 'yes' })).toThrow(/SERVICE_ROLE_KEY/);
  });

  it('lets a dry run through with nothing set', () => {
    expect(() => assertApplyAllowed(parseArgs([]), {})).not.toThrow();
  });
});
