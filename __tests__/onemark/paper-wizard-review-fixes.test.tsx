// OneMark wizard + review defects from the PRD audits BUG-006062 (English) and
// BUG-006063 (Physics). Each block names the audit item it guards; each one
// fails on the code as it was before the fix.

import { readFileSync } from 'fs';
import path from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { renderUnderline } from '@/lib/onemark/underline';
import { Bilingual } from '@/app/(routes)/foundation/onemark/practice/_components/bilingual';
import { QuestionCard } from '@/app/(routes)/foundation/onemark/paper/_components/question-card';
import { StepOutput, publishWindowError } from '@/app/(routes)/foundation/onemark/paper/_components/step-output';
import { StepPreview } from '@/app/(routes)/foundation/onemark/paper/_components/step-preview';
import { StepQuantity } from '@/app/(routes)/foundation/onemark/paper/_components/step-quantity';
import { resolveReviewSubject } from '@/app/(routes)/foundation/onemark/review/_components/draft-queue';
import {
  defaultParams,
  generatePaper,
  manualChapterTotal,
  manualDistributionError,
  type EngineContext,
  type ExamReference,
  type PaperDetail,
  type PaperParams,
  type PaperPolicies,
  type PoolItem,
  type ResolvedQuestion,
} from '@/lib/services/onemark/paper-service';

const noop = () => {};
const act = { isPending: false, mutateAsync: async () => ({}) } as any;
const html = (el: React.ReactElement) => renderToStaticMarkup(el);

// ---------------------------------------------------------------------------
// UNDERLINE — the stem's <u>word</u> is an underline, never literal tags
// ---------------------------------------------------------------------------

describe('UNDERLINE — <u>word</u> renders as an underline on every screen', () => {
  it('renders a <u> element and never the literal tag text', () => {
    const out = html(<p>{renderUnderline('quite <u>artless</u>.')}</p>);
    expect(out).toMatch(/<u[^>]*>artless<\/u>/);
    expect(out).not.toContain('&lt;u&gt;');
    expect(out).toContain('quite ');
  });

  it('trusts <u> only — any other markup stays visible text (no innerHTML)', () => {
    const out = html(<p>{renderUnderline('<b>bold</b> and <u>x</u><img src=x onerror=alert(1)>')}</p>);
    expect(out).toContain('&lt;b&gt;bold&lt;/b&gt;');
    expect(out).toContain('&lt;img');
    expect(out).not.toContain('<img');
    expect(out).toMatch(/<u[^>]*>x<\/u>/);
  });

  it('the learner practice screen (Bilingual) underlines the target word', () => {
    const out = html(<Bilingual lang="en" en="Choose the synonym of <u>artless</u>." ta={null} />);
    expect(out).toMatch(/<u[^>]*>artless<\/u>/);
    expect(out).not.toContain('&lt;u&gt;');
  });
});

// ---------------------------------------------------------------------------
// Question card — ENGLISH-BILINGUAL, TAMIL-LETTERS, UNDERLINE (wizard preview)
// ---------------------------------------------------------------------------

function question(over: Partial<ResolvedQuestion> = {}): ResolvedQuestion {
  return {
    position: 0,
    item_id: 'q1',
    locked: false,
    stem: 'The man was quite <u>artless</u>.',
    stem_ta: null,
    options: [
      { key: 'A', text: 'simple' },
      { key: 'B', text: 'crafty' },
      { key: 'C', text: 'clever' },
      { key: 'D', text: 'tricky' },
    ],
    options_ta: null,
    option_layout: 'auto' as any,
    topic_id: null,
    chapter_name: null,
    tags: [],
    bloom_level: 'K1',
    source_key: null,
    source_year: null,
    override: null,
    swap_available: true,
    lock_warning: null,
    answer: { correct: 'B' },
    explanation: 'Crafty is the opposite.',
    explanation_ta: null,
    ...over,
  };
}

function card(q: ResolvedQuestion, language: 'ta' | 'en' | 'both', monolingual = false) {
  return html(
    <QuestionCard
      question={q}
      language={language}
      monolingual={monolingual}
      canSeeAnswers
      disabled={false}
      exhaustedReason={null}
      onSwap={noop}
      onLock={noop}
      onDrop={noop}
      onOverride={noop}
    />,
  );
}

