#!/usr/bin/env tsx
/**
 * scripts/onemark/ingest-board-paper.ts
 *
 * OneMark — past board paper → fp_items DRAFT rows (PRD Appendix B).
 *
 * Reads one Part-I section of a Tamil Nadu State Board Class-12 paper
 * (markdown or plain text, already OCR'd / pdftotext'd) and writes one
 * fp_items row per question with
 *   is_active   = false                (a draft — nothing reaches a learner
 *                                       until a subject Senior Learner approves
 *                                       it on /foundation/onemark/review)
 *   source_key  = 'past_board_exam'    (onemark_item_sources)
 *   source_year / source_sitting / source_series / source_qno  (provenance,
 *                                       PRD B.4 — mandatory for board papers)
 *   tags        = from the RULE TABLE below (first matching rule wins)
 *   option_layout = 'auto'             (render-time decision, PRD §4.3 / §4.5)
 *   bloom_level = NULL                 (the reviewer assigns the JABT level —
 *                                       decision 6; NULL = "not yet reviewed")
 *
 * Usage:
 *   tsx --env-file=.env.local scripts/onemark/ingest-board-paper.ts \
 *     --file paper.md --exam tn_hsc_physics --year 2025 --sitting march \
 *     --series A [--created-by <profile uuid>] [--dry-run] [--print-parse]
 *
 *   --dry-run parses, dedups against the live bank (read-only) and prints
 *   every line prefixed "(dry)". Nothing is written.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (fp_items holds
 * answer keys and is staff-only under RLS; the script runs above RLS, so it is
 * an operator tool, never something a route calls).
 *
 * INPUT FORMAT (what the parser expects):
 *
 *   1. <Tamil stem, one or more lines>              ← Physics papers only
 *      (அ) … (ஆ) … (இ) … (ஈ) …                       ← Tamil options
 *      <English stem, one or more lines>
 *      (a) … (b) … (c) … (d) …                       ← English options; may
 *                                                      also be one per line
 *      Answer: (b)                                   ← optional
 *
 *   A non-numbered line between questions that starts a grouped directive
 *   ("Choose the most appropriate synonyms …") applies to every following
 *   question until the next directive or a self-directing stem (PRD English
 *   B.2 — the reviewer confirms the run length on the review queue).
 *
 *   Underlined words (English synonym / antonym items) may be marked as
 *   <u>word</u>, __word__ or _word_ in the input; they are stored as
 *   <u>word</u> in the stem and stripped before hashing (PRD English B.3).
 *
 *   `[unit:3]` anywhere on the question's first line pins the item to that
 *   unit's topic (onemark_phy_u03 / onemark_eng_u03). Without it topic_id
 *   stays NULL for the reviewer — a board paper does not print the unit.
 *
 *   A trailing "Answer Key" section is also accepted:
 *     ## Answer Key
 *     1. b
 *     2. (d)
 *
 * TWO-HASH DEDUP (PRD B.3):
 *   stem_hash    = sha256(normalise(stem, underline markers removed))
 *   options_hash = sha256(sorted normalised options, joined by '|')
 *   normalise    = NFC, lowercase, strip punctuation, collapse whitespace.
 *   Both sets are seeded from every fp_items row of the exam (active or not)
 *   and grow as the batch is processed, so an in-file repeat is caught too.
 *
 *   What a collision does:
 *     stem AND options match  → SKIP  (a true duplicate — PRD content_hash)
 *     options only match      → SKIP  (lane spec; [risky] — a different stem
 *                                      over the same four options is rare
 *                                      enough to treat as a re-print)
 *     stem only matches       → FLAG, still inserted (PRD English B.3: "same
 *                                      sentence reused with different tag,
 *                                      options or answer — usually legitimate";
 *                                      the PRD A.3 'slackened' synonym /
 *                                      antonym pair is exactly this case).
 *   A flagged draft is not marked in the row — the review queue re-derives
 *   the twin from the stem itself (normaliseStem in the queue's
 *   _lib/approve-rules.ts mirrors `normalise` here) and shows it beside the
 *   draft as "Possible duplicate", so the reviewer decides. Editing the stem
 *   clears the flag; nothing to un-mark.
 *
 *   WHAT IS HASHED: the `stem` and `options` columns as they will be written —
 *   normally the English block. When a question has NO English stem the
 *   parser copies the Tamil stem into `stem` (note "no English stem — Tamil
 *   stem copied…"), and that copy IS hashed. `stem_ta` / `options_ta` are
 *   never hashed.
 *
 * WHAT IS NEVER LOGGED: a full item with its answer. Per-question lines show
 * the question number, a 60-char stem prefix, the tags and whether an answer
 * was found — never which option is correct.
 *
 * Exit codes: 0 parsed (possibly with skips); 1 configuration / fatal error.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OneMarkExamKey = 'tn_hsc_physics' | 'tn_hsc_english';

export interface IngestOptions {
  examKey: OneMarkExamKey;
  year: number;
  sitting: string;
  series: string;
}

export type OptionKey = 'A' | 'B' | 'C' | 'D';

export interface ParsedOption {
  key: OptionKey;
  text: string;
}

export interface ParsedQuestion {
  qno: number;
  unit: number | null;
  stemEn: string;
  stemTa: string | null;
  optionsEn: ParsedOption[];
  optionsTa: ParsedOption[] | null;
  /** 'A'..'D' when the paper (or its key) states it, else null. */
  answer: OptionKey | null;
  /** The grouped directive in force when this question was read, if any. */
  directive: string | null;
  tags: string[];
  /** Parser notes the reviewer should see (e.g. "no English stem"). */
  notes: string[];
}

