// @vitest-environment jsdom
/**
 * CreateIdeaDialog — the "Target department (optional)" picker.
 *
 * WHY THIS TEST EXISTS, since the diff alone does not say it: the picker
 * shipped wired to a prop the board never passed. `departments` was declared
 * `departments?: {...}[]` with a `= []` default, so `departments.map(...)`
 * iterated an empty array and the <Select> rendered exactly one option,
 * "Not specific". `departmentId` could never leave '' and every submit wrote
 * `target_department_id: null`. Measured on production: NULL on 55 of 55 ideas
 * ever filed — arithmetic, not user preference.
 *
 * A test that only asserts "the dialog renders" would have passed on the
 * broken build. So both halves are asserted here:
 *   (a) one option per department PLUS the "Not specific" escape hatch, and
 *   (b) picking a department carries that id into the submitted payload —
 *       the thing that was silently null for 55 ideas.
 *
 * The Radix Select primitives are replaced with a minimal stand-in: Radix's
 * content is portalled and only mounts on a real pointer interaction, which
 * jsdom cannot produce without shimming pointer capture. The stand-in keeps
 * the contract under test — which items the dialog *renders from its props*
 * and what `onValueChange` does to the payload — and drops only the popover
 * mechanics, which are Radix's to test.
 */

import '@testing-library/jest-dom';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';

// Typed to accept its arguments: the tests read them back from
// createIdea.mock.calls, and a zero-arg vi.fn() makes the spread below a
// TS2493 ("tuple type '[]' has no element at index '0'").
const createIdea = vi.fn((..._args: unknown[]) =>
  Promise.resolve({ id: 'idea-1' })
);

vi.mock('@/lib/services/improvement/improvement-service', () => ({
  ImprovementService: {
    createIdea: (...args: unknown[]) => createIdea(...args),
  },
}));

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/ui/select', async () => {
  const React = await import('react');
  const Ctx = React.createContext<{ onValueChange: (v: string) => void }>({
    onValueChange: () => {},
  });

  type Slot = { children?: ReactNode };

  return {
    Select: ({
      value,
      onValueChange,
      ...rest
    }: Slot & { value?: string; onValueChange: (v: string) => void }) => (
      <Ctx.Provider value={{ onValueChange }}>
        <div data-testid="select" data-value={value}>
          {rest.children}
        </div>
      </Ctx.Provider>
    ),
    SelectTrigger: (p: Slot) => <div>{p.children}</div>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => (
      <span>{placeholder}</span>
    ),
    SelectContent: (p: Slot) => <div>{p.children}</div>,
    SelectItem: ({
      value,
      disabled,
      ...rest
    }: Slot & { value: string; disabled?: boolean }) => {
      const { onValueChange } = React.useContext(Ctx);
      return (
        <button
          type="button"
          role="option"
          aria-selected={false}
          data-value={value}
          disabled={disabled}
          onClick={() => onValueChange(value)}
        >
          {rest.children}
        </button>
      );
    },
  };
});

import { CreateIdeaDialog } from '@/app/(routes)/improvement-board/_components/create-idea-dialog';

const AREAS = [{ id: 'area-1', key: 'academics', label: 'Academics' }] as never[];

const DEPARTMENTS = [
  { id: 'dept-1', name: 'Pharmacy Practice' },
  { id: 'dept-2', name: 'Community Medicine' },
  { id: 'dept-3', name: 'Computer Science' },
];

function optionFor(name: string) {
  return screen
    .getAllByRole('option')
    .find((el) => el.textContent?.trim() === name);
}

function renderDialog(departments = DEPARTMENTS) {
  return render(
    <CreateIdeaDialog
      open
      onOpenChange={() => {}}
      areas={AREAS}
      departments={departments}
      onCreated={() => {}}
    />
  );
}

