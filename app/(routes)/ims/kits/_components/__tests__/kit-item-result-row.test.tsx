// @vitest-environment jsdom
// #4346 panel round 3: while an add is in flight, the Add button and the
// source picker are disabled so the same screen cannot double-submit.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { KitItemResultRow } from '../kit-item-result-row';
const OPTIONS = [
  { value: 'college' as const, label: 'College store' },
  { value: 'central' as const, label: 'Central store' },
];

afterEach(cleanup);

const item = { id: 'item-1', name: 'Apron', code: 'APR-1', kit_source: null };

function renderRow(pending: boolean, onAdd = vi.fn()) {
  render(
    <KitItemResultRow
      item={item}
      picked="central"
      onPick={vi.fn()}
      sourceOptions={OPTIONS}
      qty="1"
      onQty={vi.fn()}
      cadence="yearly"
      onCadence={vi.fn()}
      pending={pending}
      onAdd={onAdd}
    />,
  );
  return onAdd;
}

describe('KitItemResultRow', () => {
  it('while an add is pending, Add and the source picker are disabled and clicking does nothing', () => {
    const onAdd = renderRow(true);
    const add = screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect((screen.getByRole('combobox', { name: 'Kit source' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(add);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('when idle, Add and the picker are enabled and Add fires once', () => {
    const onAdd = renderRow(false);
    const add = screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement;
    expect(add.disabled).toBe(false);
    expect((screen.getByRole('combobox', { name: 'Kit source' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(add);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});
