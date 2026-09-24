// @vitest-environment jsdom
// PR #4010 review, point 5: the unit and tags picked in "Ask for AI questions"
// belong to ONE subject. The subject can also change from the queue's tabs
// below (the page passes a new examId), and that must clear them too — a
// Physics unit must never ride along into an English request.
//
// The REAL panel is rendered. Only its data hooks are stubbed, and the Radix
// Select primitive is swapped for a native <select> so jsdom can drive it.

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const submitted: any[] = [];

vi.mock('@/components/ui/select', () => {
  const Select = ({ value, onValueChange, children }: any) => (
    <select value={value ?? ''} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  );
  const Pass = (p: any) => <>{p.children}</>;
  const Nothing = () => null;
  const SelectItem = (p: any) => <option value={p.value}>{p.children}</option>;
  return { Select, SelectContent: Pass, SelectItem, SelectTrigger: Nothing, SelectValue: Nothing };
});

vi.mock('@/app/(routes)/foundation/onemark/review/_lib/drafts', async (orig) => {
  const real = await orig<typeof import('@/app/(routes)/foundation/onemark/review/_lib/drafts')>();
  const topics: Record<string, any[]> = {
    phy: [{ id: 'unit-phy-1', display_name: 'Electrostatics', description: null }],
    eng: [{ id: 'unit-eng-1', display_name: 'Prose 1', description: null }],
  };
  const tags: Record<string, any[]> = {
    phy: [{ key: 'numerical', label: 'Numerical' }],
    eng: [{ key: 'synonyms', label: 'Synonyms' }],
  };
  return {
    ...real,
    useOneMarkExams: () => ({
      data: [
        { id: 'phy', config_key: 'tn_hsc_physics', display_name: 'TN State Board — HSC Physics' },
        { id: 'eng', config_key: 'tn_hsc_english', display_name: 'TN State Board — HSC English' },
      ],
      isLoading: false,
      isError: false,
    }),
    useDraftTopics: (examId: string | null) => ({ data: examId ? topics[examId] : [] }),
    useDraftTags: (examId: string | null) => ({ data: examId ? tags[examId] : [] }),
  };
});

vi.mock('@/hooks/onemark/use-draft-request', () => ({
  useDraftBudget: () => ({
    caps: {
      live: true,
      dailyCap: 5,
      usedToday: 0,
      remainingToday: 5,
      blocked: false,
      resetsAt: '2026-09-25T00:00:00.000Z',
      freeLane: true,
      monthlyCapInr: null,
      readFailed: false,
    },
    today: [],
    isLoading: false,
    isError: false,
    refetch: () => {},
  }),
  useSubmitDraftRequest: () => ({
    isPending: false,
    mutateAsync: async (arg: any) => {
      submitted.push(arg);
      return { ok: true, message: 'Queued.', jobId: null };
    },
  }),
  useDraftJobStatus: () => ({ view: null }),
}));

import { RequestDraftsPanel } from '@/app/(routes)/foundation/onemark/review/_components/request-drafts-panel';

afterEach(() => {
  cleanup();
  submitted.length = 0;
});

function unitSelect(): HTMLSelectElement {
  const all = screen.getAllByRole('combobox') as HTMLSelectElement[];
  return all.find((s) => [...s.options].some((o) => o.value === '__any_unit'))!;
}

describe('REQUEST-PANEL — a subject change from outside the panel clears unit and tags', () => {
  it('switching the queue tab (a new examId prop) resets the Physics unit and tag', async () => {
    const { rerender } = render(<RequestDraftsPanel examId="phy" onSubjectChange={() => {}} />);

    fireEvent.change(unitSelect(), { target: { value: 'unit-phy-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Numerical' }));
    expect(unitSelect().value).toBe('unit-phy-1');

    // The queue's English tab changes the page's subject; the panel only sees the prop.
    rerender(<RequestDraftsPanel examId="eng" onSubjectChange={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Synonyms' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ask for these questions' }));
    });

    expect(submitted).toHaveLength(1);
    expect(submitted[0].input.exam_definition_id).toBe('eng');
    expect(submitted[0].input.topic_id).toBeNull();
    expect(submitted[0].input.tag_keys).toEqual(['synonyms']);
  });

  it('with nothing picked in the new subject, asking is held until a tag is chosen', () => {
    const { rerender } = render(<RequestDraftsPanel examId="phy" onSubjectChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Numerical' }));
    rerender(<RequestDraftsPanel examId="eng" onSubjectChange={() => {}} />);
    expect(screen.getByText('Pick at least one category tag.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Ask for these questions' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
