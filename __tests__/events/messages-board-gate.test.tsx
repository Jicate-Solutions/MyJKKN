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
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// notification-service builds a Supabase browser client at MODULE level (a
// static initializer) and needs env vars. Stub the factory so the graph loads;
// nothing here touches it. Same workaround as event-logistics-tabs.test.ts.
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({}),
  createAdminClient: () => ({}),
  getSupabaseClient: () => ({}),
}));

import {
  EventMessageError,
  type EventRegistrantMessage,
} from '@/lib/services/events/notification-service';

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

// ---------------------------------------------------------------------------
// The refusal has to be ACTIONABLE, or the ruling fails where it was meant to hold
// ---------------------------------------------------------------------------
// "Show what was sent, allow a deliberate resend." The compose box now refuses a
// message whose words already went out, and told the organiser to use "Send
// again" on it in the list below. The list is the newest 20 messages, with no
// pagination and no lookup by id, while the duplicate guard covers every message
// on the event however old. So on a busy event — the exact situation where an
// organiser is unsure whether a notice went out — they were refused and pointed
// at a button that is not on screen, and there was no route left by which that
// text could be sent at all.
//
// The server now returns the matched ROW with the 409. These tests mount the
// real board and drive that path.

/** One already-sent message, as the API returns it. */
const sentMessage = (over: Partial<EventRegistrantMessage> = {}): EventRegistrantMessage => ({
  id: 'msg-old',
  subject: 'Venue changed',
  body: 'We have moved to the main auditorium.',
  audience_total: 40,
  recipient_count: 34,
  unreachable_count: 6,
  delivered_count: 34,
  notification_id: 'notif-1',
  sent_by: 'actor-1',
  sent_by_name: 'R. Priya',
  sent_at: '2026-03-02T09:00:00.000Z',
  resend_of: null,
  ...over,
});

/** The server said yes, and this is the log + the counts it returned. */
function serverAllowsWith(opts: {
  messages?: EventRegistrantMessage[];
  resendCounts?: Record<string, number>;
  recipient_count?: number;
}) {
  panelState.current = {
    data: {
      audience: {
        recipient_count: opts.recipient_count ?? 34,
        audience_total: 40,
        unreachable: 6,
        truncated: false,
      },
      messages: opts.messages ?? [],
      resendCounts: opts.resendCounts ?? {},
    },
    error: null,
    isLoading: false,
    isError: false,
  };
}

/** Type a message and take it through the confirmation to the send. */
async function composeAndSend(subject: string, body: string) {
  fireEvent.change(screen.getByLabelText(/^subject$/i), { target: { value: subject } });
  fireEvent.change(screen.getByLabelText(/^message$/i), { target: { value: body } });
  fireEvent.click(screen.getByRole('button', { name: /review and send/i }));
  const confirm = await screen.findByRole('button', { name: /^send to 34 registrants$/i });
  fireEvent.click(confirm);
}

describe('a refused duplicate must be reachable, whatever its age', () => {
  it('offers "Send it again" on the matched message even when it is NOT in the visible log', async () => {
    // The log the board holds does NOT contain the match: it is older than the
    // 20 rows the panel shows. This is the case that had no way forward.
    const older = sentMessage({ id: 'msg-from-march', sent_at: '2026-03-02T09:00:00.000Z' });
    serverAllowsWith({
      messages: [
        sentMessage({ id: 'msg-recent', subject: 'Something else', sent_by_name: 'K. Anand' }),
      ],
    });
    sendState.mutateAsync = vi
      .fn()
      .mockRejectedValue(
        new EventMessageError('This message has already been sent.', 'ALREADY_SENT', 409, older)
      );

    render(<MessagesBoard eventId="e1" canManage />);
    await composeAndSend('Venue changed', 'We have moved to the main auditorium.');

    // The refusal is shown AND the message it matched is on screen with it.
    expect(await screen.findByText(/already been sent/i)).toBeInTheDocument();
    expect(screen.getByText(/this is the message it matched/i)).toBeInTheDocument();
    expect(screen.getByText(/R\. Priya/)).toBeInTheDocument();

    // And the way forward is a real, enabled button — not an instruction.
    const again = screen.getByRole('button', { name: /send it again/i });
    expect(again).toBeEnabled();
  });

  it('that button opens the resend confirmation for THAT message', async () => {
    const older = sentMessage({ id: 'msg-from-march', subject: 'Venue changed' });
    serverAllowsWith({ messages: [] });
    sendState.mutateAsync = vi
      .fn()
      .mockRejectedValue(
        new EventMessageError('This message has already been sent.', 'ALREADY_SENT', 409, older)
      );

    render(<MessagesBoard eventId="e1" canManage />);
    await composeAndSend('Venue changed', 'We have moved to the main auditorium.');
    fireEvent.click(await screen.findByRole('button', { name: /send it again/i }));

    // The dialog that states the blast radius, for the matched row.
    expect(
      await screen.findByRole('button', { name: /^send again to 34 registrants$/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/anyone who already received it will receive it again/i))
      .toBeInTheDocument();
  });

  it('shows no recovery block when the failure is not a duplicate', async () => {
    // A 500 must not offer to repeat a message nobody matched.
    serverAllowsWith({ messages: [] });
    sendState.mutateAsync = vi
      .fn()
      .mockRejectedValue(new EventMessageError('The send did not complete.', null, 500));

    render(<MessagesBoard eventId="e1" canManage />);
    await composeAndSend('Venue changed', 'We have moved.');

    expect(await screen.findByText(/did not complete/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send it again/i })).not.toBeInTheDocument();
  });
});

describe('the repeat count is the event\'s, not the page\'s', () => {
  it('renders the SERVER count for a message whose repeats are not in the visible log', () => {
    // Three resends, none of them in `messages`. Derived from the visible rows
    // this rendered nothing at all — a message that WAS repeated reading as
    // never repeated.
    serverAllowsWith({
      messages: [sentMessage({ id: 'msg-old' })],
      resendCounts: { 'msg-old': 3 },
    });
    render(<MessagesBoard eventId="e1" canManage />);
    expect(screen.getByText(/sent again 3 more times/i)).toBeInTheDocument();
  });

  it('claims nothing when the server sent no counts (column not applied yet)', () => {
    serverAllowsWith({ messages: [sentMessage({ id: 'msg-old' })], resendCounts: {} });
    render(<MessagesBoard eventId="e1" canManage />);
    expect(screen.queryByText(/sent again/i)).not.toBeInTheDocument();
  });
});

describe('the resend dialog does not forbid the only use its guard leaves possible', () => {
  it('no longer tells the organiser not to remind people', async () => {
    // The compose box refuses ANY message whose subject and body already exist
    // on this event, so a legitimately repeated announcement — a multi-day
    // event's "Today's session starts at 9am" — can ONLY go out from here.
    serverAllowsWith({ messages: [sentMessage({ id: 'msg-old' })] });
    render(<MessagesBoard eventId="e1" canManage />);
    fireEvent.click(screen.getByRole('button', { name: /send again/i }));

    expect(await screen.findByText(/whether the first send may not have gone out/i))
      .toBeInTheDocument();
    expect(screen.queryByText(/not to remind people/i)).not.toBeInTheDocument();
    // The sentence that carries the safety is unchanged.
    expect(screen.getByText(/anyone who already received it will receive it again/i))
      .toBeInTheDocument();
  });
});
