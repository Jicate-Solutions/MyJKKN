// @vitest-environment jsdom
// #4079 round 8: complaints about the Joint MD raise no bell notice; the
// Director's alert is a banner on the complaints list, fed by
// fn_grievance_confidential_awaiting_count (0 for everybody else).
import '@testing-library/jest-dom';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: () => ({ rpc }) }));
vi.mock('@/lib/grievance/actions', () => ({ updateGrievanceStatusAction: vi.fn() }));

import { ConfidentialAwaitingBanner } from '@/app/(routes)/accreditation/naac/grievance/_components/confidential-awaiting-banner';
import { GrievanceService } from '@/lib/services/grievance/grievance-service';

afterEach(() => {
  cleanup();
  rpc.mockReset();
});

describe('ConfidentialAwaitingBanner', () => {
  it('renders nothing at 0 (the Joint MD, other super admins, everyone but the Director)', () => {
    const { container } = render(<ConfidentialAwaitingBanner count={0} showingOnlyThese={false} onToggle={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('tells the Director how many await him and filters to them', () => {
    const onToggle = vi.fn();
    render(<ConfidentialAwaitingBanner count={3} showingOnlyThese={false} onToggle={onToggle} />);
    expect(screen.getByRole('status')).toHaveTextContent('Confidential: 3 awaiting you');
    fireEvent.click(screen.getByRole('button', { name: 'Show them' }));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('offers the way back while filtered, even once the count reaches 0', () => {
    const onToggle = vi.fn();
    render(<ConfidentialAwaitingBanner count={0} showingOnlyThese onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show all tickets' }));
    expect(onToggle).toHaveBeenCalledWith(false);
  });
});

describe('GrievanceService.getConfidentialAwaitingCount', () => {
  it('returns the database count', async () => {
    rpc.mockResolvedValue({ data: 2, error: null });
    await expect(GrievanceService.getConfidentialAwaitingCount()).resolves.toBe(2);
    expect(rpc).toHaveBeenCalledWith('fn_grievance_confidential_awaiting_count');
  });

  it('reads an error (migration not applied yet) or junk as 0', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'function does not exist' } });
    await expect(GrievanceService.getConfidentialAwaitingCount()).resolves.toBe(0);
    rpc.mockResolvedValue({ data: 'x', error: null });
    await expect(GrievanceService.getConfidentialAwaitingCount()).resolves.toBe(0);
  });
});
