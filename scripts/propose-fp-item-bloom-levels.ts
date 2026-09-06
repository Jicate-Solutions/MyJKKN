#!/usr/bin/env tsx
/**
 * scripts/propose-fp-item-bloom-levels.ts
 *
 * Reads the Foundation Programme item bank (`fp_items`) and PROPOSES a Bloom
 * cognitive level (K1-K6) for every question from its stem and options.
 *
 * Created 2026-08-05.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  THIS SCRIPT NEVER WRITES. It has no UPDATE, no INSERT, no RPC call.
 *  Its output is a REVIEWABLE PROPOSAL for an academic reviewer to accept,
 *  amend or reject. Nothing reaches `fp_items.bloom_level` until a human
 *  signs off on the artifact this script produces.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Why a script and not a data migration
 *   These are Class 6-8 teaching questions. AI-authored curricular judgements
 *   at JKKN have passed every automated gate and still been wrong. A back-tag
 *   applied by migration would be a machine's opinion written into the bank
 *   with no reviewer in the loop. So the machine proposes, in a file a Senior Learner
 *   can read line by line, and the Senior Learner disposes.
 *
 * Scope: K1-K6 ONLY — no A1/A2/A3.
 *   The JKKN Advanced Bloom's Taxonomy (JABT) adds three Fink dimensions
 *   alongside Bloom's six, but attaches an EVIDENCE RULE to each: A1 Human
 *   Dimension needs "observed conduct · a named-person interaction · a role
 *   taken", A2 Caring needs "a sustained choice · honest recording of an
 *   inconvenient result", and both explicitly exclude self-report. Every row
 *   in `fp_items` is an auto-scored single-answer MCQ, a format that can
 *   produce none of that evidence. Tagging one with an A-code would assert
 *   evidence the format cannot generate. The A-verb lists are also still
 *   awaiting academic review. So: K only.
 *   See specs/jkkn-advanced-blooms-taxonomy-2026-07-30.md §4, §5.
 *
 * How the proposal is made — an ORDERED rule list, first match wins.
 *   Deliberately small and readable rather than clever: an academic reviewer
 *   must be able to see WHY a level was proposed and overrule it. Every row
 *   carries the rule that fired, a one-line reason, and a confidence flag so
 *   review effort goes where the heuristic is weakest.
 *
 *   Bias: when two levels are arguable, the rules pick the LOWER one.
 *   A Class 6 recall question mislabelled K4 is worse than a K4 question
 *   mislabelled K2 — the first hides a real gap behind a flattering number.
 *
 * Usage
 *   npm run propose:fp-bloom              # writes CSV + MD next to the repo docs
 *   npm run propose:fp-bloom -- --stdout  # print the table, write nothing
 *
 * Env
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (fp_items holds answers — service role only; anon cannot read it)
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// ── Types ───────────────────────────────────────────────────────────────────

type BloomLevel = 'K1' | 'K2' | 'K3' | 'K4' | 'K5' | 'K6';
type Confidence = 'high' | 'medium' | 'low' | 'n/a';

interface FpItemRow {
  id: string;
  difficulty: number;
  q_type: string;
  stem: string;
  options: unknown;
  explanation: string | null;
  topic_id: string | null;
}

interface Proposal {
  id: string;
  difficulty: number;
  topic: string;
  exam: string;
  stem: string;
  proposed: BloomLevel | null;
  rule: string;
  confidence: Confidence;
  reason: string;
}

/** The six levels, with the verbs JABT retains unchanged from Bloom. */
export const BLOOM_LEVELS: Record<BloomLevel, { name: string; verbs: string }> = {
  K1: { name: 'Remembering', verbs: 'define · list · recall · name · identify' },
  K2: { name: 'Understanding', verbs: 'explain · describe · classify · summarize' },
  K3: { name: 'Applying', verbs: 'use · solve · demonstrate · execute · implement' },
  K4: { name: 'Analyzing', verbs: 'differentiate · compare · examine · break down' },
  K5: { name: 'Evaluating', verbs: 'justify · critique · judge · argue · assess' },
  K6: { name: 'Creating', verbs: 'design · construct · develop · formulate · produce' },
};