export interface DedupReport {
  parsed: number;
  inserted: number;
  /** stem AND options matched an existing item — a true duplicate, skipped. */
  skippedContentHash: number;
  /** options matched, stem did not — skipped (lane spec, [risky]). */
  skippedOptionsHash: number;
  /** stem matched, options did not — INSERTED and flagged for the reviewer. */
  flaggedStemHash: number;
  untagged: number;
  missingAnswer: number;
  missingTamil: number;
}

// ---------------------------------------------------------------------------
// Tag rule table — ORDERED; the first rule whose test matches wins.
// Tags are keys from onemark_item_tags (migration 20260917111500).
// [risky — listed in the PR body] every regex here is a guess from the PRD
// §4.1 pattern column; a wrong rule mislabels a draft (the reviewer can fix
// the tag on the queue, but a wrong default is still a wrong default).
// ---------------------------------------------------------------------------

export interface TagRule {
  tag: string;
  test: RegExp;
  /** What the rule reads: the grouped directive, or the English stem. */
  reads: 'directive' | 'stem';
}

export const PHYSICS_TAG_RULES: TagRule[] = [
  { tag: 'fill_in_blank',          reads: 'stem', test: /_{3,}|\.{4,}|\bfill in\b|\bblank\b/i },
  { tag: 'assertion_set',          reads: 'stem', test: /\bassertion\b|\breason\b|\bstatements?\b.*\b(true|false|correct|incorrect)\b|\ball of the above\b|\bwhich of the following\b/i },
  { tag: 'diagram_interpretation', reads: 'stem', test: /\bfigure\b|\bdiagram\b|\bcircuit\b|\bshown (below|above|in)\b|\bcombination of .*gates?\b|\blogic gate/i },
  { tag: 'graph_relationship',     reads: 'stem', test: /\bgraph\b|\bplot\b|\bcurve\b|\bslope\b|\bstraight line\b/i },
  { tag: 'dimensional_analysis',   reads: 'stem', test: /\bdimensions?\b|\bdimensional\b/i },
  { tag: 'unit_conversion',        reads: 'stem', test: /\bunit of\b|\bSI unit\b|\bconvert(ed)?\b|\bexpressed in\b/i },
  // A number with a unit, or a "find / calculate / value of" verb — a value to
  // work out. Placed before the device / law / formula rules so "a transformer
  // with 410 turns … the secondary current is" reads as a numerical, not a
  // device-principle recall (PRD §4.1 lists both tags for that pattern).
  { tag: 'numerical_single_step',  reads: 'stem', test: /\d+(\.\d+)?\s*[×x]\s*10|\b\d+(\.\d+)?\s*(°|Å|nm|mm|cm|km|kg|mC|µC|nC|Nm|NC⁻¹|Am⁻¹|A|V|W|J|T|H|F|Ω|Hz|eV|MeV|u)\b|\bcalculate\b|\bfind the\b|\bvalue of\b|\bhow many\b/ },
  { tag: 'comparison_ratio',       reads: 'stem', test: /\bratio\b|\bcompared (to|with)\b|\btimes (that|the|as)\b/i },
  { tag: 'application_field',      reads: 'stem', test: /\bapplication\b|\bused (in|for|as)\b|\bfield of (study|use|work|application)\b|\bnano ?product\b/i },
  { tag: 'device_principle',       reads: 'stem', test: /\btransformer\b|\bgalvanometer\b|\bdiode\b|\btransistor\b|\bmotor\b|\bgenerator\b|\bsolar cell\b|\bLED\b|\blaser\b|\bdevice\b|\bworks? on\b|\bprinciple of\b|\bemission\b/i },
  { tag: 'law_statement',          reads: 'stem', test: /\blaw\b|\btheorem\b|\bpostulate\b/i },
  { tag: 'formula_recall',         reads: 'stem', test: /\bexpression (for|of)\b|\bformula\b|\bis given by\b|\brelation between\b|\bequation\b/i },
  { tag: 'definition_recall',      reads: 'stem', test: /\bis called\b|\bis defined\b|\bis known as\b|\bterm\b|\brefers to\b|\bsource of\b|\bwhat is\b|\bwhich\b/i },
];

