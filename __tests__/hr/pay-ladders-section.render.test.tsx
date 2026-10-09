// @vitest-environment jsdom
/**
 * Year ladders section on /hr/admin/policies/pay-scales — clicked like a user.
 *
 * REFERENCE ONLY (Director ruling 2026-09-18): the section never saves and never
 * touches a salary. All it may do is report changes through onChange, so every
 * test here asserts exactly what onChange received (or that it was not called).
 *
 * Real reference data, read from the band's data file the same way
 * referenceLaddersFor / referenceNotesFor build Engineering's list (12
 * Engineering ladders + 3 support-staff ladders = 15, and 4 band notes). The
 * module itself is server-only, so this browser-environment test reads the
 * data file, and pay-scales-reference-ladders.test.ts pins that the module
 * returns exactly this.
 */

import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MAX_STEP_PAY, PayLaddersSection } from '@/app/(routes)/hr/admin/policies/pay-scales/_components/pay-ladders-section';
import bandData from '@/lib/hr/pay-scales/jkkn-reference-ladders.data.json';
import type { PayLadder } from '@/types/hr-pay-ladders';

afterEach(() => cleanup());

const refLadders = (): PayLadder[] =>
  structuredClone([...bandData.engineering, ...bandData.support] as PayLadder[]);
const refNotes = (): string[] => structuredClone(bandData.engineeringNotes);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

/** The visible heading of a ladder card. */
function title(l: PayLadder): string {
  return `${l.designation} · ${l.qualification ?? 'any qualification'}`;
}

/** The spoken name on a ladder's buttons and inputs (heading + starting amount). */
function name(l: PayLadder): string {
  return `${l.designation} · ${l.qualification ?? 'any qualification'}, starting ₹${l.steps[0].basic_pay.toLocaleString('en-IN')}`;
}

function renderSection(
  overrides: Partial<React.ComponentProps<typeof PayLaddersSection>> = {}
) {
  const onChange = vi.fn();
  const props = {
    ladders: [] as PayLadder[],
    notes: [] as string[],
    referenceLadders: refLadders(),
    referenceNotes: refNotes(),
    onChange,
    ...overrides,
  };
  const utils = render(<PayLaddersSection {...props} />);
  return { ...utils, onChange, props };
}

describe('reference data sanity (guards the numbers the tests below rely on)', () => {
  it('Engineering has 15 reference ladders with unique ids and 4 notes', () => {
    const ladders = refLadders();
    expect(ladders).toHaveLength(15);
    expect(new Set(ladders.map((l) => l.id)).size).toBe(15);
    expect(refNotes()).toHaveLength(4);
  });
});

describe('PayLaddersSection — empty state and banner', () => {
  it('shows the empty-state text when no ladders are stored', () => {
    renderSection();
    expect(
      screen.getByText('No year ladders stored for this college yet.')
    ).toBeInTheDocument();
  });

  it('shows the reference-only banner', () => {
    renderSection();
    expect(screen.getByText('Reference only')).toBeInTheDocument();
    expect(
      screen.getByText(/Loading or editing them\s+changes nobody.s pay\./)
    ).toBeInTheDocument();
  });

  it('shows "No reference ladders are prepared" when referenceLadders is empty, and no load button', () => {
    renderSection({ referenceLadders: [], referenceNotes: [] });
    expect(
      screen.getByText('No reference ladders are prepared for this college.')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Load JKKN reference ladders/ })
    ).not.toBeInTheDocument();
  });
});

