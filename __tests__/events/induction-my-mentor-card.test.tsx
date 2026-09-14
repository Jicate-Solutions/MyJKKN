// @vitest-environment jsdom
// The mentee side of the Senior Peer Mentor assignment: a fresher can finally
// see WHO their mentor is. Identification only — no contact details.
//
// The behaviours worth pinning: (1) a fresher with no assignment must see
// NOTHING, not an empty placeholder — most colleges don't run the SPM programme,
// and this card sits on a page every fresher loads; (2) a fresher whose mentor
// is a temporary stand-in must be TOLD that, because the admin console tracks
// covers and the mentee previously got a silently different name with no
// explanation; (3) the mentor's phone and email must NEVER render — that is a
// Director's policy call (20261118000000), not a styling preference, so it gets
// a test rather than a comment.
import '@testing-library/jest-dom';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';

const myMentorForEvent = vi.fn();
vi.mock('@/lib/services/induction/induction-volunteer-service', () => ({
  InductionVolunteerService: {
    myMentorForEvent: (...args: unknown[]) => myMentorForEvent(...args),
  },
}));

import { MyMentorCard } from '@/app/(routes)/learners/my-induction/_components/my-mentor-card';

const EVENT_ID = 'd0d995a9-8ab4-4ee8-a90b-e63f42a29d46';

/** Shaped exactly like a live row — the smoke test against prod confirmed all
 *  four optional fields are 635/635 populated, so this is the normal case. */
const MENTOR = {
  mentor_learner_id: '3f1c2b90-1111-4a11-9c31-aa0000000001',
  mentor_name: 'AKSHAYAA D',
  mentor_ident: '731324104002',
  mentor_program: 'B.E. Computer Science and Engineering',
  // No mentor_mobile / mentor_email — 20261118000000 removed both from the RPC.
  mentor_photo_url: null,
  is_cover: false,
  cover_until: null,
  original_mentor_name: null,
  assigned_at: '2026-07-02T09:15:00+00:00',
};

afterEach(() => { cleanup(); vi.clearAllMocks(); });
beforeEach(() => { myMentorForEvent.mockReset(); });

describe('MyMentorCard', () => {
  it('renders nothing for a fresher with no mentor assigned', async () => {
    myMentorForEvent.mockResolvedValue(null);
    const { container } = render(<MyMentorCard eventId={EVENT_ID} />);
    await waitFor(() => expect(myMentorForEvent).toHaveBeenCalledWith(EVENT_ID));
    expect(container).toBeEmptyDOMElement();
  });

  it('stays silent when the read fails rather than showing a broken card', async () => {
    myMentorForEvent.mockRejectedValue(new Error('not authenticated'));
    const { container } = render(<MyMentorCard eventId={EVENT_ID} />);
    await waitFor(() => expect(myMentorForEvent).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('names the mentor and shows their programme and identifier', async () => {
    myMentorForEvent.mockResolvedValue(MENTOR);
    render(<MyMentorCard eventId={EVENT_ID} />);
    expect(await screen.findByText('AKSHAYAA D')).toBeInTheDocument();
    expect(screen.getByText('B.E. Computer Science and Engineering')).toBeInTheDocument();
    expect(screen.getByText('731324104002')).toBeInTheDocument();
  });

  it('never publishes the mentor\'s phone number or email', async () => {
    // The Director declined to expose a senior student's contact details to
    // their whole mentee group. 20261118000000 removed both columns from the
    // RPC; this pins the card so a well-meaning future edit cannot put them
    // back by reading fields the service no longer declares.
    myMentorForEvent.mockResolvedValue(MENTOR);
    render(<MyMentorCard eventId={EVENT_ID} />);
    await screen.findByText('AKSHAYAA D');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    const html = document.body.innerHTML;
    expect(html).not.toMatch(/tel:|mailto:/);
    expect(html).not.toMatch(/@jkkn\.ac\.in/);
    // Any 10-digit run would be an Indian mobile leaking into the markup.
    expect(screen.queryByText(/\b\d{10}\b/)).not.toBeInTheDocument();
  });

  it('ignores contact fields even if a stale RPC still returns them', async () => {
    // Defence in depth for the window where a client hits an un-migrated
    // environment: the shape may still carry them, the card must not use them.
    myMentorForEvent.mockResolvedValue({
      ...MENTOR, mentor_mobile: '6379390028', mentor_email: 'akshayaa.d@jkkn.ac.in',
    });
    render(<MyMentorCard eventId={EVENT_ID} />);
    await screen.findByText('AKSHAYAA D');
    expect(document.body.innerHTML).not.toMatch(/6379390028|akshayaa\.d@jkkn\.ac\.in/);
  });

  it('says plainly when the mentor is a stand-in, and for whom and until when', async () => {
    myMentorForEvent.mockResolvedValue({
      ...MENTOR,
      is_cover: true,
      cover_until: '2026-08-31',
      original_mentor_name: 'JANANI S',
    });
    render(<MyMentorCard eventId={EVENT_ID} />);
    const notice = await screen.findByText(/standing in/i);
    expect(notice).toHaveTextContent('AKSHAYAA is standing in for JANANI S');
    // Built the same way the card builds it — asserting a literal "31 Aug 2026"
    // would pin the runner's locale, and toLocaleDateString gives "Aug 31, 2026"
    // under en-US. The date being PRESENT is the behaviour; its format is not.
    const expected = new Date('2026-08-31T00:00:00')
      .toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    expect(notice).toHaveTextContent(expected);
  });

  it('omits the stand-in notice entirely for a normal assignment', async () => {
    myMentorForEvent.mockResolvedValue(MENTOR);
    render(<MyMentorCard eventId={EVENT_ID} />);
    await screen.findByText('AKSHAYAA D');
    expect(screen.queryByText(/standing in/i)).not.toBeInTheDocument();
  });

  it('degrades gracefully when a mentor has no programme or identifier on file', async () => {
    myMentorForEvent.mockResolvedValue({ ...MENTOR, mentor_program: null, mentor_ident: null });
    render(<MyMentorCard eventId={EVENT_ID} />);
    expect(await screen.findByText('AKSHAYAA D')).toBeInTheDocument();
    // The name still stands alone; no "null" leaking into the UI.
    expect(screen.queryByText(/null/i)).not.toBeInTheDocument();
  });

  it('re-reads when the fresher switches to a different induction', async () => {
    myMentorForEvent.mockResolvedValue(MENTOR);
    const { rerender } = render(<MyMentorCard eventId={EVENT_ID} />);
    await waitFor(() => expect(myMentorForEvent).toHaveBeenCalledWith(EVENT_ID));
    const other = 'a1b2c3d4-2222-4b22-8d42-bb0000000002';
    rerender(<MyMentorCard eventId={other} />);
    await waitFor(() => expect(myMentorForEvent).toHaveBeenCalledWith(other));
  });
});