export const ENGLISH_TAG_RULES: TagRule[] = [
  // Grouped directives (PRD §4.2) decide Q1–Q6.
  { tag: 'synonyms',                 reads: 'directive', test: /\bsynonyms?\b|\bsame (in )?meaning\b|\bsimilar in meaning\b/i },
  { tag: 'antonyms',                 reads: 'directive', test: /\bantonyms?\b|\bopposite (in )?meaning\b/i },
  // Inline directives (Q7–Q20 are self-directing).
  { tag: 'synonyms',                 reads: 'stem', test: /\bsynonym\b|\bsame (in )?meaning\b/i },
  { tag: 'antonyms',                 reads: 'stem', test: /\bantonym\b|\bopposite (in )?meaning\b/i },
  { tag: 'phrasal_verbs',            reads: 'stem', test: /\bphrasal verbs?\b/i },
  { tag: 'prepositional_phrases',    reads: 'stem', test: /\bprepositional phrases?\b/i },
  { tag: 'prepositions',             reads: 'stem', test: /\bprepositions?\b/i },
  { tag: 'linkers',                  reads: 'stem', test: /\blinkers?\b|\bconnectives?\b|\bconnectors?\b|\blinking word/i },
  { tag: 'idioms',                   reads: 'stem', test: /\bidioms?\b|\bidiomatic\b/i },
  { tag: 'abbreviations',            reads: 'stem', test: /\babbreviations?\b|\bacronyms?\b|\bexpansion of\b|\bexpand(ed)? form\b|\bstands for\b/i },
  { tag: 'american_british_english', reads: 'stem', test: /\bamerican\b|\bbritish\b/i },
  { tag: 'compound_words',           reads: 'stem', test: /\bcompound words?\b/i },
  { tag: 'blended_words',            reads: 'stem', test: /\bblend(ed|ing)? words?\b|\bblend of\b|\bportmanteau\b/i },
  { tag: 'clipped_words',            reads: 'stem', test: /\bclipped (words?|forms?)\b|\bclipping\b|\bshortened form\b/i },
  { tag: 'prefixes_suffixes',        reads: 'stem', test: /\bprefix(es)?\b|\bsuffix(es)?\b/i },
  { tag: 'question_tags',            reads: 'stem', test: /\bquestion tags?\b|\btag question\b/i },
  { tag: 'polite_expressions',       reads: 'stem', test: /\bpolite\b|\beuphemis(m|tic)\b/i },
  { tag: 'spelling',                 reads: 'stem', test: /\bspell(ing|ed|t)\b|\bmisspel/i },
  { tag: 'syllabification',          reads: 'stem', test: /\bsyllab/i },
  { tag: 'determiners_articles',     reads: 'stem', test: /\bdeterminers?\b|\barticles?\b/i },
  { tag: 'word_forms',               reads: 'stem', test: /\b(noun|adjective|verb|adverb) form\b|\bform of the word\b|\bword forms?\b/i },
  { tag: 'confusable_words',         reads: 'stem', test: /\bhomophones?\b|\bhomonyms?\b|\bconfus(ing|able)\b/i },
  { tag: 'sentence_patterns',        reads: 'stem', test: /\bsentence patterns?\b|\bSV(O|C|A|IO)\b/ },
  { tag: 'singular_plural',          reads: 'stem', test: /\bplural\b|\bsingular\b/i },
  { tag: 'foreign_phrases',          reads: 'stem', test: /\bforeign (phrases?|words?|expressions?)\b|\blatin\b|\bfrench\b/i },
  { tag: 'conjunctions',             reads: 'stem', test: /\bconjunctions?\b/i },
  { tag: 'negative_derivation',      reads: 'stem', test: /\bcannot (be|take|form)\b|\bdoes not (take|form|accept)\b|\bno (derivative|new word)\b|\bnot form\b/i },
];