// ── Option helpers ──────────────────────────────────────────────────────────

/** `options` is jsonb and has been seen as both string[] and {text}[] — handle both. */
export function optionTexts(options: unknown): string[] {
  if (!Array.isArray(options)) return [];
  return options.map((o) => {
    if (typeof o === 'string') return o;
    if (o && typeof o === 'object') {
      const rec = o as Record<string, unknown>;
      for (const k of ['text', 'label', 'value', 'option']) {
        if (typeof rec[k] === 'string') return rec[k] as string;
      }
    }
    return String(o);
  });
}

/** A quantity answer: "250 cm", "200 square centimetres", "9 cm", "1:2". */
function looksNumeric(s: string): boolean {
  return /^\s*\d[\d\s.,:/]*\s*[a-zA-Z²³ ]*\s*$/.test(s) && /\d/.test(s);
}

// ── The rules ───────────────────────────────────────────────────────────────

interface Rule {
  name: string;
  level: BloomLevel | null;
  confidence: Confidence;
  reason: string;
  test: (stem: string, opts: string[]) => boolean;
}

/**
 * ORDERED. First match wins. Read top to bottom — that is the whole algorithm.
 */
export const RULES: Rule[] = [
  {
    name: 'placeholder',
    level: null,
    confidence: 'n/a',
    reason:
      'Pilot placeholder row — the stem is a topic note and the options are literal "opt A"-"opt D". There is no question here to tag.',
    test: (stem, opts) =>
      /^\s*\[PILOT\]/i.test(stem) ||
      (opts.length > 0 && opts.every((o) => /^\s*opt\s+[A-D]\s*$/i.test(o))),
  },
  {
    name: 'computation',
    level: 'K3',
    confidence: 'high',
    reason:
      'A quantity has to be worked out from the values given, by applying a stated rule or formula. Recalling the rule is not enough — it has to be executed (K3 Applying).',
    test: (stem, opts) => {
      const numericOpts = opts.filter(looksNumeric).length;
      return numericOpts >= 3 && /\d/.test(stem);
    },
  },
  {
    name: 'evidence-judgement',
    level: 'K5',
    confidence: 'medium',
    reason:
      'Asks which observation actually supports a claim. The learner has to weigh candidate evidence, not retrieve a fact (K5 Evaluating).',
    test: (stem) => /\bevidence\b|\bwhich .{0,40}\bprove(s|d)?\b/i.test(stem),
  },
  {
    name: 'contrast',
    level: 'K4',
    confidence: 'medium',
    reason:
      'Turns on separating two cases from each other — what holds in one and not the other. That is a comparison, not a single recalled fact (K4 Analyzing).',
    test: (stem) =>
      /\bonly between\b|\band never between\b|\bbut never\b|\bcompared with\b|\bonly .{0,30}\band never\b/i.test(
        stem,
      ),
  },
  {
    name: 'explain',
    level: 'K2',
    confidence: 'medium',
    reason:
      'A situation is described and the learner has to say why it happens, using an idea that has been taught. Explaining a case is K2 Understanding.',
    test: (stem) =>
      // NB the bare "… floor. Why?" ending is deliberate: found during the
      // 2026-08-05 15-item hand-check, where two items ending in a lone "Why?"
      // fell through to `recall` and were proposed K1 despite plainly asking
      // for an explanation.
      /\bwhy (does|do|is|are|did|were|would)\b|^why\b|\bwhy\?\s*$|\bhow does .{0,60}\bhelp\b|\bwhat (does this|do these) (tell|show)\b|\bwhat best explains\b|\bwhat causes\b|\bwhy is this done\b/i.test(
        stem.trim(),
      ),
  },
  {
    name: 'multi-cue-inference',
    level: 'K4',
    confidence: 'low',
    reason:
      'Two or more separate observations are set out BEFORE the question, and the answer follows only from reading them together. Breaking a described case into its cues is K4 Analyzing — but this rule fires on sentence shape, so it is the one most worth a reviewer\'s eye.',
    test: (stem, opts) => {
      const t = stem.trim();
      const identifies = /\b(which|what)\b[^?]*\?\s*$/i.test(t);
      if (!identifies || opts.length === 0) return false;
      // Count sentences of DESCRIPTION — i.e. before the final interrogative
      // clause. Splitting the whole stem counts the question itself as a
      // sentence, which turns every one-line scenario into a false K4.
      const lastSentenceStart = Math.max(t.lastIndexOf('. '), t.lastIndexOf('! ')) + 1;
      const description = lastSentenceStart > 0 ? t.slice(0, lastSentenceStart) : '';
      const descriptiveSentences = description
        .split(/[.!]\s+/)
        .filter((s) => s.trim().length > 12);
      return descriptiveSentences.length >= 2;
    },
  },
  {
    name: 'classify-scenario',
    level: 'K2',
    confidence: 'medium',
    reason:
      'A concrete situation is described and the learner has to name the concept it is an instance of. Classifying an example under a taught idea is K2 Understanding.',
    test: (stem) => {
      const words = stem.trim().split(/\s+/).length;
      const namesTheConcept =
        /\bis (this|it) called\b|\bwhat is this .{0,30}called\b|\bis said to be\b|\bsuch a .{0,20}is\b|\bis called its\b|\bthis (change|loss|step|force|pulse) (of state )?called\b|\bwhich (effect|kind|force|simple machine|state|method|agent|change)\b/i.test(
          stem,
        );
      return words >= 16 && namesTheConcept;
    },
  },
  {
    name: 'recall',
    level: 'K1',
    confidence: 'medium',
    reason:
      'Retrieves a single taught fact, name, unit, part or definition. Nothing has to be worked out (K1 Remembering).',
    test: () => true, // fallback
  },
];

