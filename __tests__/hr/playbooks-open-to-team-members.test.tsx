// @vitest-environment jsdom
/**
 * Director 8 Oct 05:30: the HR playbooks page is readable by EVERY team member;
 * only HR changes playbooks.
 *
 * Before this, MENU_PERMISSIONS mapped '/hr/playbooks' to 'hr.view', and
 * app/(routes)/hr/layout.tsx (RoutePermissionGuard) turned away anyone without
 * it — which is most faculty (test.faculty's role holds no hr.view). The route
 * now uses the universal signed-in sentinel `view_profile`, the same key as
 * /hr/my-pay-changes.
 *
 * What must NOT open with it:
 *   - the Proposals tab (hr.harness.playbooks.manage only);
 *   - the decide / retire routes, which call fn_hr_playbook_decide and
 *     fn_hr_playbook_retire_line AS THE CALLER (session client) — those
 *     functions refuse without the manage key (proved in playbooks.pg.test.ts)
 *     and the route answers that refusal as 403.
 */
import '@testing-library/jest-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  pathname: '/hr/playbooks',
  perms: {} as Record<string, boolean>,
  superAdmin: false,
  role: 'faculty',
  rpcCalls: [] as Array<{ fn: string; args: unknown }>,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => state.pathname,
  useSearchParams: () => new URLSearchParams('duty=L1&tab=proposals'),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    permissions: state.perms,
    can: (k: string) => Boolean(state.perms[k]),
    isSuperAdmin: state.superAdmin,
    userProfile: { id: 'me', role: state.role },
    isLoading: false,
  }),
}));
vi.mock('@/components/errors/permission-error', () => ({
  PermissionError: (p: { requiredPermission?: string }) => (
    <div data-testid='permission-error'>refused: {p.requiredPermission}</div>
  ),
}));
vi.mock('@/hooks/hr/use-duty-playbooks', () => ({
  useDutyPlaybook: () => ({ data: [], isLoading: false, error: null }),
  usePlaybookProposals: () => ({ data: [], isLoading: false, error: null }),
  usePlaybookContributors: () => ({ data: [], isLoading: false, error: null }),
  useSuggestPlaybookLine: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDecidePlaybookProposal: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRetirePlaybookLine: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/components/auth/permission-guard', () => ({
  PermissionGuard: (p: { children: React.ReactNode }) => p.children,
}));

// The session client the write routes use. Its rpc answers the way the real
// functions answer a caller WITHOUT the manage key: SQLSTATE 42501.
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'faculty-1' } } }) },
    rpc: async (fn: string, args: unknown) => {
      state.rpcCalls.push({ fn, args });
      const message =
        fn === 'fn_hr_playbook_retire_line'
          ? 'Only the HR head can retire playbook lines.'
          : 'Only the HR head can decide playbook lines.';
      return { data: null, error: { message, code: '42501' } };
    },
  }),
}));

import { MENU_PERMISSIONS } from '@/lib/sidebarMenuLink';
import { routeMatcher } from '@/lib/auth/route-matcher';
import { isPageAccessible } from '@/lib/navigation/permission-filter';
import HrLayout from '@/app/(routes)/hr/layout';
import { PlaybooksView } from '@/app/(routes)/hr/playbooks/_components/playbooks-view';
import { POST as decidePOST } from '@/app/api/hr/playbooks/decide/route';
import { POST as retirePOST } from '@/app/api/hr/playbooks/lines/retire/route';

const PROPOSAL_ID = '11111111-2222-4333-8444-555555555555';

function jsonRequest(url: string, body: unknown) {
  const req = new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return Object.assign(req, { nextUrl: new URL(url) }) as unknown as Parameters<typeof decidePOST>[0];
}

beforeEach(() => {
  state.pathname = '/hr/playbooks';
  state.perms = {};
  state.superAdmin = false;
  state.role = 'faculty';
  state.rpcCalls = [];
});
afterEach(() => cleanup());

describe('/hr/playbooks — the route gate opens for every signed-in team member', () => {
  it('declares the signed-in sentinel, the same key as /hr/my-pay-changes', () => {
    expect(MENU_PERMISSIONS['/hr/playbooks']).toBe(MENU_PERMISSIONS['/hr/my-pay-changes']);
    expect(MENU_PERMISSIONS['/hr/playbooks']).toBe('view_profile');
  });

  it('the matcher resolves the page to that key, not to /hr -> hr.view by longest prefix', () => {
    expect(routeMatcher.match('/hr/playbooks')?.permission).toBe('view_profile');
    expect(routeMatcher.match('/hr')?.permission).toBe('hr.view');
  });

  it('a team member holding no HR key may open it', () => {
    const permission = routeMatcher.match('/hr/playbooks')?.permission;
    expect(isPageAccessible('/hr/playbooks', permission, {}, false, 'faculty')).toBe(true);
  });

  it('the /hr layout guard renders the page for a team member with an empty permission map', () => {
    render(
      <HrLayout>
        <p>playbook page body</p>
      </HrLayout>,
    );
    expect(screen.getByText('playbook page body')).toBeInTheDocument();
    expect(screen.queryByTestId('permission-error')).not.toBeInTheDocument();
  });

  it('control: the same team member is still refused the HR home and payroll', () => {
    for (const path of ['/hr', '/hr/payroll']) {
      cleanup();
      state.pathname = path;
      render(
        <HrLayout>
          <p>gated body</p>
        </HrLayout>,
      );
      expect(screen.queryByText('gated body'), path).not.toBeInTheDocument();
      expect(screen.getByTestId('permission-error'), path).toBeInTheDocument();
    }
  });
});

describe('/hr/playbooks — changing playbooks still needs hr.harness.playbooks.manage', () => {
  it('a team member without the key sees no Proposals tab, even when the URL asks for it', () => {
    render(<PlaybooksView />);
    expect(screen.getByRole('tab', { name: 'Playbooks by duty' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Proposals' })).not.toBeInTheDocument();
  });

  it('the holder of the manage key does see it', () => {
    state.perms = { 'hr.harness.playbooks.manage': true };
    render(<PlaybooksView />);
    expect(screen.getByRole('tab', { name: 'Proposals' })).toBeInTheDocument();
  });

  it('the decide route asks the database AS THE CALLER and answers its refusal with 403', async () => {
    const res = await decidePOST(
      jsonRequest('http://localhost/api/hr/playbooks/decide', { id: PROPOSAL_ID, decision: 'accept' }),
    );
    expect(res.status).toBe(403);
    expect(state.rpcCalls.map((c) => c.fn)).toEqual(['fn_hr_playbook_decide']);
  });

  it('the retire route asks the database AS THE CALLER and answers its refusal with 403', async () => {
    const res = await retirePOST(
      jsonRequest('http://localhost/api/hr/playbooks/lines/retire', { id: PROPOSAL_ID, note: 'No longer applies' }),
    );
    expect(res.status).toBe(403);
    expect(state.rpcCalls.map((c) => c.fn)).toEqual(['fn_hr_playbook_retire_line']);
  });
});
