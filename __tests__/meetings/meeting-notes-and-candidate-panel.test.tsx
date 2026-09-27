// @vitest-environment jsdom
//
// Director, 24 Sep 2026 (screenshot): the meeting notes printed their Markdown
// raw ("- **Academic Appointment:** …"), the Interview card repeated the same
// raw text, and the candidate's details were one page away.

import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/app/(routes)/meetings/[uid]/interview-actions', () => ({
  linkMeetingToInterview: vi.fn(),
  unlinkMeetingFromInterview: vi.fn(),
}));

import { MeetingNoteText } from '@/app/(routes)/meetings/[uid]/_components/meeting-note-text';
import {
  InterviewLinkSection,
  type LinkedInterview,
} from '@/app/(routes)/meetings/[uid]/_components/interview-link-section';

afterEach(cleanup);

const NOTE = [
  '- **Academic Appointment:** Discussion on possible academic role.',
  '- **Pending Approvals:** Waiting for the principal.',
].join('\n');

describe('MeetingNoteText', () => {
  it('shows headings in bold and bullets as a list — no asterisks or dashes on screen', () => {
    const { container } = render(<MeetingNoteText text={NOTE} />);
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByText('Academic Appointment:').tagName).toBe('STRONG');
    expect(container.textContent).not.toContain('**');
    expect(container.textContent).not.toMatch(/^-\s/m);
  });

  it('does not render raw HTML typed into a summary', () => {
    const { container } = render(<MeetingNoteText text={'<img src=x onerror="alert(1)"> hello'} />);
    expect(container.querySelector('img')).toBeNull();
  });
});

const base: LinkedInterview = {
  candidateId: 'cand-1',
  candidateName: 'Dr. Example',
  roleTitle: 'Accounts Officer',
  roundName: 'Round 1 — booked through the interview link',
  outcomeSummary: null,
};

const renderLinked = (linked: LinkedInterview) =>
  render(<InterviewLinkSection uid="u1" candidates={[]} jobs={[]} linked={linked} canEdit={false} />);

describe('the Interview card shows the candidate without leaving the meeting', () => {
  it('shows phone, email, current job, pay expectation, why this role, experience and the CV', () => {
    renderLinked({
      ...base,
      profile: {
        email: 'cand@example.com',
        phone: '+91 90000 00001',
        status: 'submitted',
        cvUrl: null,
        currentJob: 'Accounts assistant, Erode',
        payExpectation: '₹45,000 a month',
        whyThisRole: 'I want to grow into institutional finance work.',
        qualification: null,
        experienceMonths: null,
      },
      application: {
        currentJobTitle: null,
        currentCompany: null,
        experienceMonths: 30,
        qualification: 'M.Com',
        resumeUrl: 'https://drive.google.com/file/d/abc/view',
      },
    });
    expect(screen.getByRole('link', { name: '+91 90000 00001' })).toHaveAttribute('href', 'tel:+919000000001');
    expect(screen.getByRole('link', { name: 'cand@example.com' })).toHaveAttribute('href', 'mailto:cand@example.com');
    expect(screen.getByText('Accounts assistant, Erode')).toBeInTheDocument();
    expect(screen.getByText('₹45,000 a month')).toBeInTheDocument();
    expect(screen.getByText('I want to grow into institutional finance work.')).toBeInTheDocument();
    expect(screen.getByText('2 yrs 6 mo')).toBeInTheDocument();
    expect(screen.getByText('M.Com')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open CV/ })).toHaveAttribute('href', 'https://drive.google.com/file/d/abc/view');
    expect(screen.getByRole('link', { name: 'Full candidate record' })).toHaveAttribute(
      'href',
      '/hr/recruitment/candidates/cand-1',
    );
  });

  it('shows nothing about the candidate when the viewer may not read them', () => {
    const { container } = renderLinked({ ...base, profile: null, application: null });
    expect(container.querySelector('dl')).toBeNull();
    expect(screen.queryByText('Full candidate record')).toBeNull();
  });

  it('leaves out a line with no value instead of printing an empty label', () => {
    renderLinked({
      ...base,
      profile: {
        email: 'c@x.com', phone: null, status: null, cvUrl: null, currentJob: null,
        payExpectation: null, whyThisRole: null, qualification: null, experienceMonths: null,
      },
    });
    expect(screen.queryByText('Phone')).toBeNull();
    expect(screen.queryByText('Expects')).toBeNull();
    expect(screen.getByText('Not on file yet')).toBeInTheDocument();
  });

  it('renders the outcome summary formatted, and does not repeat the notes when it is the same text', () => {
    const { container, unmount } = renderLinked({ ...base, outcomeSummary: NOTE });
    expect(container.textContent).not.toContain('**');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    unmount();
    renderLinked({ ...base, outcomeSummary: null, outcomeSameAsNotes: true });
    expect(screen.getByText('The outcome is the Meeting notes summary above.')).toBeInTheDocument();
  });
});
