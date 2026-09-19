// @vitest-environment jsdom
/**
 * /ai-pulse/my-pulse — what the page does when a read fails.
 * =============================================================================
 *
 * BUG-005574 / 005576 / 005579 / 005581: four learners, four minutes, one dead
 * page. The failure mode worth pinning is not the waterfall itself but what the
 * page SAID about it. Every read degraded silently, so a stalled query became a
 * confident empty state — "no active cycle" — or a redirect that blamed the
 * learner's account for a transport failure.
 *
 * Three rules are tested here:
 *
 *   1. a read that FAILED is visible: the page says so and offers a retry,
 *      rather than rendering a confident empty state;
 *   2. "we could not find out who you are" never redirects to login, and "we
 *      could not read your permission" never redirects to /unauthorized — only
 *      a clean negative answer redirects;
 *   3. a read that succeeded and found nothing still renders normally, because
 *      an empty answer is not a failure.
 */

import '@testing-library/jest-dom';
import { render, screen, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const signal = vi.hoisted(() => {
  class RedirectSignal extends Error {
    digest = 'NEXT_REDIRECT';
    constructor(public to: string) {
      super(`redirect:${to}`);
    }
  }
  return { RedirectSignal };
});

const supabase = vi.hoisted(() => ({
  profile: { profile: null as unknown, error: null as Error | null },
  permission: { data: true as unknown, error: null as unknown },
  // Consumed one per user_has_permission call when set, so a test can pass the
  // gate and then fail an action key.
  permissionQueue: [] as Array<{ data: unknown; error: unknown }>,
}));

const service = vi.hoisted(() => ({
  listCyclesServer: vi.fn(),
  getCurrentCycleServer: vi.fn(),
  getCycleByIdServer: vi.fn(),
  getLatestGoldServer: vi.fn(),
  getMyTeam: vi.fn(),
  getMyAttendance: vi.fn(),
  getMyStreak: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new signal.RedirectSignal(to);
  },
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/lib/supabase/server', () => ({
  getEnhancedUserProfile: async () => supabase.profile,
  createClient: async () => ({
    rpc: async () => supabase.permissionQueue.shift() ?? supabase.permission,
  }),
  createServerSupabaseClient: async () => ({}),
}));

vi.mock('@/lib/services/ai-pulse/learner-service', () => ({
  AiPulseLearnerService: service,
}));

