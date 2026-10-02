// @vitest-environment jsdom
// __tests__/campus-walk/routine-check-client.test.tsx
// ============================================================================
// Director answer, 1 Oct 2026 (overruling camera-only): the "All OK" photo may
// come from the camera OR the phone's gallery. So the routine check screen's
// file input accepts any image and carries NO `capture` attribute (which would
// force the camera on phones), and the button says so. The rule that one photo
// cannot close two checks stays on the server (routine-checks.test.ts,
// "All OK refuses a photo already used to close another check").
// ============================================================================

import '@testing-library/jest-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('@/lib/utils/compress-image', () => ({ compressImage: vi.fn() }));
vi.mock('@/lib/services/pde/strip-image-metadata', () => ({ stripImageMetadata: vi.fn() }));

import { CheckClient } from '@/app/(routes)/campus-walk/check/_components/check-client';

const ticket = {
  taskId: 'task-1',
  itemName: 'Desktop PC 12',
  place: 'Block A · Floor 2 · Room 204',
  whatToCheck: 'Check the item is working and safe.',
  dueLabel: 'Due by 12 Oct'
};

afterEach(cleanup);

describe('All OK photo: camera OR gallery (Director, 1 Oct)', () => {
  it('the file input accepts any image and does not force the camera', () => {
    const { container } = render(<CheckClient ticket={ticket} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.getAttribute('accept')).toBe('image/*');
    expect(input.hasAttribute('capture')).toBe(false);
  });

  it('the button offers both: take or choose a photo', () => {
    render(<CheckClient ticket={ticket} />);
    expect(screen.getByRole('button', { name: /take or choose a photo/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^take a photo$/i })).toBeNull();
  });
});