describe('ENGLISH-BILINGUAL — an English paper previews in English only', () => {
  it('an English paper starts in English; Physics stays bilingual', () => {
    expect(defaultParams({ examKey: 'tn_hsc_english', questionCount: 20 }).preview_language).toBe('en');
    expect(defaultParams({ examKey: 'tn_hsc_physics', questionCount: 15 }).preview_language).toBe('both');
  });

  it('a monolingual card never shows the Tamil placeholder, even under "both" or "ta"', () => {
    for (const lang of ['both', 'ta'] as const) {
      const out = card(question(), lang, true);
      expect(out).not.toContain('Tamil text not yet entered');
      expect(out).toMatch(/<u[^>]*>artless<\/u>/);
    }
  });

  it('Step 3 no longer draws a question-language switch (it lives on Step 4, Physics only)', () => {
    const out = html(
      <StepQuantity draft={physicsParams()} patch={noop} reference={reference('tn_hsc_physics')} policies={POLICIES} disabled={false} />,
    );
    expect(out).not.toContain('Preview language');
  });
});

describe('TAMIL-LETTERS — the Tamil block uses Tamil option letters', () => {
  const ta = question({
    stem: 'Unit of force is',
    stem_ta: 'விசையின் அலகு',
    options: [
      { key: 'A', text: 'newton' },
      { key: 'B', text: 'joule' },
    ],
    options_ta: [
      { key: 'A', text: 'நியூட்டன்' },
      { key: 'B', text: 'ஜூல்' },
    ],
    answer: { correct: 'A' },
    explanation: 'SI unit.',
    explanation_ta: 'SI அலகு.',
  });

  it('Tamil-only: (அ)/(ஆ) labels, a Tamil key letter and the Tamil explanation', () => {
    const out = card(ta, 'ta');
    expect(out).toContain('(அ)');
    expect(out).toContain('(ஆ)');
    expect(out).not.toContain('(a)');
    expect(out).toContain('SI அலகு.');
    expect(out).not.toContain('SI unit.');
  });

  it('Both: the key reads (a) / (அ), as the printed answer key does', () => {
    const out = card(ta, 'both');
    expect(out).toContain('(a) / (அ)');
  });
});

// ---------------------------------------------------------------------------
// PREVIEW-LANG-STEP + BOARD-SHAPE-WARN — Step 4 carries the switch
// ---------------------------------------------------------------------------

const POLICIES: PaperPolicies = {
  question_count: 15,
  question_count_by_exam: { tn_hsc_physics: 15, tn_hsc_english: 20 },
  max_series: 4,
};

function physicsParams(over: Partial<PaperParams> = {}): PaperParams {
  return { ...defaultParams({ examKey: 'tn_hsc_physics', questionCount: 15 }), ...over };
}
function englishParams(over: Partial<PaperParams> = {}): PaperParams {
  return { ...defaultParams({ examKey: 'tn_hsc_english', questionCount: 20 }), ...over };
}

function reference(configKey: string): ExamReference {
  return {
    exam: { id: 'exam-1', config_key: configKey, display_name: 'TN State Board — HSC Subject' } as any,
    chapters: [
      { id: 'u1', display_name: 'Unit 1', pool_count: 5 } as any,
      { id: 'u2', display_name: 'Unit 2', pool_count: 20 } as any,
    ],
    chapter_agnostic_count: 0,
    tags: [],
    levels: { K1: 5, K2: 0, K3: 20, K4: 0, K5: 0, K6: 0 } as any,
    years: { min: null, max: null },
    pool_total: 25,
    cohorts: [{ id: 'c1', term: '2026', school_name: 'School' } as any],
  };
}

function paper(configKey: string, params: PaperParams, questions: ResolvedQuestion[]): PaperDetail {
  return {
    id: 'p1',
    title: 'Mock',
    exam: { id: 'exam-1', config_key: configKey, display_name: 'Subject' } as any,
    cohort_id: null,
    config: {
      state: 'EDITED',
      step: 4,
      params,
      locked_ids: [],
      question_overrides: {},
      resolved_item_ids: questions.map((q) => q.item_id),
      last_generation: null,
      outputs: null,
    } as any,
    questions,
    empty_slots: [],
    board_conflicts: [],
    can_see_answers: true,
    updated_at: '2026-09-24T00:00:00Z',
  };
}

describe('PREVIEW-LANG-STEP — the preview language switch is on the step that shows the text', () => {
  it('a Physics preview offers தமிழ் / English / Both on Step 4', () => {
    const d = physicsParams();
    const out = html(
      <StepPreview paper={paper('tn_hsc_physics', d, [question()])} draft={d} patch={noop} reference={reference('tn_hsc_physics')} act={act} disabled={false} />,
    );
    expect(out).toContain('aria-label="Preview language"');
    expect(out).toContain('தமிழ்');
  });

  it('an English preview offers no switch at all', () => {
    const d = englishParams();
    const out = html(
      <StepPreview paper={paper('tn_hsc_english', d, [question()])} draft={d} patch={noop} reference={reference('tn_hsc_english')} act={act} disabled={false} />,
    );
    expect(out).not.toContain('aria-label="Preview language"');
    expect(out).not.toContain('Tamil text not yet entered');
  });
});