vi.mock('@/components/layout/content-layout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock('@/components/navigation', () => ({ PageBreadcrumb: () => null }));

// The cards themselves are not under test — each one is a marker so the test
// can tell "the grid rendered" from "the page gave up".
function stub(testId: string) {
  const Stub = () => <div data-testid={testId} />;
  Stub.displayName = `Stub(${testId})`;
  return Stub;
}
vi.mock('@/app/(routes)/ai-pulse/_components/current-cycle-card', () => ({
  CurrentCycleCard: stub('current-cycle-card'),
}));
vi.mock('@/app/(routes)/ai-pulse/_components/gold-this-week-card', () => ({
  GoldThisWeekCard: stub('gold-card'),
}));
vi.mock('@/app/(routes)/ai-pulse/_components/my-team-card', () => ({
  MyTeamCard: stub('my-team-card'),
}));
vi.mock('@/app/(routes)/ai-pulse/_components/my-attendance-card', () => ({
  MyAttendanceCard: stub('my-attendance-card'),
}));
vi.mock('@/app/(routes)/ai-pulse/_components/quick-actions-card', () => ({
  QuickActionsCard: stub('quick-actions-card'),
}));
vi.mock('@/app/(routes)/ai-pulse/my-pulse/_components/pulse-impact-card', () => ({
  PulseImpactCard: stub('pulse-impact-card'),
}));
vi.mock('@/app/(routes)/ai-pulse/my-pulse/_components/pde-progress-card', () => ({
  PdeProgressCard: stub('pde-progress-card'),
}));
vi.mock('@/app/(routes)/ai-pulse/my-pulse/_components/domain-starter-card', () => ({
  DomainStarterCard: stub('domain-starter-card'),
}));
vi.mock('@/app/(routes)/ai-pulse/my-pulse/_components/prompt-builder-card', () => ({
  PromptBuilderCard: stub('prompt-builder-card'),
}));
vi.mock('@/app/(routes)/ai-pulse/my-pulse/_components/shared-library-card', () => ({
  SharedLibraryCard: stub('shared-library-card'),
}));
vi.mock('@/app/(routes)/ai-pulse/my-pulse/_components/classmates-prompts-card', () => ({
  ClassmatesPromptsCard: stub('classmates-prompts-card'),
}));
vi.mock('@/app/(routes)/ai-pulse/my-pulse/_components/no-prompt-week-card', () => ({
  NoPromptWeekCard: stub('no-prompt-week-card'),
}));
vi.mock('@/app/(routes)/ai-pulse/my-pulse/_components/week-switcher', () => ({
  WeekSwitcher: stub('week-switcher'),
}));

import AiPulseLearnerPage from '@/app/(routes)/ai-pulse/my-pulse/page';

const LEARNER = { id: 'profile-1', is_super_admin: true };
const CYCLE = {
  id: 'cycle-1',
  name: 'AI Pulse — Week of Jul 27',
  start_date: '2026-07-27',
  end_date: null,
  status: 'active',
  config: null,
};
const PENDING_ATTENDANCE = {
  state: 'pending' as const,
  day_type: null,
  marked_at: null,
  signals: null,
};

/** Render the page, or report the redirect it attempted instead. */
async function open(searchParams: Record<string, string> = {}) {
  try {
    const element = await AiPulseLearnerPage({
      searchParams: Promise.resolve(searchParams),
    });
    render(element);
    return { redirectedTo: null as string | null };
  } catch (e) {
    if (e instanceof signal.RedirectSignal) return { redirectedTo: e.to };
    throw e;
  }
}

/** Everything reads cleanly; individual tests break one thing. */
function allReadsSucceed() {
  supabase.profile = { profile: LEARNER, error: null };
  supabase.permission = { data: true, error: null };
  supabase.permissionQueue = [];
  service.listCyclesServer.mockResolvedValue([]);
  service.getCurrentCycleServer.mockResolvedValue(CYCLE);
  service.getCycleByIdServer.mockResolvedValue(CYCLE);
  service.getLatestGoldServer.mockResolvedValue(null);
  service.getMyTeam.mockResolvedValue(null);
  service.getMyAttendance.mockResolvedValue(PENDING_ATTENDANCE);
  service.getMyStreak.mockResolvedValue(0);
}

beforeEach(() => {
  vi.clearAllMocks();
  allReadsSucceed();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('who the learner is', () => {
  it('sends a signed-out visitor to login', async () => {
    supabase.profile = {
      profile: null,
      error: new Error('No authenticated user'),
    };
    const { redirectedTo } = await open();
    expect(redirectedTo).toBe('/auth/login?next=/ai-pulse');
  });

  it('does NOT send a learner to login when the profile read failed', async () => {
    // A transport failure is not a signed-out session. Bouncing them to login
    // tells them to fix an account that is working.
    supabase.profile = { profile: null, error: new Error('fetch failed') };
    const { redirectedTo } = await open();
    expect(redirectedTo).toBeNull();
    expect(screen.getByText(/couldn't load your profile/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /try again/i })).toBeInTheDocument();
  });
});

describe('the permission gate', () => {
  it('sends a learner without the key to /unauthorized', async () => {
    supabase.profile = { profile: { ...LEARNER, is_super_admin: false }, error: null };
    supabase.permission = { data: false, error: null };
    const { redirectedTo } = await open();
    expect(redirectedTo).toBe('/unauthorized?module=ai-pulse');
  });

  it('does NOT send a learner to /unauthorized when the check itself failed', async () => {
    supabase.profile = { profile: { ...LEARNER, is_super_admin: false }, error: null };
    supabase.permission = { data: null, error: { message: 'fetch failed' } };
    const { redirectedTo } = await open();
    expect(redirectedTo).toBeNull();
    expect(
      screen.getByText(/couldn't load your ai pulse access/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /try again/i })).toBeInTheDocument();
  });
});

describe('a failed read', () => {
  it('offers a retry instead of claiming there is no active cycle', async () => {
    service.getCurrentCycleServer.mockRejectedValue(new Error('read failed'));
    const { redirectedTo } = await open();
    expect(redirectedTo).toBeNull();
    expect(
      screen.getByText(/couldn't load your ai pulse week/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /try again/i })).toBeInTheDocument();
    // The confident empty state must NOT be what the learner sees.
    expect(screen.queryByTestId('current-cycle-card')).not.toBeInTheDocument();
  });

  it('offers a retry when the deep-linked week fails to load', async () => {
    service.getCycleByIdServer.mockRejectedValue(new Error('read failed'));
    await open({ cycle: 'cycle-9' });
    expect(
      screen.getByText(/couldn't load your ai pulse week/i),
    ).toBeInTheDocument();
    // The retry keeps the week the learner asked for.
    expect(screen.getByRole('link', { name: /try again/i })).toHaveAttribute(
      'href',
      '/ai-pulse/my-pulse?cycle=cycle-9',
    );
  });

  it('marks a failure with no card of its own and still renders the page', async () => {
    service.listCyclesServer.mockRejectedValue(new Error('read failed'));
    const { redirectedTo } = await open();
    expect(redirectedTo).toBeNull();
    expect(screen.getByText(/part of this page didn't load/i)).toBeInTheDocument();
    // The cards that DID load are still there.
    expect(screen.getByTestId('current-cycle-card')).toBeInTheDocument();
    expect(screen.getByTestId('my-team-card')).toBeInTheDocument();
  });

  it('keeps a historical week that loaded when the current-cycle read failed', async () => {
    // The learner asked for a specific week and we have it. Throwing it away
    // because a read alongside it failed would hide data we already hold.
    const historical = { ...CYCLE, id: 'cycle-9', name: 'Week of Jul 20' };
    service.getCycleByIdServer.mockResolvedValue(historical);
    service.getCurrentCycleServer.mockRejectedValue(new Error('read failed'));

    const { redirectedTo } = await open({ cycle: 'cycle-9' });
    expect(redirectedTo).toBeNull();
    expect(screen.getByTestId('current-cycle-card')).toBeInTheDocument();
    expect(
      screen.queryByText(/couldn't load your ai pulse week/i),
    ).not.toBeInTheDocument();
    // "Viewing a past week" needs the current cycle to be true, so with that
    // read failed the page says what it actually knows.
    expect(
      screen.getByText(/couldn't check whether this is the live week/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/viewing a past week/i)).not.toBeInTheDocument();
    // And no submissions are offered against a week we cannot confirm is open.
    expect(screen.queryByTestId('quick-actions-card')).not.toBeInTheDocument();
  });

  it('gives up only when no week could be read at all', async () => {
    service.getCurrentCycleServer.mockRejectedValue(new Error('read failed'));
    await open();
    expect(
      screen.getByText(/couldn't load your ai pulse week/i),
    ).toBeInTheDocument();
  });

  it('renders My Team as unavailable rather than claiming no team', async () => {
    service.getMyTeam.mockRejectedValue(new Error('read failed'));
    const { redirectedTo } = await open();
    expect(redirectedTo).toBeNull();
    expect(screen.queryByTestId('my-team-card')).not.toBeInTheDocument();
    expect(screen.getByText('My Team')).toBeInTheDocument();
    expect(
      screen.getByText(/not showing a number we can't stand behind/i),
    ).toBeInTheDocument();
    // The rest of the page is untouched.
    expect(screen.getByTestId('current-cycle-card')).toBeInTheDocument();
    expect(screen.getByTestId('my-attendance-card')).toBeInTheDocument();
  });

  it('renders My Attendance as unavailable when the attendance read failed', async () => {
    service.getMyAttendance.mockRejectedValue(new Error('read failed'));
    await open();
    expect(screen.queryByTestId('my-attendance-card')).not.toBeInTheDocument();
    expect(screen.getByText('My Attendance')).toBeInTheDocument();
    expect(screen.getByTestId('my-team-card')).toBeInTheDocument();
  });

  it('renders My Attendance as unavailable when only the streak read failed', async () => {
    // The streak lives on that card; printing 0 would be a measurement nobody
    // took.
    service.getMyStreak.mockRejectedValue(new Error('read failed'));
    await open();
    expect(screen.queryByTestId('my-attendance-card')).not.toBeInTheDocument();
    expect(screen.getByText('My Attendance')).toBeInTheDocument();
  });

  it('says so when an action permission could not be read', async () => {
    supabase.profile = { profile: { ...LEARNER, is_super_admin: false }, error: null };
    // The gate answers cleanly; one action key fails in transport. The learner
    // should not silently lose a button with no explanation.
    supabase.permissionQueue = [
      { data: true, error: null },
      { data: null, error: { message: 'fetch failed' } },
      { data: true, error: null },
      { data: true, error: null },
    ];
    await open();
    expect(screen.getByText(/part of this page didn't load/i)).toBeInTheDocument();
  });
});

describe('what waits on what', () => {
  it('does not make the cycle-scoped reads wait for the Gold read', async () => {
    // Gold has nothing to do with the cycle. While it shared a Promise.all with
    // the cycle reads, team/attendance/streak sat behind it for no reason.
    let goldResolved = false;
    let teamStartedBeforeGold: boolean | null = null;

    service.getLatestGoldServer.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            goldResolved = true;
            resolve(null);
          }, 20);
        }),
    );
    service.getMyTeam.mockImplementation(async () => {
      teamStartedBeforeGold = !goldResolved;
      return null;
    });

    await open();
    expect(teamStartedBeforeGold).toBe(true);
    // And Gold still lands on the page.
    expect(service.getLatestGoldServer).toHaveBeenCalledTimes(1);
  });
});

describe('an empty answer is not a failure', () => {
  it('renders the normal page when there is genuinely no cycle this week', async () => {
    service.getCurrentCycleServer.mockResolvedValue(null);
    const { redirectedTo } = await open();
    expect(redirectedTo).toBeNull();
    // The card says "no active cycle" on its own — and no retry is offered,
    // because nothing failed.
    expect(screen.getByTestId('current-cycle-card')).toBeInTheDocument();
    expect(screen.queryByText(/try again/i)).not.toBeInTheDocument();
  });

  it('renders the normal page when the learner is on no team', async () => {
    service.getMyTeam.mockResolvedValue(null);
    await open();
    expect(screen.getByTestId('my-team-card')).toBeInTheDocument();
    expect(screen.queryByText(/try again/i)).not.toBeInTheDocument();
  });
});