describe('PayLaddersSection — load reference ladders', () => {
  it('opens a preview that says how many will be added and lists each one', () => {
    const { onChange } = renderSection();
    fireEvent.click(
      screen.getByRole('button', { name: /Load JKKN reference ladders/ })
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/15 ladders will be added\./)).toBeInTheDocument();
    for (const l of refLadders()) {
      expect(within(dialog).getAllByText(title(l)).length).toBeGreaterThan(0);
    }
    expect(
      within(dialog).getByRole('button', { name: 'Add 15 ladders' })
    ).toBeEnabled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Cancel closes the preview and calls nothing', () => {
    const { onChange } = renderSection();
    fireEvent.click(
      screen.getByRole('button', { name: /Load JKKN reference ladders/ })
    );
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' })
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Confirm calls onChange once with all 15 ladders and the 4 notes, then closes', () => {
    const { onChange } = renderSection();
    fireEvent.click(
      screen.getByRole('button', { name: /Load JKKN reference ladders/ })
    );
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Add 15 ladders' })
    );
    expect(onChange).toHaveBeenCalledTimes(1);
    const [ladders, notes] = onChange.mock.calls[0];
    expect(ladders).toHaveLength(15);
    expect(ladders).toEqual(refLadders());
    expect(notes).toEqual(refNotes());
    expect(notes).toHaveLength(4);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('with some already stored, the preview counts only the missing ones and keeps stored ones first and untouched', () => {
    const all = refLadders();
    const stored = [{ ...all[2], steps: all[2].steps.map((s) => ({ ...s, basic_pay: 1 })) }];
    const { onChange } = renderSection({ ladders: stored, notes: ['my note'] });
    fireEvent.click(
      screen.getByRole('button', { name: /Load JKKN reference ladders/ })
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/14 ladders will be added\./)).toBeInTheDocument();
    expect(within(dialog).getByText(/1 already stored will be left exactly\s+as it is\./)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add 14 ladders' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const [ladders, notes] = onChange.mock.calls[0];
    expect(ladders).toHaveLength(15);
    expect(ladders[0]).toEqual(stored[0]);
    expect(notes).toEqual(['my note', ...refNotes()]);
  });

  it('with all 15 already present the button is disabled and says so', () => {
    const { onChange } = renderSection({ ladders: refLadders(), notes: refNotes() });
    const btn = screen.getByRole('button', {
      name: /All reference ladders are already loaded/,
    });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('PayLaddersSection — editing a step', () => {
  it('changing one step amount calls onChange with ONLY that step changed; inputs are not mutated', () => {
    const ladders = deepFreeze(refLadders());
    const notes = deepFreeze(refNotes());
    const before = structuredClone(ladders);
    const beforeNotes = structuredClone(notes);
    const { onChange } = renderSection({ ladders, notes });

    const target = ladders[1];
    const step = target.steps[2];
    const input = screen.getByLabelText(
      `${name(target)}, ${step.label}, basic pay in rupees`
    );
    expect(input).toHaveValue(step.basic_pay);
    fireEvent.change(input, { target: { value: '43210' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    const [next, nextNotes] = onChange.mock.calls[0] as [PayLadder[], string[]];

    // exactly one step differs
    expect(next).toHaveLength(15);
    next.forEach((l, i) => {
      if (i !== 1) expect(l).toEqual(before[i]);
    });
    expect(next[1].steps[2].basic_pay).toBe(43210);
    expect({ ...next[1], steps: next[1].steps.filter((_, j) => j !== 2) }).toEqual({
      ...before[1],
      steps: before[1].steps.filter((_, j) => j !== 2),
    });
    expect(next[1].steps[2].label).toBe(step.label);
    expect(nextNotes).toEqual(beforeNotes);

    // inputs untouched
    expect(ladders).toEqual(before);
    expect(notes).toEqual(beforeNotes);
    expect(next).not.toBe(ladders);
  });

  it('typing letters into an amount is ignored', () => {
    const ladders = refLadders();
    const { onChange } = renderSection({ ladders });
    const l = ladders[0];
    const input = screen.getByLabelText(
      `${name(l)}, ${l.steps[0].label}, basic pay in rupees`
    );
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.change(input, { target: { value: 'e' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(input).toHaveValue(l.steps[0].basic_pay);
  });

  it('an amount can be emptied and retyped; nothing is passed up until it is a number', () => {
    const ladders = refLadders();
    const { onChange } = renderSection({ ladders });
    const l = ladders[0];
    const input = screen.getByLabelText(
      `${name(l)}, ${l.steps[0].label}, basic pay in rupees`
    );
    fireEvent.change(input, { target: { value: '' } });
    expect(input).toHaveValue(null);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '18500' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect((onChange.mock.calls[0] as [PayLadder[]])[0][0].steps[0].basic_pay).toBe(18500);
  });

  it('an amount above the most a step may hold is not taken, and leaving the field restores it', () => {
    const ladders = refLadders();
    const { onChange } = renderSection({ ladders });
    const l = ladders[0];
    const input = screen.getByLabelText(
      `${name(l)}, ${l.steps[0].label}, basic pay in rupees`
    );
    fireEvent.change(input, { target: { value: String(MAX_STEP_PAY + 1) } });
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    fireEvent.blur(input);
    expect(input).toHaveValue(l.steps[0].basic_pay);
  });
});

describe('PayLaddersSection — remove', () => {
  it('remove removes exactly that ladder and nothing else', () => {
    const ladders = deepFreeze(refLadders());
    const before = structuredClone(ladders);
    const { onChange } = renderSection({ ladders, notes: refNotes() });
    const victim = ladders[5];
    fireEvent.click(
      screen.getByRole('button', { name: `Remove ladder ${name(victim)}` })
    );
    expect(onChange).toHaveBeenCalledTimes(1);
    const [next, notes] = onChange.mock.calls[0];
    expect(next).toHaveLength(14);
    expect(next).toEqual(before.filter((_, i) => i !== 5));
    expect(next.map((l: PayLadder) => l.id)).not.toContain(victim.id);
    expect(notes).toEqual(refNotes());
    expect(ladders).toEqual(before);
  });
});

describe('PayLaddersSection — disabled', () => {
  it('disabled=true disables every input and every button', () => {
    const { container, onChange } = renderSection({
      ladders: refLadders().slice(0, 3),
      disabled: true,
    });
    const inputs = container.querySelectorAll('input');
    const buttons = screen.getAllByRole('button');
    expect(inputs.length).toBeGreaterThan(0);
    expect(buttons.length).toBe(1 + 3); // load + 3 remove
    inputs.forEach((i) => expect(i).toBeDisabled());
    buttons.forEach((b) => expect(b).toBeDisabled());

    buttons.forEach((b) => fireEvent.click(b));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