describe('BOARD-SHAPE-WARN — switching the English board shape off warns, never blocks', () => {
  it('Step 3 names what switching it off means', () => {
    const out = html(
      <StepQuantity
        draft={englishParams({ enforce_board_blueprint: false })}
        patch={noop}
        reference={reference('tn_hsc_english')}
        policies={POLICIES}
        disabled={false}
      />,
    );
    expect(out).toContain('no longer match the official board structure');
  });

  it('no warning while the board shape is on', () => {
    const out = html(
      <StepQuantity draft={englishParams()} patch={noop} reference={reference('tn_hsc_english')} policies={POLICIES} disabled={false} />,
    );
    expect(out).not.toContain('no longer match the official board structure');
  });
});

// ---------------------------------------------------------------------------
// MANUAL-DIST — manual counts are exact, capped, and never padded
// ---------------------------------------------------------------------------

function seeded(seed = 7): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}
const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
function pool(): PoolItem[] {
  const mk = (id: string, topic: string, lv: string): PoolItem => ({
    id,
    topic_id: topic,
    bloom_level: lv,
    tags: [],
    source_key: 'past_board_exam',
    source_year: 2023,
    times_served: 0,
  });
  return [
    ...Array.from({ length: 5 }, (_, i) => mk(`u1-${i}`, U1, 'K1')),
    ...Array.from({ length: 20 }, (_, i) => mk(`u2-${i}`, U2, 'K3')),
  ];
}
function ectx(params: Partial<PaperParams>): EngineContext {
  return {
    examKey: 'tn_hsc_physics',
    params: physicsParams(params),
    recentlyUsedIds: new Set(),
    chapterOrder: { [U1]: 1, [U2]: 2 },
    categoryWeights: {},
    rng: seeded(),
  };
}
const run = (params: Partial<PaperParams>) =>
  generatePaper({ pool: pool(), ctx: ectx(params), lockedIds: [], previousIds: [] });
const fromChapter = (slots: (string | null)[], prefix: string) => slots.filter((s) => s?.startsWith(prefix)).length;

describe('MANUAL-DIST — decision 11 in manual distribution', () => {
  it('(A) an all-zero manual set is refused, not filled from anywhere', () => {
    const params = physicsParams({ distribution_mode: 'manual', chapter_counts: { [U1]: 0, [U2]: 0 } });
    expect(manualDistributionError(params, 'tn_hsc_physics')).toMatch(/0 questions/);
    const r = run({ distribution_mode: 'manual', chapter_counts: { [U1]: 0, [U2]: 0 } });
    expect(r.report.selected).toBe(0);
  });

  it('(B) 15 asked from a 5-item chapter: 5 placed, the shortfall named, nothing padded from U2', () => {
    const r = run({ distribution_mode: 'manual', chapter_counts: { [U1]: 15, [U2]: 0 } });
    expect(fromChapter(r.slots, 'u1-')).toBe(5);
    expect(fromChapter(r.slots, 'u2-')).toBe(0);
    expect(r.report.available).toBe(5);
    expect(r.report.chapter_shortfalls).toEqual([{ chapter_id: U1, requested: 15, available: 5 }]);
  });

  it('(C) a level mix beyond the pool is reported, not silently re-levelled', () => {
    const r = run({ level_mix: { K1: 15 } as any });
    expect(r.report.selected).toBe(15);
    expect(r.report.level_shortfalls).toContainEqual({ level: 'K1', requested: 15, available: 5 });
  });

  it('(D) manual 2 + 3 means exactly 2 and 3 — never scaled up to the count', () => {
    const r = run({ distribution_mode: 'manual', chapter_counts: { [U1]: 2, [U2]: 3 } });
    expect(fromChapter(r.slots, 'u1-')).toBe(2);
    expect(fromChapter(r.slots, 'u2-')).toBe(3);
  });

  it('only chapters still in scope count toward the manual total', () => {
    expect(manualChapterTotal({ chapter_ids: [U1], chapter_counts: { [U1]: 4, [U2]: 9 } })).toBe(4);
    expect(manualChapterTotal({ chapter_ids: [], chapter_counts: { [U1]: 4, [U2]: 9 } })).toBe(13);
  });

  it('Step 3 caps a chapter at its pool and shows the running total', () => {
    const out = html(
      <StepQuantity
        draft={physicsParams({ distribution_mode: 'manual', chapter_counts: { u1: 2, u2: 3 } })}
        patch={noop}
        reference={reference('tn_hsc_physics')}
        policies={POLICIES}
        disabled={false}
      />,
    );
    expect(out).toMatch(/5 \/ 15/);
    expect(out).toContain('must add up to 15');
  });
});