describe('CreateIdeaDialog — target department picker', () => {
  beforeEach(() => {
    createIdea.mockClear();
  });
  afterEach(() => cleanup());

  it('renders one option per department plus the "Not specific" escape hatch', () => {
    renderDialog();

    // The regression: on the broken build this list was ["Not specific"] and
    // nothing else, for every viewer, forever.
    for (const d of DEPARTMENTS) {
      const opt = optionFor(d.name);
      expect(opt, `expected an option for ${d.name}`).toBeInTheDocument();
      expect(opt).toHaveAttribute('data-value', d.id);
    }

    const notSpecific = optionFor('Not specific');
    expect(notSpecific).toBeInTheDocument();
    expect(notSpecific).toHaveAttribute('data-value', 'none');
    expect(notSpecific).not.toBeDisabled();

    // One per department + "Not specific", and nothing extra in that picker.
    const deptPickerOptions = screen.getAllByRole('option').filter((el) => {
      const v = el.getAttribute('data-value');
      return v === 'none' || DEPARTMENTS.some((d) => d.id === v);
    });
    expect(deptPickerOptions).toHaveLength(DEPARTMENTS.length + 1);
  });

  it('carries the chosen department id into target_department_id on submit', async () => {
    renderDialog();

    fireEvent.change(
      screen.getByPlaceholderText('One line that names the improvement…'),
      { target: { value: 'Shorten the pharmacy queue at noon' } }
    );
    fireEvent.click(optionFor('Academics')!);
    fireEvent.change(
      screen.getByPlaceholderText(
        'What is not working today, and who does it affect?'
      ),
      { target: { value: 'Learners wait 40 minutes for a 2 minute collection.' } }
    );
    fireEvent.change(
      screen.getByPlaceholderText('What you would change, concretely.'),
      { target: { value: 'Open a second counter between 12:00 and 14:00.' } }
    );

    fireEvent.click(optionFor('Community Medicine')!);
    fireEvent.click(screen.getByRole('button', { name: 'File idea' }));

    await waitFor(() => expect(createIdea).toHaveBeenCalledTimes(1));
    expect(createIdea.mock.calls[0][0]).toMatchObject({
      area_id: 'area-1',
      target_department_id: 'dept-2',
    });
  });

  // The production shape that decided the label column: JKKN College of
  // Engineering and Technology carries CSE and CSE-PG with the SAME
  // display_name ("Computer Science and Engineering") and DISTINCT
  // department_names ("…" / "… (PG)"). page.tsx therefore labels options with
  // department_name.
  //
  // HONEST SCOPE: this asserts the DIALOG keeps two near-identical labels
  // distinguishable once they reach it. It does NOT re-guard page.tsx's choice
  // of column — that mapping lives in a server component this suite does not
  // render, and the comment there carries the reason. Read the two together.
  it('keeps near-identical departments distinguishable', () => {
    const COLLIDING = [
      { id: 'dept-cse', name: 'Computer Science and Engineering' },
      { id: 'dept-cse-pg', name: 'Computer Science and Engineering (PG)' },
    ];
    renderDialog(COLLIDING);

    // Scope to the department picker by data-value, the way the first test
    // does — the mocked Select flattens every picker into one DOM.
    const labels = screen
      .getAllByRole('option')
      .filter((el) =>
        COLLIDING.some((d) => d.id === el.getAttribute('data-value'))
      )
      .map((el) => el.textContent?.trim())
      .filter((t): t is string => !!t);

    expect(labels).toHaveLength(2);
    expect(new Set(labels).size).toBe(2);
    expect(labels).toContain('Computer Science and Engineering');
    expect(labels).toContain('Computer Science and Engineering (PG)');
  });

  it('still submits with "Not specific" — the field stays optional', async () => {
    renderDialog();

    fireEvent.change(
      screen.getByPlaceholderText('One line that names the improvement…'),
      { target: { value: 'Campus-wide signage is unreadable after dark' } }
    );
    fireEvent.click(optionFor('Academics')!);
    fireEvent.change(
      screen.getByPlaceholderText(
        'What is not working today, and who does it affect?'
      ),
      { target: { value: 'Nobody can read the block names at night.' } }
    );
    fireEvent.change(
      screen.getByPlaceholderText('What you would change, concretely.'),
      { target: { value: 'Backlit signs on every block entrance.' } }
    );

    // Pick a department, then deliberately go back to "Not specific".
    fireEvent.click(optionFor('Pharmacy Practice')!);
    fireEvent.click(optionFor('Not specific')!);
    fireEvent.click(screen.getByRole('button', { name: 'File idea' }));

    await waitFor(() => expect(createIdea).toHaveBeenCalledTimes(1));
    expect(createIdea.mock.calls[0][0]).toMatchObject({
      target_department_id: null,
    });
  });
});
