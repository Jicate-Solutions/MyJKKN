// @vitest-environment jsdom
// =====================================================================
// Who can open the appraisal round pages (review round 1, point 2)
// =====================================================================
// Before: both round pages were wrapped whole in <SuperAdminOnly>, so the
// new hr.performance_reviews.manage key opened nothing. Now they open for a
// super admin OR a holder of the key; everyone else gets the standard
// "you don't have access" notice naming the key, never a blank page.
// #4081's own controls — moving a round on, creating one, the committee
// review and the Director's sign-off — stay super-admin only.
// =====================================================================

import '@testing-library/jest-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const usePermissionsMock = vi.fn();
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: (...args: unknown[]) => usePermissionsMock(...args),
}));

import { AppraisalHrGate } from '@/features/hr/appraisal/appraisal-hr-gate';

function as({ keys = [] as string[], isSuperAdmin = false }) {
  const has = (module: string, actions: string[]) =>
    actions.every((a) => keys.includes(`${module}.${a}`));
  usePermissionsMock.mockReturnValue({
    isLoading: false,
    error: null,
    canPerformAll: has,
    canPerformAny: (m: string, a: string[]) => a.some((x) => keys.includes(`${m}.${x}`)),
    isSuperAdmin,
    isAdmissionGlobalUser: false,
    isCounselorUser: false,
  });
}

afterEach(() => {
  cleanup();
  usePermissionsMock.mockReset();
});

describe('the appraisal round pages', () => {
  it('open for someone who is NOT a super admin but holds the key', () => {
    as({ keys: ['hr.performance_reviews.manage'] });
    render(<AppraisalHrGate><p>round page</p></AppraisalHrGate>);
    expect(screen.getByText('round page')).toBeInTheDocument();
  });

  it('stay shut for someone without the key, with a notice naming it', () => {
    as({ keys: ['hr.performance_reviews.view_own', 'hr.dashboard.view'] });
    render(<AppraisalHrGate><p>round page</p></AppraisalHrGate>);
    expect(screen.queryByText('round page')).not.toBeInTheDocument();
    expect(document.body.textContent).toContain('hr.performance_reviews.manage');
  });

  it('still open for a super admin', () => {
    as({ isSuperAdmin: true });
    render(<AppraisalHrGate><p>round page</p></AppraisalHrGate>);
    expect(screen.getByText('round page')).toBeInTheDocument();
  });
});

describe('the pages use the gate, and keep #4081 controls super-admin only', () => {
  const dir = join(process.cwd(), 'app', '(routes)', 'hr', 'admin', 'performance-reviews', 'cycles');
  const list = readFileSync(join(dir, 'page.tsx'), 'utf8');
  const detail = readFileSync(join(dir, readdirSync(dir).find((d) => d.startsWith('['))!, 'page.tsx'), 'utf8');

  it.each([['list', list], ['detail', detail]])('%s page is wrapped in the gate, not SuperAdminOnly', (_n, src) => {
    expect(src).toMatch(/return \(\s*<AppraisalHrGate>/);
    expect(src).not.toMatch(/return \(\s*<SuperAdminOnly>/);
  });

  it('keeps the committee and sign-off panel inside SuperAdminOnly', () => {
    const at = detail.indexOf('<ReviewDecisionPanel');
    const open = detail.lastIndexOf('<SuperAdminOnly>', at);
    const close = detail.indexOf('</SuperAdminOnly>', at);
    expect(open).toBeGreaterThan(-1);
    expect(detail.slice(open, at)).not.toContain('</SuperAdminOnly>');
    expect(close).toBeGreaterThan(at);
  });

  it('keeps the Committee review / Sign off buttons and moving the round on super-admin only', () => {
    for (const marker of ["'Sign off' : 'Committee review'", 'Move to {cycleStatusLabel']) {
      const at = detail.indexOf(marker);
      expect(at, marker).toBeGreaterThan(-1);
      const open = detail.lastIndexOf('<SuperAdminOnly>', at);
      expect(detail.slice(open, at)).not.toContain('</SuperAdminOnly>');
    }
  });

  it('keeps creating a round super-admin only', () => {
    const at = list.indexOf("{showForm ? 'Hide form' : 'New cycle'}");
    const open = list.lastIndexOf('<SuperAdminOnly>', at);
    expect(open).toBeGreaterThan(-1);
    expect(list.slice(open, at)).not.toContain('</SuperAdminOnly>');
  });
});
