// @vitest-environment jsdom
// =====================================================================
// HR appraisal settings — blank statements are never saved
// =====================================================================
// The statement boxes keep every line while someone types, so a cleared
// box or a trailing newline used to reach band_statements, and the audit
// log's new_value, as blank statements. They are now trimmed and dropped
// on save; the forms that read them drop blanks too.
// =====================================================================

import '@/__tests__/setup-jsdom';
import { Fragment, createElement, isValidElement } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { DEFAULT_VALUE, cleanForSave, parseValue } from '@/lib/hr/performance-review-policy';
import { hasAnyStatements, resolveBandStatements } from '@/lib/hr/appraisal-harness';

// ---------------------------------------------------------------------------
// A fake database that records what the settings page writes.
// ---------------------------------------------------------------------------

const db = vi.hoisted(() => ({
  updates: [] as Record<string, unknown>[],
  audits: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/supabase/client', () => {
  const policyRow = {
    id: 'pol-1',
    policy_key: 'hr.performance_review',
    scope_type: 'institution',
    scope_id: 'inst-1',
    value: {},
    draft_value: null,
    publication_state: 'published',
    classification: 'major',
    description: null,
    updated_at: '2026-09-01T00:00:00Z',
  };
  function builder(table: string) {
    let op: 'select' | 'update' = 'select';
    let payload: Record<string, unknown> = {};
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.order = () => b;
    b.update = (p: Record<string, unknown>) => {
      op = 'update';
      payload = p;
      db.updates.push(p);
      return b;
    };
    b.insert = async (row: Record<string, unknown>) => {
      if (table === 'hr_policy_audit_log') db.audits.push(row);
      return { error: null };
    };
    b.maybeSingle = async () => ({ data: policyRow, error: null });
    b.single = async () => ({
      data: op === 'update' ? { ...policyRow, ...payload } : policyRow,
      error: null,
    });
    b.then = (resolve: (v: unknown) => unknown) =>
      resolve({
        data: table === 'institutions' ? [{ id: 'inst-1', name: 'College One' }] : [],
        error: null,
      });
    return b;
  }
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'director' } } }) },
    from: (t: string) => builder(t),
  };
  return { createClientSupabaseClient: () => client };
});

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ isSuperAdmin: true, userProfile: { role: 'super_admin' } }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function passThrough(props: Record<string, unknown>) {
  const nested = Object.values(props).flat().filter(isValidElement);
  return createElement(Fragment, null, ...nested);
}
vi.mock('@/components/auth/permission-guard', () => ({ PermissionGuard: passThrough }));
vi.mock('@/components/layout/content-layout', () => ({ ContentLayout: passThrough }));
vi.mock('@/components/navigation', () => ({ PageBreadcrumb: () => null }));

import PerformanceReviewPage from '@/app/(routes)/hr/admin/policies/performance-review/page';

// ---------------------------------------------------------------------------

describe('cleanForSave', () => {
  it('trims statements and drops blank ones, leaving every other setting alone', () => {
    const typed = parseValue({});
    typed.band_statements.teaching.exceeds = ['  Ran a session colleagues asked for  ', '', '   '];
    typed.band_statements.service.below = ['Missed two duty rosters', ''];
    typed.band_statements.research.meets = [''];
    const saved = cleanForSave(typed);
    expect(saved.band_statements.teaching.exceeds).toEqual(['Ran a session colleagues asked for']);
    expect(saved.band_statements.service.below).toEqual(['Missed two duty rosters']);
    expect(saved.band_statements.research.meets).toEqual([]);
    expect({ ...saved, band_statements: null }).toEqual({ ...typed, band_statements: null });
  });
});

describe('the forms read statements without blanks', () => {
  it('drops whitespace-only and newline-only statements', () => {
    const policy = {
      band_statements: { teaching: { exceeds: ['Real one\n', '\n', '   ', '\t'] } },
    } as never;
    expect(resolveBandStatements(policy, 'teaching', 'exceeds')).toEqual(['Real one']);
  });

  it('treats a college whose statements are all blank as having none', () => {
    const policy = { band_statements: { teaching: { exceeds: ['', '  ', '\n'] } } } as never;
    expect(hasAnyStatements(policy)).toBe(false);
  });
});

describe('the settings page saves', { timeout: 40000 }, () => {
  beforeEach(() => {
    db.updates.length = 0;
    db.audits.length = 0;
  });

  async function typeStatementsAndSave(button: 'Save Draft' | 'Publish') {
    render(<PerformanceReviewPage />);
    const box = (await screen.findByLabelText(
      'Exceeds',
      { selector: '#st-teaching-exceeds' },
      { timeout: 15000 },
    )) as HTMLTextAreaElement;
    // A real line, a blank line in the middle, and a trailing newline.
    fireEvent.change(box, { target: { value: 'Ran a session colleagues asked for\n\n  \n' } });
    // A box that was typed in and then cleared.
    const cleared = document.getElementById('st-service-meets') as HTMLTextAreaElement;
    fireEvent.change(cleared, { target: { value: 'x' } });
    fireEvent.change(cleared, { target: { value: '' } });
    fireEvent.change(document.getElementById('reason') as HTMLTextAreaElement, {
      target: { value: 'Writing the first statements' },
    });
    fireEvent.click(screen.getByRole('button', { name: button }));
    await waitFor(() => expect(db.audits).toHaveLength(1), { timeout: 15000 });
  }

  it('writes a draft and its audit entry with no blank statement', async () => {
    await typeStatementsAndSave('Save Draft');
    const written = db.updates[0].draft_value as typeof DEFAULT_VALUE;
    expect(written.band_statements.teaching.exceeds).toEqual(['Ran a session colleagues asked for']);
    expect(written.band_statements.service.meets).toEqual([]);
    const logged = db.audits[0].new_value as typeof DEFAULT_VALUE;
    expect(logged.band_statements.teaching.exceeds).toEqual(['Ran a session colleagues asked for']);
    expect(logged.band_statements.service.meets).toEqual([]);
  });

  it('publishes with no blank statement either', async () => {
    await typeStatementsAndSave('Publish');
    const written = db.updates[0].value as typeof DEFAULT_VALUE;
    expect(written.band_statements.teaching.exceeds).toEqual(['Ran a session colleagues asked for']);
    const logged = db.audits[0].new_value as typeof DEFAULT_VALUE;
    expect(logged.band_statements.teaching.exceeds).toEqual(['Ran a session colleagues asked for']);
  });
});
