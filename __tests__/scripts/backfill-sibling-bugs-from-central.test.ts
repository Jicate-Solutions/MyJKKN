// __tests__/scripts/backfill-sibling-bugs-from-central.test.ts
//
// The mapping rules of the central → MyJKKN bug backfill: open bugs only
// (Director, 10 Oct 2026), the idempotence key, the COE test-entry
// exclusion, and a NULL reporter before #4322's participant-trigger guard.

import { describe, it, expect } from 'vitest';
import {
  APP_MAP,
  BACKFILL_SOURCE,
  centralIdOf,
  mapStatus,
  OPEN_STATUSES,
  parseArgs,
  planBackfill,
  selectApps,
  type CentralBug,
  type PlanInput,
  type SiblingApp,
} from '@/scripts/backfill-sibling-bugs-from-central';

function bug(over: Partial<CentralBug> & { id: string }): CentralBug {
  return {
    display_id: 'BUG-1',
    created_at: '2026-08-01T10:00:00Z',
    application_id: 'central-app',
    reporter_user_id: null,
    page_url: 'https://mentor.example/x',
    description: 'Something broke on the page',
    category: 'bug',
    screenshot_url: 'https://adakhqxgaoxaihtehfqw.supabase.co/storage/v1/object/public/bug-attachments/a.png',
    console_logs: [],
    status: 'new',
    resolved_at: null,
    metadata: { title: 'Broken', reporter_name: 'Anitha' },
    attachments: [],
    reopened_at: null,
    reopen_reason: null,
    reopen_count: 0,
    reporter_email: 'Anitha@JKKN.ac.in',
    ...over,
  };
}

const SIBLINGS = new Map<string, SiblingApp>(
  ['mentor', 'tms', 'coe', 'library', 'event-forms'].map((slug) => [
    slug,
    { id: `sib-${slug}`, slug, name: slug.toUpperCase(), is_active: true },
  ])
);

function input(over: Partial<PlanInput> = {}): PlanInput {
  return {
    bugs: [],
    eventsByBug: new Map(),
    messagesByBug: new Map(),
    existingCentralIds: new Set(),
    reporterByEmail: new Map([['anitha@jkkn.ac.in', { id: 'p-1', institution_id: 'i-1', department_id: 'd-1' }]]),
    siblingApps: SIBLINGS,
    includeCoeTest: false,
    now: '2026-10-10T00:00:00Z',
    ...over,
  };
}

describe('mapStatus (open bugs only)', () => {
  it('carries new, seen and in_progress unchanged', () => {
    expect([...OPEN_STATUSES]).toEqual(['new', 'seen', 'in_progress']);
    for (const s of OPEN_STATUSES) expect(mapStatus(s)).toBe(s);
  });

  it('leaves resolved, closed, wont_fix and anything else in central', () => {
    for (const s of ['resolved', 'closed', 'wont_fix', 'duplicate', 'archived', '', null]) expect(mapStatus(s)).toBeNull();
  });

  it('never copies a non-open bug and never blocks on it', () => {
    const bugs = ['resolved', 'closed', 'wont_fix', 'new'].map((status, i) => ({
      centralApp: 'tms',
      bug: bug({ id: `s${i}`, status, resolved_at: status === 'new' ? null : '2026-08-02T00:00:00Z' }),
    }));
    const plan = planBackfill(input({ bugs }));
    expect(plan.map((p) => p.decision)).toEqual(['stays-in-central', 'stays-in-central', 'stays-in-central', 'insert']);
    expect(plan.every((p) => p.blockers.length === 0)).toBe(true);
    // copied open bugs land in quarantine; the central status is kept in metadata
    expect(plan[3].row.status).toBe('unverified');
    expect((plan[3].row.metadata as Record<string, unknown>).central_status).toBe('new');
    expect(plan[3].row).not.toHaveProperty('resolved_by');
  });
});

