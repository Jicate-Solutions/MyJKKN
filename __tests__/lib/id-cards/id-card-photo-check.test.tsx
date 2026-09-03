// @vitest-environment jsdom
// ============================================================================
// IdCardPhotoCheck — what the per-college photo worklist actually RENDERS.
// Created: 2026-08-26.
//
// WHY A RENDER TEST AND NOT A SCREENSHOT. This page's whole job is to show the
// office a list, so "the logic is right" is not the claim that needs proving —
// "the right thing appears on screen, in the right order, in the right bucket"
// is. A screenshot proves that once, on one machine, and then rots; this runs
// on every pull request. It is also the only route available here: headless
// capture is broken on this machine (Page.captureScreenshot timed out five
// times running) and the click-only test-login path cannot be used because
// NEXT_PUBLIC_TEST_PASSWORD is unset — and planting a credential to get a
// screenshot is not an acceptable trade.
//
// WHAT IS MOCKED, AND WHY THAT IS HONEST. Only the two edges of the component
// are stubbed: the Supabase client (so fixture rows stand in for a live read)
// and the institution-access hook (so a college is selected). Everything
// between them is the real component — the real classifier
// (lib/id-cards/photo-quality.ts, the SAME module the print endpoint's Guard 3
// uses), the real sort, the real summary arithmetic, the real chips and table.
// The import chain reaches createClientSupabaseClient at module init and
// throws without env vars, which is the reason __tests__/lib/id-cards/
// batch-photo-policy.test.ts stubs the same module; this file mirrors it.
//
// WHY IT LIVES UNDER __tests__/lib/id-cards/ AND NOT __tests__/components/.
// Because nothing runs __tests__/components/. Every workflow on main names its
// test paths explicitly, and only lib-unit-suite.yml globs a directory
// (`__tests__/lib/**`). A component test filed under __tests__/components/
// would be exactly the decoration that workflow's own header was written to
// stop — "a PR body could truthfully say 'covered by a test' while nothing on
// the pull request would ever have gone red". A .tsx test already sits in this
// directory (template-editor-helpers.test.tsx), and the jsdom environment is
// requested per-file by the docblock above, so the node-default suite around
// it is unaffected.
//
// `student_photo_url`, `avatar_url` and `learner_id` are existing database
// identifiers (terminology-exempt); the copy a reader sees says "learner".
// ============================================================================

import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// --- jsdom gaps Radix's Select trips over -----------------------------------
beforeAll(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as never;
  }
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

afterEach(() => cleanup());

// --- fixtures ---------------------------------------------------------------
// Shapes taken from the real columns, including the two that a plain null check
// would wave through: an empty string (420 of 764 active team members store one)
// and a roll number typed into the photo field.
const LEARNERS = [
  {
    id: 'l-anitha',
    first_name: 'Anitha',
    last_name: 'Raman',
    roll_number: 'ENG001',
    student_photo_url: 'https://kvizhngldtiuufknvehv.supabase.co/storage/v1/object/public/student-photos/anitha.jpg',
  },
  { id: 'l-bhuvana', first_name: 'Bhuvana', last_name: 'S', roll_number: 'ENG002', student_photo_url: '' },
  { id: 'l-chandran', first_name: 'Chandran', last_name: 'K', roll_number: 'ENG003', student_photo_url: null },
  { id: 'l-divya', first_name: 'Divya', last_name: 'P', roll_number: 'ENG004', student_photo_url: 'EM25305' },
  {
    id: 'l-elango',
    first_name: 'Elango',
    last_name: 'M',
    roll_number: 'ENG005',
    student_photo_url: 'data:image/png;base64,iVBORw0KGgo=',
  },
];

// RETAINED DELIBERATELY THOUGH NOTHING SHOULD READ IT. Until 2026-09-03 the
// component fetched these avatars as a qualifying fallback. The Director
// withdrew that, so the profiles query is gone — and `queriedTables` below
// asserts it is never issued. Bhuvana keeps her account picture precisely so a
// regression that starts honouring it again turns this file red.
const PROFILES = [
  { learner_id: 'l-bhuvana', avatar_url: 'https://kvizhngldtiuufknvehv.supabase.co/storage/v1/object/public/avatars/b.png' },
  { learner_id: 'l-divya', avatar_url: null },
];

/** Every table the component actually queries, in order. */
const queriedTables: string[] = [];

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({
    from(table: string) {
      queriedTables.push(table);
      const builder: Record<string, unknown> = {};
      const self = () => builder;
      builder.select = self;
      builder.eq = self;
      builder.in = self;
      builder.order = self;
      builder.range = self;
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(
          table === 'learners_profiles'
            ? { data: LEARNERS, error: null }
            : { data: PROFILES, error: null }
        ).then(resolve, reject);
      return builder;
    },
  }),
}));

vi.mock('@/hooks/organization/use-institutions-with-access', () => ({
  useInstitutionsWithAccess: () => ({
    institutions: [{ id: 'inst-eng', name: 'JKKN College of Engineering' }],
    loading: false,
  }),
}));

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { default: toast, toast };
});

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { IdCardPhotoCheck } from '@/components/admin/id-cards/id-card-photo-check';

/** The worklist, once the fixture load has settled. */
async function renderWorklist() {
  render(<IdCardPhotoCheck />);
  await waitFor(() => expect(screen.getByText(/of 5 learners/)).toBeInTheDocument());
}

