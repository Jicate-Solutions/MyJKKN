// @vitest-environment jsdom
//
// A learner's own profile has been view-only since 1 Jun (e297d58b97: the
// `learners.my-profile.edit` key is off for learners). The Edit and Complete
// Profile buttons then simply vanished, so learners saw "X of Y fields
// completed", no way to act on it, and nothing saying who could. They filed
// it as a fault: "I couldn't edit my profile" (BUG-003908), "Requesting
// Profile Editing Option" (BUG-004203), "Profile incomplete to give access to
// complete" (BUG-004874), "I want to edit accommodation" (BUG-004987),
// "I can't set profile picture" (BUG-004327) and more.
//
// Pinned here: the page says it is view-only and who can correct it when the
// key is off; says nothing when the learner CAN edit; says nothing while
// permissions are still loading (no flash); and leaves the pending-request
// view alone (it has its own banner).
import '@testing-library/jest-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const perms = { can: vi.fn(), isLoading: false };
let pendingRequest: unknown = null;

vi.mock('@/hooks/use-permissions', () => ({ usePermissions: () => perms }));
vi.mock('@/hooks/learner-profile/use-change-request', () => ({
  usePendingChangeRequest: () => ({ data: pendingRequest }),
}));
vi.mock('@/hooks/learner-profile/use-change-request-mutations', () => ({
  useCreateChangeRequest: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/app/(routes)/learners/my-profile/_components/profile-view', () => ({
  ProfileView: (p: any) => <div>{p.canEdit ? 'edit button shown' : 'profile view'}</div>,
}));
vi.mock('@/app/(routes)/learners/my-profile/_components/pending-changes-banner', () => ({
  PendingChangesBanner: () => <div>pending changes banner</div>,
}));
vi.mock('@/app/(routes)/learners/my-profile/_components/profile-comparison-view', () => ({
  ProfileComparisonView: () => <div>comparison view</div>,
}));
vi.mock('@/app/(routes)/learners/enquiries/_components/enquiry-form', () => ({
  EnquiryForm: () => <div>edit form</div>,
}));
vi.mock('@/app/(routes)/learners/my-profile/_components/change-request-dialog', () => ({
  default: () => null,
}));

import ProfilePageContent from '@/app/(routes)/learners/my-profile/_components/profile-page-content';

const learner = { id: 'l1', first_name: 'A', accommodation_type: 'HOSTEL' } as any;
const NOTICE = 'Your profile is view-only';

beforeEach(() => {
  perms.isLoading = false;
  perms.can.mockReset();
  pendingRequest = null;
});
afterEach(cleanup);

describe('learner own profile, edit key off', () => {
  it('says the profile is view-only and names who can correct it', () => {
    perms.can.mockReturnValue(false);
    render(<ProfilePageContent learner={learner} userId="u1" />);
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    expect(screen.getByText(/ask your institution office/)).toBeInTheDocument();
  });

  it('says nothing when the learner can edit', () => {
    perms.can.mockReturnValue(true);
    render(<ProfilePageContent learner={learner} userId="u1" />);
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
    expect(screen.getByText('edit button shown')).toBeInTheDocument();
  });

  it('says nothing while permissions are still loading', () => {
    perms.isLoading = true;
    perms.can.mockReturnValue(false);
    render(<ProfilePageContent learner={learner} userId="u1" />);
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it('leaves the pending-request view to its own banner', () => {
    perms.can.mockReturnValue(false);
    pendingRequest = { id: 'r1', request_status: 'pending', created_at: '2026-09-01', changed_fields: {} };
    render(<ProfilePageContent learner={learner} userId="u1" />);
    expect(screen.getByText('pending changes banner')).toBeInTheDocument();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });
});