describe('app mapping', () => {
  it('maps both TMS entries to tms and both COE entries to coe', () => {
    const to = Object.fromEntries(APP_MAP.map((a) => [a.central, a.sibling]));
    expect(to).toEqual({
      'jkkn-mentor': 'mentor',
      tms: 'tms',
      'transport-management-system': 'tms',
      'jkkn-coe': 'coe',
      jkkncoeproduction: 'coe',
      'myjkkn-library': 'library',
    });
  });

  it('excludes the COE TEST entry by default and includes it only on the flag', () => {
    expect(selectApps({ includeCoeTest: false }).map((a) => a.central)).not.toContain('jkkn-coe');
    expect(selectApps({ includeCoeTest: true }).map((a) => a.central)).toContain('jkkn-coe');
    expect(parseArgs([]).includeCoeTest).toBe(false);
    expect(parseArgs(['--include-coe-test']).includeCoeTest).toBe(true);
  });

  it('drops jkkn-coe bugs at planning time even if they were read', () => {
    const bugs = [
      { centralApp: 'jkkn-coe', bug: bug({ id: 'c1' }) },
      { centralApp: 'jkkncoeproduction', bug: bug({ id: 'c2' }) },
    ];
    expect(planBackfill(input({ bugs })).map((p) => p.centralId)).toEqual(['c2']);
    expect(planBackfill(input({ bugs, includeCoeTest: true })).map((p) => p.centralId)).toEqual(['c1', 'c2']);
  });
});

describe('row shape', () => {
  it('carries the idempotence key and never sets display_id or module_name', () => {
    const [p] = planBackfill(input({ bugs: [{ centralApp: 'jkkn-mentor', bug: bug({ id: 'b1', display_id: 'BUG-77' }) }] }));
    const md = p.row.metadata as Record<string, unknown>;
    expect(md.source).toBe(BACKFILL_SOURCE);
    expect(md.central_bug_id).toBe('b1');
    expect(md.central_display_id).toBe('BUG-77');
    expect(centralIdOf(md)).toBe('b1');
    expect(p.row).not.toHaveProperty('display_id');
    expect(p.row).not.toHaveProperty('module_name');
    expect(p.row.application_id).toBe('sib-mentor');
  });

  it('never links a reporter from the email, even on an exact match; keeps email and name in metadata', () => {
    const [p] = planBackfill(input({ bugs: [{ centralApp: 'tms', bug: bug({ id: 'b1' }) }] }));
    expect(p.reporter).toBe('matched');
    expect(p.row.reporter_user_id).toBeNull();
    expect(p.row.institution_id).toBeNull();
    expect(p.row.department_id).toBeNull();
    const md = p.row.metadata as Record<string, unknown>;
    expect(md.reporter_email).toBe('anitha@jkkn.ac.in');
    expect(md.reporter_name).toBe('Anitha');
    expect(md.reporter_verified).toBe(false);
  });

  it('copies attachment URLs into attachment_urls and keeps the objects in metadata', () => {
    const att = [{ url: 'https://x/a.png', filename: 'a.png', filesize: 1, filetype: 'image/png' }];
    const [p] = planBackfill(input({ bugs: [{ centralApp: 'tms', bug: bug({ id: 'b1', attachments: att }) }] }));
    expect(p.row.attachment_urls).toEqual(['https://x/a.png']);
    expect((p.row.metadata as any).central_attachments).toEqual(att);
  });
});

describe('idempotence', () => {
  it('skips a bug an earlier run already copied', () => {
    const bugs = [
      { centralApp: 'tms', bug: bug({ id: 'done' }) },
      { centralApp: 'tms', bug: bug({ id: 'todo' }) },
    ];
    const plan = planBackfill(input({ bugs, existingCentralIds: new Set(['done']) }));
    expect(plan.map((p) => [p.centralId, p.decision])).toEqual([
      ['done', 'skip-existing'],
      ['todo', 'insert'],
    ]);
  });

  it('reads the key only from rows this backfill wrote', () => {
    expect(centralIdOf({ source: BACKFILL_SOURCE, central_bug_id: 'x' })).toBe('x');
    expect(centralIdOf({ source: 'sibling_app', central_bug_id: 'x' })).toBeNull();
    expect(centralIdOf(null)).toBeNull();
  });
});

describe('open rows that would fail an insert', () => {
  it('flags a NULL reporter as needing #4322 when sibling_apps is missing, without blocking it', () => {
    const bugs = [{ centralApp: 'tms', bug: bug({ id: 'n', reporter_email: 'nobody@else.in', metadata: {} }) }];
    const [p] = planBackfill(input({ bugs, siblingApps: null }));
    expect(p.row.reporter_user_id).toBeNull();
    expect(p.row.application_id).toBeNull();
    expect(p.needsMigration).toContain('sibling_apps missing');
    expect(p.needsMigration.some((m) => m.includes('participant trigger'))).toBe(true);
    expect(p.blockers).toEqual([]);
  });
});
