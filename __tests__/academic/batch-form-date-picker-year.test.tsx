// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { cleanup, render, screen, fireEvent, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Batch } from '@/types/academics';
import { BatchForm } from '@/app/(routes)/academic/batches/_components/batch-form';

// Radix primitives touch APIs jsdom doesn't implement.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
});

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    isSuperAdmin: false,
    userProfile: { id: 'u1', institution_id: 'inst-1' },
    isLoading: false,
  }),
}));

vi.mock('@/lib/services/organization/organization-service', () => ({
  OrganizationService: {
    getInstitutionNames: vi
      .fn()
      .mockResolvedValue([{ id: 'inst-1', name: 'JKKN College of Pharmacy' }]),
  },
}));

afterEach(() => cleanup());

const batch = {
  id: 'b1',
  batch_year: '2022',
  batch_code: 'BP2022',
  batch_name: 'B.Pharm 2022',
  start_date: '2022-08-01',
  end_date: '2026-05-31',
  is_active: true,
  institution_id: 'inst-1',
} as unknown as Batch;

function openPicker(label: string) {
  // The trigger is the button that carries the currently selected date.
  const trigger = screen
    .getByText(label)
    .closest('div')
    ?.querySelector('button') as HTMLButtonElement;
  fireEvent.click(trigger);
  return within(document.querySelector('.rdp') as HTMLElement);
}

// Each test renders the whole BatchForm (react-hook-form + Radix popover +
// day-picker). Alone that is ~1 s, but under a loaded runner the first render
// took 9 s and tripped vitest's 5 s default while every assertion held — the
// same budget the other full-form render suites use (leave-approval-confirmations).
describe('BatchForm date pickers', { timeout: 20_000 }, () => {
  it('opens the start-date calendar on the batch year, not the current month', () => {
    render(<BatchForm batch={batch} isSubmitting={false} onSubmit={vi.fn()} />);

    const calendar = openPicker('Start Date');

    expect(calendar.getByLabelText('Year')).toHaveTextContent('2022');
    expect(calendar.getByLabelText('Month')).toHaveTextContent('August');
  });

  it('offers a year list reaching back three decades', () => {
    render(<BatchForm batch={batch} isSubmitting={false} onSubmit={vi.fn()} />);

    const calendar = openPicker('Start Date');
    fireEvent.keyDown(calendar.getByLabelText('Year'), { key: 'Enter' });

    const options = within(screen.getByRole('listbox'))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toContain(String(new Date().getFullYear() - 30));
    expect(options).toContain('2022');
  });

  it('jumps the day grid to the year picked in the header', () => {
    render(<BatchForm batch={batch} isSubmitting={false} onSubmit={vi.fn()} />);

    const calendar = openPicker('Start Date');
    fireEvent.keyDown(calendar.getByLabelText('Year'), { key: 'Enter' });
    fireEvent.click(within(screen.getByRole('listbox')).getByText('2019'));

    expect(calendar.getByLabelText('Year')).toHaveTextContent('2019');
    expect(calendar.getByLabelText('Month')).toHaveTextContent('August');
  });

  it('marks 1 August 2022 as selectable rather than disabled', () => {
    render(<BatchForm batch={batch} isSubmitting={false} onSubmit={vi.fn()} />);

    const calendar = openPicker('Start Date');

    const [day] = calendar.getAllByRole('gridcell', { name: '1' });
    expect(day).not.toBeDisabled();
    expect(day).not.toHaveAttribute('aria-disabled', 'true');
  });
});