export function classify(stem: string, options: unknown): {
  level: BloomLevel | null;
  rule: string;
  confidence: Confidence;
  reason: string;
} {
  const opts = optionTexts(options);
  for (const r of RULES) {
    if (r.test(stem, opts)) {
      return { level: r.level, rule: r.name, confidence: r.confidence, reason: r.reason };
    }
  }
  // Unreachable — `recall` is a catch-all — but keep the type honest.
  return { level: 'K1', rule: 'recall', confidence: 'low', reason: 'fallback' };
}

// ── Reporting ───────────────────────────────────────────────────────────────

function csvCell(v: string | number | null): string {
  const s = v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function excerpt(stem: string, n = 90): string {
  const one = stem.replace(/\s+/g, ' ').trim();
  return one.length <= n ? one : `${one.slice(0, n - 1)}…`;
}

function buildCsv(rows: Proposal[]): string {
  const head = [
    'item_id',
    'exam',
    'topic',
    'difficulty',
    'proposed_bloom_level',
    'confidence',
    'rule',
    'stem_excerpt',
    'reason',
  ];
  const lines = [head.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.exam,
        r.topic,
        r.difficulty,
        r.proposed ?? '',
        r.confidence,
        r.rule,
        excerpt(r.stem, 120),
        r.reason,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

function distribution(rows: Proposal[]): Map<string, number> {
  const d = new Map<string, number>();
  for (const r of rows) {
    const k = r.proposed ?? 'untagged';
    d.set(k, (d.get(k) ?? 0) + 1);
  }
  return d;
}

/** Difficulty (1-4) against proposed K rank (1-6), Pearson r over tagged rows. */
export function correlate(rows: Proposal[]): { n: number; r: number | null } {
  const pairs = rows
    .filter((x) => x.proposed !== null)
    .map((x) => [x.difficulty, Number(x.proposed!.slice(1))] as const);
  const n = pairs.length;
  if (n < 3) return { n, r: null };
  const mx = pairs.reduce((a, p) => a + p[0], 0) / n;
  const my = pairs.reduce((a, p) => a + p[1], 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (const [x, y] of pairs) {
    num += (x - mx) * (y - my);
    dx += (x - mx) ** 2;
    dy += (y - my) ** 2;
  }
  if (dx === 0 || dy === 0) return { n, r: null };
  return { n, r: num / Math.sqrt(dx * dy) };
}

function buildMarkdown(rows: Proposal[]): string {
  const dist = distribution(rows);
  const tagged = rows.filter((r) => r.proposed !== null);
  const { n, r } = correlate(rows);

  const out: string[] = [];
  out.push('# Foundation item bank — proposed Bloom levels (K1–K6)');
  out.push('');
  out.push(
    '> **PROPOSALS AWAITING ACADEMIC REVIEW.** Generated by `scripts/propose-fp-item-bloom-levels.ts`. ' +
      'Nothing in this file has been written to `fp_items`. An academic reviewer accepts, amends or ' +
      'rejects each row before any value is stored.',
  );
  out.push('');
  out.push(
    `Generated: ${new Date().toISOString().slice(0, 10)} · ${rows.length} rows read · ` +
      `${tagged.length} taggable · ${rows.length - tagged.length} untaggable`,
  );
  out.push('');
  out.push('## Distribution');
  out.push('');
  out.push('| Level | Name | Count | Share of taggable |');
  out.push('|---|---|---:|---:|');
  for (const k of ['K1', 'K2', 'K3', 'K4', 'K5', 'K6'] as BloomLevel[]) {
    const c = dist.get(k) ?? 0;
    const pct = tagged.length ? ((c / tagged.length) * 100).toFixed(1) : '0.0';
    out.push(`| ${k} | ${BLOOM_LEVELS[k].name} | ${c} | ${pct}% |`);
  }
  out.push(`| — | *untaggable (placeholder rows)* | ${dist.get('untagged') ?? 0} | — |`);
  out.push('');
  out.push('## Difficulty vs proposed level');
  out.push('');
  out.push(
    r === null
      ? `Not computable (n=${n}).`
      : `Pearson r = **${r.toFixed(3)}** over ${n} taggable rows (difficulty 1–4 against K-rank 1–6).`,
  );
  out.push('');
  out.push('| difficulty | n | mean proposed K-rank | K1 | K2 | K3 | K4 | K5 | K6 |');
  out.push('|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const d of [1, 2, 3, 4, 5]) {
    const sub = tagged.filter((x) => x.difficulty === d);
    if (!sub.length) continue;
    const mean = sub.reduce((a, x) => a + Number(x.proposed!.slice(1)), 0) / sub.length;
    const cells = (['K1', 'K2', 'K3', 'K4', 'K5', 'K6'] as BloomLevel[]).map(
      (k) => sub.filter((x) => x.proposed === k).length,
    );
    out.push(`| ${d} | ${sub.length} | ${mean.toFixed(2)} | ${cells.join(' | ')} |`);
  }
  out.push('');
  out.push('## Confidence');
  out.push('');
  out.push('| confidence | n |');
  out.push('|---|---:|');
  for (const c of ['high', 'medium', 'low', 'n/a'] as Confidence[]) {
    const cnt = rows.filter((x) => x.confidence === c).length;
    if (cnt) out.push(`| ${c} | ${cnt} |`);
  }
  out.push('');
  out.push('## Every item');
  out.push('');
  out.push('| # | id | diff | proposed | conf | rule | stem | why |');
  out.push('|---:|---|---:|---|---|---|---|---|');
  rows.forEach((x, i) => {
    out.push(
      `| ${i + 1} | \`${x.id.slice(0, 8)}\` | ${x.difficulty} | **${x.proposed ?? '—'}** | ${x.confidence} | ${x.rule} | ${excerpt(
        x.stem,
        95,
      ).replace(/\|/g, '\\|')} | ${x.reason.replace(/\|/g, '\\|')} |`,
    );
  });
  out.push('');
  return `${out.join('\n')}\n`;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const toStdout = args.includes('--stdout');
  const outArgIdx = args.indexOf('--out');
  const outDir = resolve(
    outArgIdx >= 0 && args[outArgIdx + 1] ? args[outArgIdx + 1] : 'docs/modules/foundation',
  );

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required ' +
        '(fp_items holds answer keys and is not readable with the anon key).',
    );
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Paged read — PostgREST silently caps an unpaged .select() at 1,000 rows.
  const items: FpItemRow[] = [];
  const PAGE = 500;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('fp_items')
      .select('id, difficulty, q_type, stem, options, explanation, topic_id, exam_definition_id')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`fp_items read failed: ${error.message}`);
    items.push(...((data ?? []) as unknown as FpItemRow[]));
    if (!data || data.length < PAGE) break;
  }

  // Label lookups (topic + exam) purely so the artifact reads well for a reviewer.
  const topics = new Map<string, string>();
  const exams = new Map<string, string>();
  const { data: topicRows } = await supabase
    .from('cdc_exam_syllabus_topics')
    .select('id, display_name');
  for (const t of topicRows ?? []) topics.set(t.id as string, (t.display_name as string) ?? '');
  const { data: examRows } = await supabase.from('exam_definitions').select('id, display_name');
  for (const e of examRows ?? []) exams.set(e.id as string, (e.display_name as string) ?? '');

  const rows: Proposal[] = items.map((it) => {
    const c = classify(it.stem, it.options);
    return {
      id: it.id,
      difficulty: it.difficulty,
      topic: topics.get(it.topic_id ?? '') ?? '—',
      exam: exams.get((it as unknown as { exam_definition_id: string }).exam_definition_id) ?? '—',
      stem: it.stem,
      proposed: c.level,
      rule: c.rule,
      confidence: c.confidence,
      reason: c.reason,
    };
  });

  rows.sort(
    (a, b) =>
      a.exam.localeCompare(b.exam) ||
      a.topic.localeCompare(b.topic) ||
      (a.proposed ?? 'ZZ').localeCompare(b.proposed ?? 'ZZ'),
  );

  const md = buildMarkdown(rows);
  const csv = buildCsv(rows);

  if (toStdout) {
    console.log(md);
    return;
  }

  const mdPath = resolve(outDir, '2026-08-05-MODULE-foundation-item-bloom-proposals.generated.md');
  const csvPath = resolve(outDir, '2026-08-05-MODULE-foundation-item-bloom-proposals.generated.csv');
  mkdirSync(dirname(mdPath), { recursive: true });
  writeFileSync(mdPath, md, 'utf8');
  writeFileSync(csvPath, csv, 'utf8');

  const dist = distribution(rows);
  console.log(`Read ${rows.length} items from fp_items. NOTHING WAS WRITTEN.`);
  console.log(
    `Distribution: ${(['K1', 'K2', 'K3', 'K4', 'K5', 'K6'] as BloomLevel[])
      .map((k) => `${k}=${dist.get(k) ?? 0}`)
      .join('  ')}  untaggable=${dist.get('untagged') ?? 0}`,
  );
  const { r, n } = correlate(rows);
  console.log(`Difficulty vs proposed K-rank: r=${r === null ? 'n/a' : r.toFixed(3)} (n=${n})`);
  console.log(`Wrote ${mdPath}`);
  console.log(`Wrote ${csvPath}`);
}

// Only run when executed directly, so the rules stay unit-testable.
if (process.argv[1] && process.argv[1].endsWith('propose-fp-item-bloom-levels.ts')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
