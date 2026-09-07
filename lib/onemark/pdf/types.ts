// File: lib/onemark/pdf/types.ts
//
// OneMark — the shape a paper takes between the database and the renderer.
// Everything the board-format question paper and its answer key need is on
// this model; nothing here knows about Supabase or Chromium.
//
// Rulings of record: specs/onemark-decisions-2026-09-02.md (decisions 6, 14,
// 15, 16). PRD: OneMark_Master_PRD_Physics_v2 §5, OneMark_Master_PRD_English_v2 §5.

import type { OneMarkOptionLayout } from '@/types/onemark';

/** The four series a hall paper may be printed in (decision 16). */
export type PaperSeries = 'A' | 'B' | 'C' | 'D';

export const PAPER_SERIES: readonly PaperSeries[] = ['A', 'B', 'C', 'D'] as const;

/** Resolved layout — `auto` has been decided by the time an item reaches the renderer. */
export type ResolvedOptionLayout = Exclude<OneMarkOptionLayout, 'auto'>;

/** One option as stored in fp_items.options / options_ta: `{ key: 'a', text: '…' }`. */
export interface PaperOption {
  key: string;
  text: string;
}

/** One question as the renderer sees it — bilingual text, resolved layout, the
 *  canonical answer key (only present when the caller asked for the key). */
export interface PaperItem {
  id: string;
  /** 1-based position in the Senior Learner's finalised order (series A). */
  position: number;
  stemEn: string;
  /** Tamil stem; null when the item has not been translated. */
  stemTa: string | null;
  optionsEn: PaperOption[];
  /** Same order as optionsEn; null when not translated. */
  optionsTa: PaperOption[] | null;
  /** Canonical option key (`a`–`d`) — language-neutral (PRD Physics §5.2).
   *  Absent on a paper render; present only when the key was requested. */
  answerKey: string | null;
  explanationEn: string | null;
  explanationTa: string | null;
  optionLayout: OneMarkOptionLayout;
  tags: string[];
  /** JABT level K1–K6 (decision 6). Null when unassigned. */
  bloomLevel: string | null;
  /** cdc_exam_syllabus_topics.display_name, e.g. "Unit 3: Magnetism …". */
  topicLabel: string | null;
  /** cdc_exam_syllabus_topics.config_key, used for the coverage summary. */
  topicKey: string | null;
  /** A grouped section directive this item sits under (English Q1–3 / Q4–6,
   *  PRD English §4.2). Null for self-directing items. */
  directive: string | null;
}

/** Which subject profile drives the header, part label and totals. */
export type PaperSubject = 'physics' | 'english' | 'generic';

export interface PaperModel {
  assessmentId: string;
  title: string;
  subject: PaperSubject;
  examKey: string | null;
  examDisplayName: string;
  /** Tamil block above the English block on every item (PRD Physics §1.2). */
  bilingual: boolean;
  /** How many series the Senior Learner asked for (1–4, decision 16). */
  seriesCount: number;
  /** Name of the Senior Learner who built the paper. */
  facilitatorName: string | null;
  /** Learning studio (cohort) the paper was built for. */
  studioName: string | null;
  generatedAt: string;
  items: PaperItem[];
}

/** An item after series arrangement: its printed number and the option order
 *  it prints in (a permutation of indexes into optionsEn). */
export interface ArrangedItem {
  item: PaperItem;
  /** 1-based printed question number in this series. */
  number: number;
  /** optionOrder[printedIndex] = canonical index into optionsEn. */
  optionOrder: number[];
  layout: ResolvedOptionLayout;
}

export interface ArrangedPaper {
  model: PaperModel;
  series: PaperSeries;
  items: ArrangedItem[];
}

/** A contiguous run of questions under one grouped directive. */
export interface DirectiveRun {
  directive: string;
  /** Index into ArrangedPaper.items (inclusive). */
  from: number;
  to: number;
}