/**
 * A summary tile is <big number> / <label> / <hint>. The hint is the only
 * unique string of the three — "No photograph" is also the chip on every
 * refused row — so the tile is located by its hint and read structurally.
 */
function tile(hint: string) {
  const body = screen.getByText(hint).parentElement as HTMLElement;
  return {
    value: (body.firstElementChild as HTMLElement).textContent,
    label: (body.children[1] as HTMLElement).textContent,
  };
}

/** Learner names in the table, top to bottom. */
function rowNames() {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.querySelector('td')?.textContent);
}

describe('IdCardPhotoCheck — the summary tiles', () => {
  it('counts the two buckets from the real classifier, not a null check', async () => {
    await renderWorklist();

    // 3 refused — no value at all, a roll number in the photo field, AND the
    // empty string whose owner has a login-account picture. All three are real
    // stored values a null check would have waved through as ready.
    expect(tile('60% of this cohort — no card can be printed for them')).toEqual({
      value: '3',
      label: 'No photograph',
    });
    expect(tile('40% have an official photograph on record')).toEqual({
      value: '2',
      label: 'Ready to print',
    });
  });

  it('shows each bucket as a share of the cohort, not a bare number', async () => {
    await renderWorklist();
    expect(
      screen.getByText('60% of this cohort — no card can be printed for them')
    ).toBeInTheDocument();
    expect(screen.getByText('40% have an official photograph on record')).toBeInTheDocument();
  });

  it('never reads profiles.avatar_url at all (reversed 2026-09-03)', async () => {
    await renderWorklist();
    // The strongest form of the rule: the account picture is not weighed and
    // then rejected — it is never fetched. One table, one round trip.
    expect(queriedTables).toContain('learners_profiles');
    expect(queriedTables).not.toContain('profiles');
  });
});

describe('IdCardPhotoCheck — the drive list', () => {
  it('opens on the actionable list: only the people who cannot be printed', async () => {
    await renderWorklist();

    // The view control opens on the refusal list, not on "everyone".
    expect(screen.getByRole('combobox', { name: 'Which list' })).toHaveTextContent(
      'Needs a photograph'
    );
    expect(screen.getByText('3 of 5 learners.', { exact: false })).toBeInTheDocument();

    expect(screen.getByText('Bhuvana S')).toBeInTheDocument();
    expect(screen.getByText('Chandran K')).toBeInTheDocument();
    expect(screen.getByText('Divya P')).toBeInTheDocument();
    expect(screen.queryByText('Anitha Raman')).not.toBeInTheDocument();
    expect(screen.queryByText('Elango M')).not.toBeInTheDocument();
  });

  it('puts the account-picture learner INTO the refusal list (reversed 2026-09-03)', async () => {
    await renderWorklist();
    // This asserted the opposite until 2026-09-03. Bhuvana's official column is
    // an empty string; her login-account picture would render, and under the
    // old rule that printed her card behind a confirmation. It no longer counts,
    // so the photo drive must chase her like anyone else.
    expect(screen.getByText('Bhuvana S')).toBeInTheDocument();
  });

  it('rows lead with the state chip and a link to the fix', async () => {
    await renderWorklist();
    const row = screen.getByText('Chandran K').closest('tr') as HTMLElement;
    expect(within(row).getByText('No photograph')).toBeInTheDocument();
    expect(within(row).getByText('ENG003')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      '/learners/profiles/l-chandran/edit'
    );
  });

  it('orders the refusal list by name', async () => {
    await renderWorklist();
    expect(rowNames()).toEqual(['Bhuvana S', 'Chandran K', 'Divya P']);
  });

  it('orders the WHOLE cohort worst-first, then by name', async () => {
    await renderWorklist();

    const viewSelect = screen.getByRole('combobox', { name: 'Which list' });
    fireEvent.keyDown(viewSelect, { key: 'ArrowDown' });
    await waitFor(() => expect(screen.getByRole('option', { name: 'Everyone' })).toBeVisible());
    fireEvent.click(screen.getByRole('option', { name: 'Everyone' }));

    await waitFor(() => expect(screen.getByText('5 of 5 learners.', { exact: false })).toBeInTheDocument());

    // Cannot be printed at all first, then the people the office does not need
    // to chase — each group alphabetical.
    expect(rowNames()).toEqual([
      'Bhuvana S',
      'Chandran K',
      'Divya P',
      'Anitha Raman',
      'Elango M',
    ]);
  });

  it('gives each bucket its own chip once the whole cohort is shown', async () => {
    await renderWorklist();

    const viewSelect = screen.getByRole('combobox', { name: 'Which list' });
    fireEvent.keyDown(viewSelect, { key: 'ArrowDown' });
    await waitFor(() => expect(screen.getByRole('option', { name: 'Everyone' })).toBeVisible());
    fireEvent.click(screen.getByRole('option', { name: 'Everyone' }));
    await waitFor(() => expect(screen.getByText('5 of 5 learners.', { exact: false })).toBeInTheDocument());

    const chipOf = (name: string) =>
      within(screen.getByText(name).closest('tr') as HTMLElement).getByText(
        /No photograph|Official photograph/
      ).textContent;

    expect(chipOf('Chandran K')).toBe('No photograph');
    expect(chipOf('Divya P')).toBe('No photograph');
    expect(chipOf('Bhuvana S')).toBe('No photograph');
    expect(chipOf('Anitha Raman')).toBe('Official photograph');
    expect(chipOf('Elango M')).toBe('Official photograph');
  });
});
