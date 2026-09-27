// PHYSICS-PLACEHOLDER (BUG-006063): a Physics unit keeps its Tamil name in
// cdc_exam_syllabus_topics.description, but the drafting pickers never read
// that column, so a Physics reviewer saw English unit names only; and the
// English-only "<u>word</u>" hint sat in the Physics draft form as well.

import { readFileSync } from 'fs';
import path from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The select string the picker sent, and the rows PostgREST answers with. */
let selected = '';
let mapRows: Array<{ sort_order: number; topic: Record<string, unknown> | null }> = [];

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({
    from: () => {
      const b: any = {
        select: vi.fn((s: string) => {
          selected = s;
          return b;
        }),
        eq: vi.fn(() => b),
        order: vi.fn(() => Promise.resolve({ data: mapRows, error: null })),
      };
      return b;
    },
  }),
}));
vi.mock('@/app/(routes)/foundation/onemark/review/_actions/approve-draft', () => ({ approveDraft: vi.fn() }));
vi.mock('@/app/(routes)/foundation/onemark/review/_components/asset-attach-panel', () => ({ AssetAttachPanel: () => null }));
vi.mock('@tanstack/react-query', async (orig) => {
  const real = await orig<typeof import('@tanstack/react-query')>();
  const idle = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
  return { ...real, useMutation: () => idle, useQueryClient: () => ({ invalidateQueries: vi.fn() }) };
});

import { listTopicsForExam, topicLabel, type DraftItem } from '@/app/(routes)/foundation/onemark/review/_lib/drafts';
import { DraftCard } from '@/app/(routes)/foundation/onemark/review/_components/draft-card';

// Shaped like production (24 Sep, read-only): every Physics unit's description
// is "<Tamil name> (Vol. N)". The Tamil below is copied from existing repo
// text (lib/onemark/pdf/layout.ts), not newly written.
const PHYSICS_UNIT = {
  id: 't1',
  config_key: 'onemark_phy_u01',
  display_name: 'Unit 1',
  description: 'அதிபரவளையம் (Vol. 1)',
  is_active: true,
};

beforeEach(() => {
  selected = '';
  mapRows = [{ sort_order: 1, topic: PHYSICS_UNIT }];
});

describe('PHYSICS-PLACEHOLDER — a Physics unit shows its Tamil name', () => {
  it('the drafting picker reads description and carries it', async () => {
    const topics = await listTopicsForExam('exam-physics');
    expect(selected).toMatch(/cdc_exam_syllabus_topics!inner\([^)]*\bdescription\b/);
    expect(topics[0].description).toBe('அதிபரவளையம் (Vol. 1)');
  });

  it('a unit with no description still loads', async () => {
    mapRows = [{ sort_order: 1, topic: { ...PHYSICS_UNIT, description: undefined } }];
    const topics = await listTopicsForExam('exam-physics');
    expect(topics[0].description).toBeNull();
  });

  it('Physics: the unit name carries the Tamil name; English: the name only', () => {
    const t = { display_name: 'Unit 1', description: 'அதிபரவளையம் (Vol. 1)' };
    expect(topicLabel(t, 'tn_hsc_physics')).toBe('Unit 1 · அதிபரவளையம் (Vol. 1)');
    // An English unit's description is a sentence about the unit, not a name.
    expect(topicLabel({ display_name: 'Grammar', description: 'Articles, prepositions and tenses.' }, 'tn_hsc_english')).toBe('Grammar');
    expect(topicLabel({ display_name: 'Unit 2', description: null }, 'tn_hsc_physics')).toBe('Unit 2');
  });

  it('both unit pickers show the label, not the bare English name', () => {
    for (const f of ['draft-card.tsx', 'request-drafts-panel.tsx']) {
      const src = readFileSync(path.join(process.cwd(), 'app/(routes)/foundation/onemark/review/_components', f), 'utf8');
      expect(src).toMatch(/\{topicLabel\(t, /);
      expect(src).not.toMatch(/<SelectItem key=\{t\.id\} value=\{t\.id\}>\s*\{t\.display_name\}/);
    }
  });
});

function draft(examKey: string): DraftItem {
  return {
    id: 'd1',
    exam_definition_id: examKey,
    topic_id: null,
    stem: 'Unit of charge is',
    stem_ta: null,
    options: [
      { key: 'A', text: 'coulomb' },
      { key: 'B', text: 'volt' },
      { key: 'C', text: 'ampere' },
      { key: 'D', text: 'ohm' },
    ],
    options_ta: null,
    answer: { correct: 'A' },
    explanation: null,
    explanation_ta: null,
    bloom_level: 'K1',
    is_active: false,
    created_at: '2026-09-24T00:00:00Z',
    updated_at: '2026-09-24T00:00:00Z',
    tags: [],
    option_layout: 'auto',
    source_key: null,
    source_year: null,
  } as unknown as DraftItem;
}

function card(examKey: string) {
  return renderToStaticMarkup(
    <DraftCard draft={draft(examKey)} examId="e1" examKey={examKey} topics={[]} tags={[]} userId="u1" />,
  );
}

describe('PHYSICS-PLACEHOLDER — the <u>word</u> hint is English-only', () => {
  it('the Physics draft form does not offer the underline hint', () => {
    const out = card('tn_hsc_physics');
    expect(out).toContain('placeholder="English stem"');
    expect(out).not.toContain('mark an underlined word');
  });

  it('the English draft form still does', () => {
    expect(card('tn_hsc_english')).toContain('mark an underlined word as &lt;u&gt;word&lt;/u&gt;');
  });
});
