// @vitest-environment jsdom
// Q-1010-395 desk decision (11 Oct): Reset source must ask first — resetting an
// item in a rule blocks hand-over at the counter until the source is set again.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ResetKitSourceButton, RESET_KIT_SOURCE_CONFIRM } from '../reset-kit-source-button';

afterEach(cleanup);

describe('ResetKitSourceButton', () => {
  it('opening the button does NOT reset; it shows the warning first', () => {
    const onConfirm = vi.fn();
    render(<ResetKitSourceButton onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset source' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(RESET_KIT_SOURCE_CONFIRM)).toBeTruthy();
    expect(RESET_KIT_SOURCE_CONFIRM).toBe(
      "Reset this item's source? Until a store admin sets it again, the counter can't hand this item over.",
    );
  });

  it('Cancel closes without resetting', () => {
    const onConfirm = vi.fn();
    render(<ResetKitSourceButton onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset source' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirming calls the reset exactly once', () => {
    const onConfirm = vi.fn();
    render(<ResetKitSourceButton onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset source' }));
    const dialog = screen.getByRole('alertdialog');
    const confirm = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent === 'Reset source',
    )!;
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
