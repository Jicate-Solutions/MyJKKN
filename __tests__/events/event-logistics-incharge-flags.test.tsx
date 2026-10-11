// @vitest-environment jsdom
// __tests__/events/event-logistics-incharge-flags.test.tsx
//
// PR #4326 review, round 3: /events/[id] hands EventLogistics two flags —
// canManage (editors + the event's in-charges) and canEdit (editors only).
// This renders the real EventLogistics with every board stubbed, and reads the
// canManage each board actually RECEIVES. For an in-charge who is not an
// editor: boards whose writes the live gate admits for an in-charge get true;
// boards whose writes are not scoped to the event (volunteers, certificates,
// bulk import) get false. Tab visibility is unchanged: Budget, Sponsors and
// Incidents still show.

import '@testing-library/jest-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Radix Tabs mounts only the active panel; render every panel so every board's
// props can be read.
vi.mock('@/components/ui/tabs', () => {
  // Hands every prop (the nested content included) straight to a plain div.
  const Pass = (p: object) => <div {...(p as Record<string, never>)} />;
  return { Tabs: Pass, TabsList: Pass, TabsTrigger: Pass, TabsContent: Pass };
});

function stub(key: string) {
  return ({ canManage }: { canManage?: boolean }) => (
    <i data-testid={`board-${key}`} data-manage={String(canManage)} />
  );
}

vi.mock('@/components/events/shared/registrations-board', () => ({ RegistrationsBoard: stub('registrations') }));
vi.mock('@/components/events/shared/sponsors-board', () => ({ SponsorsBoard: stub('sponsors') }));
vi.mock('@/components/events/shared/budget-board', () => ({ BudgetBoard: stub('budget') }));
vi.mock('@/components/events/shared/committees-board', () => ({ CommitteesBoard: stub('committees') }));
vi.mock('@/components/events/shared/checkin-board', () => ({ CheckinBoard: stub('checkin') }));
vi.mock('@/components/events/shared/qr-board', () => ({ QrBoard: stub('qr'), TournamentQrLinks: stub('qr') }));
vi.mock('@/components/events/shared/volunteers-board', () => ({ VolunteersBoard: stub('volunteers') }));
vi.mock('@/components/events/shared/incidents-board', () => ({ IncidentsBoard: stub('incidents') }));
vi.mock('@/components/events/shared/certificates-board', () => ({ CertificatesBoard: stub('certificates') }));
vi.mock('@/components/events/shared/bulk-import-board', () => ({ BulkImportBoard: stub('bulk-import') }));
vi.mock('@/components/events/shared/analytics-board', () => ({ AnalyticsBoard: stub('analytics') }));
vi.mock('@/components/events/shared/kit-board', () => ({ KitBoard: stub('kit') }));
vi.mock('@/components/events/shared/messages-board', () => ({ MessagesBoard: stub('messages') }));

import { EventLogistics } from '@/components/events/shared/event-logistics';

afterEach(cleanup);

function received(props: { canManage: boolean; canEdit?: boolean }) {
  render(
    <EventLogistics
      eventId="e1"
      eventType="cultural"
      hideSensitiveWithoutManage
      {...props}
    />,
  );
  const out: Record<string, boolean> = {};
  for (const el of screen.getAllByTestId(/^board-/)) {
    out[el.getAttribute('data-testid')!.slice('board-'.length)] =
      el.getAttribute('data-manage') === 'true';
  }
  return out;
}

const EDITOR_ONLY_BOARDS = ['volunteers', 'certificates', 'bulk-import'];

describe('EventLogistics — what each board receives', () => {
  it('in-charge, not an editor: write controls only where the live gate admits them', () => {
    expect(received({ canManage: true, canEdit: false })).toEqual({
      registrations: true,
      sponsors: true,
      budget: true,
      committees: true,
      checkin: true,
      qr: true,
      volunteers: false,
      incidents: true,
      certificates: false,
      'bulk-import': false,
      analytics: true,
      kit: true,
      messages: true,
    });
  });

  it('in-charge still SEES Budget, Sponsors and Incidents under hideSensitiveWithoutManage', () => {
    const got = received({ canManage: true, canEdit: false });
    for (const k of ['budget', 'sponsors', 'incidents']) expect(got).toHaveProperty(k);
  });

  it('editor: every board gets true', () => {
    const got = received({ canManage: true, canEdit: true });
    expect(Object.values(got).every(Boolean)).toBe(true);
    expect(Object.keys(got)).toHaveLength(13);
  });

  it('plain viewer: every board gets false and the sensitive tabs are hidden', () => {
    const got = received({ canManage: false, canEdit: false });
    expect(Object.values(got).some(Boolean)).toBe(false);
    for (const k of ['budget', 'sponsors', 'incidents']) expect(got).not.toHaveProperty(k);
  });

  it('a host that passes no canEdit is unchanged (canEdit defaults to canManage)', () => {
    const got = received({ canManage: true });
    for (const k of EDITOR_ONLY_BOARDS) expect(got[k], k).toBe(true);
  });
});