export function tagFor(
  examKey: OneMarkExamKey,
  stemEn: string,
  directive: string | null,
): string[] {
  const rules = examKey === 'tn_hsc_physics' ? PHYSICS_TAG_RULES : ENGLISH_TAG_RULES;
  for (const rule of rules) {
    const subject = rule.reads === 'directive' ? directive : stemEn;
    if (!subject) continue;
    if (rule.test.test(subject)) return [rule.tag];
  }
  return [];
}

/** A stem is "self-directing" (ends a grouped-directive run — PRD English
 *  B.2) when it carries its own inline directive, i.e. one of the STEM rules
 *  fires. The Physics catch-all (any "which") is excluded because it would
 *  fire on almost every stem. */
export function isSelfDirecting(examKey: OneMarkExamKey, stemEn: string): boolean {
  const rules = examKey === 'tn_hsc_physics' ? PHYSICS_TAG_RULES : ENGLISH_TAG_RULES;
  return rules.some(
    (r) => r.reads === 'stem' && r.tag !== 'definition_recall' && r.test.test(stemEn),
  );
}

// ---------------------------------------------------------------------------
// Normalisation + hashing (PRD B.3)
// ---------------------------------------------------------------------------

const UNDERLINE_MARKERS = /<\/?u>|__|(?<=\s|^)_(?=\S)|(?<=\S)_(?=\s|$|[.,;:!?])/g;

export function normalise(text: string): string {
  return text
    .normalize('NFC')
    .replace(UNDERLINE_MARKERS, '')
    .toLowerCase()
    .replace(/\p{P}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function stemHash(stem: string): string {
  return sha256(normalise(stem));
}

export function optionsHash(options: Array<{ text: string }>): string {
  const sorted = options.map((o) => normalise(o.text)).filter(Boolean).sort();
  return sha256(sorted.join('|'));
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const TAMIL_RE = /[஀-௿]/;
const TAMIL_ALL_RE = /[஀-௿]/g;
const LATIN_RE = /[A-Za-z]/g;
const Q_START_RE = /^\s*(\d{1,2})\s*[.)]\s+(.*)$/;
const UNIT_RE = /\[\s*unit\s*:\s*(\d{1,2})\s*\]/i;
const ANSWER_RE = /^\s*(?:answer|ans|key|விடை)\s*[:.\-–]\s*\(?\s*([a-dA-D]|[அஆஇஈ])\s*\)?/i;
const ANSWER_KEY_HEADING_RE = /^\s*#*\s*answer\s*key\b/i;
const ANSWER_KEY_LINE_RE = /^\s*(\d{1,2})\s*[.):\-–]?\s*\(?\s*([a-dA-D])\s*\)?\s*$/;
const DIRECTIVE_RE = /^\s*(choose|select|pick|fill|identify|match)\b/i;
const NOISE_RE = /^\s*(https?:\/\/|www\.)|^\s*page\s+\d+\s*$|^\s*[-=_*]{3,}\s*$/i;

const EN_MARKER = /\(\s*([a-dA-D])\s*\)|(?<![A-Za-z])([a-dA-D])\)\s/g;
const TA_MARKER = /\(\s*([அஆஇஈ])\s*\)/g;
const TA_TO_KEY: Record<string, OptionKey> = { அ: 'A', ஆ: 'B', இ: 'C', ஈ: 'D' };

export function isTamilLine(line: string): boolean {
  if (!TAMIL_RE.test(line)) return false;
  const tamil = (line.match(TAMIL_ALL_RE) ?? []).length;
  const latin = (line.match(LATIN_RE) ?? []).length;
  return tamil >= latin;
}

function hasEnMarker(line: string): boolean {
  EN_MARKER.lastIndex = 0;
  return EN_MARKER.test(line);
}
function hasTaMarker(line: string): boolean {
  TA_MARKER.lastIndex = 0;
  return TA_MARKER.test(line);
}