// ---------------------------------------------------------------------------
// PUBLISH-GREY + PUBLISH-WARN + DEV-NOTES — Step 5
// ---------------------------------------------------------------------------

describe('PUBLISH-GREY — a Publish that cannot be pressed says why', () => {
  it('names a window that closes before it opens', () => {
    expect(publishWindowError('2026-10-01T10:00', '2026-10-01T09:00')).toMatch(/Closes must be later than Opens/);
  });
  it('names an empty box instead of letting it throw on publish', () => {
    expect(publishWindowError('', '2026-10-01T09:00')).toMatch(/Set both/);
  });
  it('a good window is fine', () => {
    expect(publishWindowError('2026-10-01T09:00', '2026-10-01T10:00')).toBeNull();
  });
  it('with no cohort chosen the step says so', () => {
    const d = physicsParams();
    const out = html(<StepOutput paper={paper('tn_hsc_physics', d, [])} reference={reference('tn_hsc_physics')} act={act} disabled={false} />);
    expect(out).toContain('Choose a cohort to publish.');
  });
});

describe('PUBLISH-WARN — a short paper says so at Output', () => {
  it('1 of 20 questions: the alert names the real count', () => {
    const d = englishParams({ question_count: 20 });
    const out = html(<StepOutput paper={paper('tn_hsc_english', d, [question()])} reference={reference('tn_hsc_english')} act={act} disabled={false} />);
    expect(out).toContain('This paper holds 1 of the 20 questions you asked for');
  });

  it('a full paper shows no alert', () => {
    const d = physicsParams({ question_count: 1 });
    const out = html(<StepOutput paper={paper('tn_hsc_physics', d, [question()])} reference={reference('tn_hsc_physics')} act={act} disabled={false} />);
    expect(out).not.toContain('This paper holds');
  });
});

describe('ENGLISH-BILINGUAL + DEV-NOTES — Step 5 copy', () => {
  it('an English paper is described as English, and no build notes leak', () => {
    const d = englishParams();
    const out = html(<StepOutput paper={paper('tn_hsc_english', d, [question()])} reference={reference('tn_hsc_english')} act={act} disabled={false} />);
    expect(out).toContain('Board-format PDF in English.');
    expect(out).not.toContain('Tamil block then English block');
    expect(out).not.toContain('Lane P');
  });

  it('the review queue empty state names no repository path', () => {
    const src = readFileSync(
      path.join(process.cwd(), 'app/(routes)/foundation/onemark/review/_components/draft-queue.tsx'),
      'utf8',
    );
    expect(src).not.toContain('(scripts/onemark/ingest-board-paper.ts)');
  });
});

// ---------------------------------------------------------------------------
// HELP-OVERLAP — the wizard footer clears the floating Help button below lg
// ---------------------------------------------------------------------------

describe('HELP-OVERLAP', () => {
  it('the footer carries bottom padding below 1024px only', () => {
    const src = readFileSync(
      path.join(process.cwd(), 'app/(routes)/foundation/onemark/paper/_components/paper-wizard.tsx'),
      'utf8',
    );
    expect(src).toContain('flex items-center justify-between pb-12 lg:pb-0');
  });
});

// ---------------------------------------------------------------------------
// REVIEW-DEFAULT — one subject for the whole review page
// ---------------------------------------------------------------------------

describe('REVIEW-DEFAULT — the review page opens on the chosen subject', () => {
  const exams = [
    { id: 'phy', config_key: 'tn_hsc_physics' },
    { id: 'eng', config_key: 'tn_hsc_english' },
  ];
  it('?subject= wins over the stored choice', () => {
    expect(resolveReviewSubject(exams, [null, 'tn_hsc_english', 'tn_hsc_physics'])).toBe('eng');
  });
  it('an unknown ?subject= falls through to the stored choice', () => {
    expect(resolveReviewSubject(exams, [null, 'nonsense', 'tn_hsc_english'])).toBe('eng');
  });
  it('a click beats both', () => {
    expect(resolveReviewSubject(exams, ['tn_hsc_physics', 'tn_hsc_english', 'tn_hsc_english'])).toBe('phy');
  });
  it('nothing chosen: the first subject, as before', () => {
    expect(resolveReviewSubject(exams, [null, null])).toBe('phy');
    expect(resolveReviewSubject([], ['tn_hsc_english'])).toBeNull();
  });
});
