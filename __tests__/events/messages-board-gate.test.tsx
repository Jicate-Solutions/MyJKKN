// @vitest-environment jsdom
//
// __tests__/events/messages-board-gate.test.tsx
//
// The permission gate, traced per role rather than read for intent.
//
// The board used to refuse on the host page's `canManage` prop. On
// /events/[id] — every non-tournament event, i.e. almost every event — that
// prop is canEditEvent(), which mirrors events_auth_update: super admin, the
// creator, or the grandfather clause for creator-less rows. It recognises
// NEITHER the appointed in-charge (events.config->incharges) NOR an ordinary
// admin. fn_can_manage_event_messages, the authority the route enforces,
// recognises both. So two of the four roles the feature is FOR arrived at a
// "you do not have access" card without a request ever being made.
//
// Each case below is one role's actual path: what canEditEvent() hands the
// board, what the server then answers, and what the organiser therefore sees.

import '@testing-library/jest-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// notification-service builds a Supabase browser client at MODULE level (a
// static initializer) and needs env vars. Stub the factory so the graph loads;
// nothing here touches it. Same workaround as event-logistics-tabs.test.ts.
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({}),
  createAdminClient: () => ({}),
  getSupabaseClient: () => ({}),
}));

import { EventMessageError } from '@/lib/services/events/notification-service';

// The board's two hooks, stubbed so a test states the SERVER's answer directly.
const panelState = vi.hoisted(() => ({
  current: { data: undefined, error: null, isLoading: false, isError: false } as any,
}));
const sendState = vi.hoisted(() => ({ isPending: false, mutateAsync: vi.fn() }));

vi.mock('@/hooks/events/use-events-notifications', () => ({
  useEventMessagePanel: () => panelState.current,
  useSendRegistrantMessage: () => sendState,
}));

import { MessagesBoard } from '@/components/events/shared/messages-board';

/** The server said yes, and here is the audience it resolved. */
function serverAllows(audience: Partial<{ recipient_count: number; unreachable: number }> = {}) {
  panelState.current = {
    data: {
      audience: {
        recipient_count: audience.recipient_count ?? 34,
        audience_total: 40,
        unreachable: audience.unreachable ?? 6,
        truncated: false,
      },
      messages: [],
    },
    error: null,
    isLoading: false,
    isError: false,
  };
}

/** The server said no — the only thing that may produce a denial card. */
function serverDenies() {
  panelState.current = {
    data: undefined,
    error: new EventMessageError('nope', 'NO_ACCESS', 403),
    isLoading: false,
    isError: true,
  };
}

const composeIsUsable = () =>
  Boolean(screen.queryByRole('button', { name: /review and send/i }));
const deniedCardShown = () => Boolean(screen.queryByText(/do not have access/i));

beforeEach(() => {
  sendState.isPending = false;
  sendState.mutateAsync = vi.fn();
});
afterEach(() => cleanup());

describe('who can reach the send surface', () => {
  it('THE EVENT IN-CHARGE can use it on a non-tournament event', () => {
    // canEditEvent() does not model events_incharge_update, so the in-charge
    // arrives with canManage=false on /events/[id]. fn_can_manage_event_messages
    // allows them — and that is the answer that counts.
    serverAllows();
    render(<MessagesBoard eventId="e1" canManage={false} />);
    expect(composeIsUsable()).toBe(true);
    expect(deniedCardShown()).toBe(false);
  });

  it('AN ORDINARY ADMIN can use it on a non-tournament event', () => {
    // is_admin() (role admin / administrator) is a branch of the server gate and
    // not a branch of canEditEvent(), which only short-circuits on
    // is_super_admin. Same arrival, same conclusion.
    serverAllows();
    render(<MessagesBoard eventId="e1" canManage={false} />);
    expect(composeIsUsable()).toBe(true);
  });

  it("THE EVENT'S CREATOR can use it", () => {
    serverAllows();
    render(<MessagesBoard eventId="e1" canManage />);
    expect(composeIsUsable()).toBe(true);
  });

  it('A SUPER ADMIN can use it', () => {
    serverAllows();
    render(<MessagesBoard eventId="e1" canManage />);
    expect(composeIsUsable()).toBe(true);
  });

  it('EVERYONE ELSE is refused — by the server, explicitly, with who to ask', () => {
    serverDenies();
    render(<MessagesBoard eventId="e1" canManage={false} />);
    expect(deniedCardShown()).toBe(true);
    expect(composeIsUsable()).toBe(false);
    // House rule #27: a denial names the people who CAN, never a blank panel.
    expect(screen.getByText(/in-charge/i)).toBeInTheDocument();
  });

  it('renders no registrant data in the refused state', () => {
    serverDenies();
    render(<MessagesBoard eventId="e1" canManage={false} />);
    expect(screen.queryByText(/will receive this/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Already sent/i)).not.toBeInTheDocument();
  });

  it('a permissive host page cannot grant what the server refuses', () => {
    // The prop is not an authority in either direction.
    serverDenies();
    render(<MessagesBoard eventId="e1" canManage />);
    expect(deniedCardShown()).toBe(true);
  });

  it('a restrictive host page cannot suppress the request', () => {
    // The regression that made this feature unreachable: canManage={false}
    // short-circuited the query, so the server was never asked at all.
    serverAllows();
    render(<MessagesBoard eventId="e1" canManage={false} />);
    expect(screen.getByText(/will receive this/i)).toBeInTheDocument();
  });
});

describe('what the board says about who hears nothing', () => {
  it('says the registrations could not be MATCHED, not that the people have no account', () => {
    // An internal learner registered by learner_id has an account; the old copy
    // told the organiser they did not.
    serverAllows({ unreachable: 6 });
    render(<MessagesBoard eventId="e1" canManage />);
    expect(screen.getByText(/could not be matched to a MyJKKN account/i)).toBeInTheDocument();
    expect(screen.queryByText(/registered without a MyJKKN account/i)).not.toBeInTheDocument();
  });

  it('says nothing about unreachable registrants when there are none', () => {
    serverAllows({ unreachable: 0 });
    render(<MessagesBoard eventId="e1" canManage />);
    expect(screen.queryByText(/could not be matched/i)).not.toBeInTheDocument();
  });

  it('states the recipient count before anything is typed', () => {
    serverAllows({ recipient_count: 34 });
    render(<MessagesBoard eventId="e1" canManage />);
    expect(screen.getByText('34')).toBeInTheDocument();
  });
});