/** Split a run of text into (up to) four options on the given marker set. */
function splitOptions(text: string, tamil: boolean): ParsedOption[] {
  const re = tamil ? TA_MARKER : EN_MARKER;
  re.lastIndex = 0;
  const hits: Array<{ key: OptionKey; index: number; len: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = (m[1] ?? m[2] ?? '').trim();
    const key = tamil ? TA_TO_KEY[raw] : (raw.toUpperCase() as OptionKey);
    if (!key) continue;
    hits.push({ key, index: m.index, len: m[0].length });
  }
  const out: ParsedOption[] = [];
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].index + hits[i].len;
    const end = i + 1 < hits.length ? hits[i + 1].index : text.length;
    const body = text.slice(start, end).replace(/\s+/g, ' ').trim();
    if (!out.some((o) => o.key === hits[i].key)) {
      out.push({ key: hits[i].key, text: body });
    }
  }
  return out;
}

/** Canonicalise underline markers to <u>…</u>. */
export function canonicaliseUnderline(stem: string): string {
  return stem
    .replace(/__([^_]+?)__/g, '<u>$1</u>')
    .replace(/(?<=\s|^)_([^\s_][^_]*?)_(?=\s|$|[.,;:!?])/g, '<u>$1</u>');
}

interface Block {
  qno: number;
  unit: number | null;
  lines: string[];
  directiveBefore: string | null;
}

function splitBlocks(text: string): { blocks: Block[]; answerKey: Map<number, OptionKey> } {
  const answerKey = new Map<number, OptionKey>();
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let current: Block | null = null;
  let inAnswerKey = false;
  let pendingDirective: string[] = [];

  for (const raw of lines) {
    const line = raw.replace(/\t/g, ' ');
    if (NOISE_RE.test(line)) continue;
    if (ANSWER_KEY_HEADING_RE.test(line)) {
      inAnswerKey = true;
      current = null;
      continue;
    }
    if (inAnswerKey) {
      const k = ANSWER_KEY_LINE_RE.exec(line);
      if (k) answerKey.set(Number(k[1]), k[2].toUpperCase() as OptionKey);
      continue;
    }
    const q = Q_START_RE.exec(line);
    if (q) {
      const qno = Number(q[1]);
      const rest = q[2];
      const unitMatch = UNIT_RE.exec(rest);
      current = {
        qno,
        unit: unitMatch ? Number(unitMatch[1]) : null,
        lines: [rest.replace(UNIT_RE, '').trim()],
        directiveBefore: pendingDirective.length
          ? pendingDirective.join(' ').replace(/\s+/g, ' ').trim()
          : null,
      };
      pendingDirective = [];
      blocks.push(current);
      continue;
    }
    if (!current) {
      // Preamble. Only a directive-looking run is kept, for the first question.
      if (DIRECTIVE_RE.test(line)) pendingDirective.push(line.trim());
      else if (pendingDirective.length && line.trim()) pendingDirective.push(line.trim());
      continue;
    }
    current.lines.push(line);
  }
  return { blocks, answerKey };
}

function parseBlock(
  block: Block,
  examKey: OneMarkExamKey,
): { q: Omit<ParsedQuestion, 'tags' | 'directive'>; trailingDirective: string | null } {
  const notes: string[] = [];
  const stemTa: string[] = [];
  const stemEn: string[] = [];
  let optsTaText = '';
  let optsEnText = '';
  let answer: OptionKey | null = null;
  const trailing: string[] = [];

  type State = 'stem' | 'opts_ta' | 'stem_en' | 'opts_en' | 'after';
  let state: State = 'stem';

  const countKeys = (t: string, tamil: boolean) => splitOptions(t, tamil).length;

  for (const rawLine of block.lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const ans = ANSWER_RE.exec(line);
    if (ans) {
      const letter = ans[1];
      answer = (TA_TO_KEY[letter] ?? letter.toUpperCase()) as OptionKey;
      continue;
    }

    if (state === 'stem' || state === 'stem_en') {
      if (hasTaMarker(line) && state === 'stem') {
        state = 'opts_ta';
        optsTaText += ' ' + line;
        if (countKeys(optsTaText, true) >= 4) state = 'stem_en';
        continue;
      }
      if (hasEnMarker(line)) {
        state = 'opts_en';
        optsEnText += ' ' + line;
        if (countKeys(optsEnText, false) >= 4) state = 'after';
        continue;
      }
      if (state === 'stem' && isTamilLine(line)) stemTa.push(line);
      else stemEn.push(line);
      continue;
    }
    if (state === 'opts_ta') {
      optsTaText += ' ' + line;
      if (countKeys(optsTaText, true) >= 4) state = 'stem_en';
      continue;
    }
    if (state === 'opts_en') {
      optsEnText += ' ' + line;
      if (countKeys(optsEnText, false) >= 4) state = 'after';
      continue;
    }
    trailing.push(line);
  }

  const optionsEn = splitOptions(optsEnText, false);
  const optionsTa = optsTaText ? splitOptions(optsTaText, true) : null;
  if (optionsEn.length < 4) notes.push(`only ${optionsEn.length} English option(s) found`);
  if (optionsTa && optionsTa.length < 4) notes.push(`only ${optionsTa.length} Tamil option(s) found`);

  let en = canonicaliseUnderline(stemEn.join(' ').replace(/\s+/g, ' ').trim());
  const ta = stemTa.join(' ').replace(/\s+/g, ' ').trim() || null;
  if (!en && ta) {
    en = ta;
    notes.push('no English stem — Tamil stem copied into stem for the reviewer');
  }
  if (examKey === 'tn_hsc_physics' && !ta) notes.push('no Tamil stem');

  const trailingDirective =
    trailing.length && DIRECTIVE_RE.test(trailing[0])
      ? trailing.join(' ').replace(/\s+/g, ' ').trim()
      : null;
  if (trailing.length && !trailingDirective) {
    notes.push(`unparsed trailing text: "${trailing.join(' ').slice(0, 40)}"`);
  }

  return {
    q: {
      qno: block.qno,
      unit: block.unit,
      stemEn: en,
      stemTa: ta,
      optionsEn,
      optionsTa,
      answer,
      notes,
    },
    trailingDirective,
  };
}

export function parsePaper(text: string, examKey: OneMarkExamKey): ParsedQuestion[] {
  const { blocks, answerKey } = splitBlocks(text);
  const out: ParsedQuestion[] = [];
  let directive: string | null = null;
  for (const block of blocks) {
    if (block.directiveBefore) directive = block.directiveBefore;
    const { q, trailingDirective } = parseBlock(block, examKey);
    // PRD English B.2: a grouped directive ends at the next directive or the
    // next self-directing stem. The reviewer confirms the run on the queue.
    if (directive && isSelfDirecting(examKey, q.stemEn)) directive = null;
    const answer = q.answer ?? answerKey.get(q.qno) ?? null;
    const tags = tagFor(examKey, q.stemEn, directive);
    out.push({ ...q, answer, directive, tags });
    if (trailingDirective) directive = trailingDirective;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Row shape (ITEM_SHAPE_CONTRACT: options [{key,text}], answer {correct})
// ---------------------------------------------------------------------------

export function toRow(
  q: ParsedQuestion,
  ctx: IngestOptions & { examDefinitionId: string; topicId: string | null; createdBy: string | null },
) {
  return {
    exam_definition_id: ctx.examDefinitionId,
    topic_id: ctx.topicId,
    q_type: 'mcq_single',
    stem: q.stemEn,
    stem_ta: q.stemTa,
    options: q.optionsEn,
    options_ta: q.optionsTa,
    answer: q.answer ? { correct: q.answer } : { correct: null, pending: true },
    explanation: null,
    explanation_ta: null,
    source: null,
    is_active: false,
    option_layout: 'auto',
    tags: q.tags,
    source_key: 'past_board_exam',
    source_year: ctx.year,
    source_sitting: ctx.sitting,
    source_series: ctx.series,
    source_qno: q.qno,
    bloom_level: null,
    advanced_dimension: null,
    created_by: ctx.createdBy,
    updated_by: ctx.createdBy,
  };
}

// ---------------------------------------------------------------------------
// Dedup driver (pure — the caller supplies the existing hash sets)
// ---------------------------------------------------------------------------

/** 'content' = stem AND options matched; 'options' = options only. A
 *  stem-only match is not a skip reason — it is a flag (see below). */
export type SkipReason = 'content' | 'options';
export type FlagReason = 'stem';

export function dedup(
  questions: ParsedQuestion[],
  existingStemHashes: Set<string>,
  existingOptionHashes: Set<string>,
): {
  keep: ParsedQuestion[];
  skipped: Array<{ q: ParsedQuestion; reason: SkipReason }>;
  /** Kept questions whose stem already exists — inserted, and the reviewer
   *  sees the twin on the queue (PRD English B.3: flag, do not block). */
  flagged: Array<{ q: ParsedQuestion; reason: FlagReason }>;
} {
  const keep: ParsedQuestion[] = [];
  const skipped: Array<{ q: ParsedQuestion; reason: SkipReason }> = [];
  const flagged: Array<{ q: ParsedQuestion; reason: FlagReason }> = [];
  for (const q of questions) {
    const sh = stemHash(q.stemEn);
    const oh = q.optionsEn.length ? optionsHash(q.optionsEn) : null;
    const stemSeen = existingStemHashes.has(sh);
    const optionsSeen = !!oh && existingOptionHashes.has(oh);
    if (stemSeen && optionsSeen) {
      skipped.push({ q, reason: 'content' });
      continue;
    }
    if (optionsSeen) {
      skipped.push({ q, reason: 'options' });
      continue;
    }
    if (stemSeen) {
      q.notes.push('possible duplicate — same stem already in the bank; compare on the queue');
      flagged.push({ q, reason: 'stem' });
    }
    existingStemHashes.add(sh);
    if (oh) existingOptionHashes.add(oh);
    keep.push(q);
  }
  return { keep, skipped, flagged };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `Usage:
  tsx --env-file=.env.local scripts/onemark/ingest-board-paper.ts \\
    --file <paper.md> --exam <tn_hsc_physics|tn_hsc_english> --year <yyyy> \\
    --sitting <march|june|september|supplementary|…> --series <A|B|C|D|code> \\
    [--created-by <profile uuid>] [--dry-run] [--print-parse]`;

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true;
    else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

async function loadExisting(admin: SupabaseClient, examDefinitionId: string) {
  const stems = new Set<string>();
  const opts = new Set<string>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from('fp_items')
      .select('stem, options')
      .eq('exam_definition_id', examDefinitionId)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`reading the bank failed: ${error.message}`);
    for (const row of data ?? []) {
      stems.add(stemHash(String(row.stem ?? '')));
      const o = Array.isArray(row.options) ? (row.options as Array<{ text?: string }>) : [];
      if (o.length) opts.add(optionsHash(o.map((x) => ({ text: String(x?.text ?? '') }))));
    }
    if (!data || data.length < pageSize) break;
  }
  return { stems, opts };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dry = args['dry-run'] === true;
  const P = dry ? '(dry) ' : '';
  const log = (msg: string) => console.log(`${P}${msg}`);

  const file = typeof args.file === 'string' ? args.file : null;
  const examKey = typeof args.exam === 'string' ? (args.exam as OneMarkExamKey) : null;
  const year = typeof args.year === 'string' ? Number(args.year) : NaN;
  const sitting = typeof args.sitting === 'string' ? args.sitting.trim().toLowerCase() : null;
  const series = typeof args.series === 'string' ? args.series.trim().toUpperCase() : null;
  const createdBy = typeof args['created-by'] === 'string' ? args['created-by'] : null;

  if (
    !file ||
    !examKey ||
    !['tn_hsc_physics', 'tn_hsc_english'].includes(examKey) ||
    !Number.isInteger(year) ||
    !sitting ||
    !series
  ) {
    console.error(USAGE);
    process.exit(1);
  }
  if (year < 2000 || year > 2100) {
    console.error(`--year ${year} is outside 2000–2100`);
    process.exit(1);
  }

  const text = fs.readFileSync(path.resolve(file), 'utf8');
  const questions = parsePaper(text, examKey);
  log(`parsed ${questions.length} question(s) from ${file} [${examKey} ${year} ${sitting} series ${series}]`);
  if (questions.length === 0) {
    log('nothing to ingest');
    process.exit(0);
  }

  if (args['print-parse'] === true) {
    for (const q of questions) {
      log(
        `  Q${q.qno} unit=${q.unit ?? '-'} en="${q.stemEn.slice(0, 60)}" ta=${q.stemTa ? 'yes' : 'no'} options=${q.optionsEn.length}/${q.optionsTa?.length ?? 0} directive=${q.directive ? 'yes' : 'no'} tags=[${q.tags.join(',')}] answer=${q.answer ? 'found' : 'MISSING'}${q.notes.length ? ' notes: ' + q.notes.join('; ') : ''}`,
      );
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let admin: SupabaseClient | null = null;
  let examDefinitionId: string | null = null;
  const topicIdByUnit = new Map<number, string>();
  let existing = { stems: new Set<string>(), opts: new Set<string>() };

  if (url && key) {
    admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: exam, error: examError } = await admin
      .from('exam_definitions')
      .select('id')
      .eq('config_key', examKey)
      .maybeSingle();
    if (examError || !exam) {
      console.error(
        `exam_definitions row for ${examKey} not found (${examError?.message ?? 'no row'}) — has migration 20260917111500 been applied?`,
      );
      process.exit(1);
    }
    examDefinitionId = exam.id as string;

    const prefix = examKey === 'tn_hsc_physics' ? 'onemark_phy_u' : 'onemark_eng_u';
    const { data: topics } = await admin
      .from('cdc_exam_syllabus_topics')
      .select('id, config_key')
      .like('config_key', `${prefix}%`);
    for (const t of topics ?? []) {
      const n = Number(String(t.config_key).slice(prefix.length));
      if (Number.isInteger(n)) topicIdByUnit.set(n, t.id as string);
    }

    existing = await loadExisting(admin, examDefinitionId);
    log(
      `bank already holds ${existing.stems.size} stem hash(es) / ${existing.opts.size} options hash(es) for ${examKey}`,
    );
  } else if (dry) {
    log('no NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — dedup runs against this file only, not the bank');
  } else {
    console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to write');
    process.exit(1);
  }

  const { keep, skipped, flagged } = dedup(questions, existing.stems, existing.opts);
  const report: DedupReport = {
    parsed: questions.length,
    inserted: 0,
    skippedContentHash: skipped.filter((s) => s.reason === 'content').length,
    skippedOptionsHash: skipped.filter((s) => s.reason === 'options').length,
    flaggedStemHash: flagged.length,
    untagged: keep.filter((q) => q.tags.length === 0).length,
    missingAnswer: keep.filter((q) => !q.answer).length,
    missingTamil: examKey === 'tn_hsc_physics' ? keep.filter((q) => !q.stemTa).length : 0,
  };

  for (const s of skipped) {
    log(
      `  skip Q${s.q.qno}: duplicate by ${s.reason === 'content' ? 'stem + options hashes (true duplicate)' : 'options-set hash'}`,
    );
  }
  for (const f of flagged) {
    log(`  FLAG Q${f.q.qno}: same normalised stem already in the bank — kept as a draft, reviewer compares on the queue`);
  }

  for (const q of keep) {
    const topicId = q.unit != null ? (topicIdByUnit.get(q.unit) ?? null) : null;
    if (q.unit != null && !topicId && admin) q.notes.push(`unit ${q.unit} has no topic row`);
    const row = examDefinitionId
      ? toRow(q, { examKey, year, sitting, series, examDefinitionId, topicId, createdBy })
      : null;
    // Never the answer letter — only whether one was found.
    log(
      `  Q${q.qno} "${q.stemEn.slice(0, 60)}" tags=[${q.tags.join(',')}] topic=${topicId ? 'set' : 'none'} answer=${q.answer ? 'found' : 'MISSING'}${q.notes.length ? ' notes: ' + q.notes.join('; ') : ''}`,
    );
    if (dry || !admin || !row) continue;
    const { error } = await admin.from('fp_items').insert(row);
    if (error) {
      console.error(`  Q${q.qno} insert failed: ${error.message}`);
      continue;
    }
    report.inserted += 1;
  }

  log(
    `report: parsed=${report.parsed} inserted=${report.inserted}${dry ? ' (would insert ' + keep.length + ')' : ''} skipped_content_hash=${report.skippedContentHash} skipped_options_hash=${report.skippedOptionsHash} flagged_stem_hash=${report.flaggedStemHash} untagged=${report.untagged} missing_answer=${report.missingAnswer} missing_tamil=${report.missingTamil}`,
  );
  if (report.missingAnswer > 0) {
    log('drafts without an answer are saved with answer.correct = null — the reviewer must set it before approving');
  }
}

const invokedDirectly =
  typeof process.argv[1] === 'string' &&
  path.basename(process.argv[1]) === 'ingest-board-paper.ts';
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
