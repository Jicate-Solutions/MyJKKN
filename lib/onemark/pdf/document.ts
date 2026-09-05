// File: lib/onemark/pdf/document.ts
//
// OneMark — the board-format question paper and its separate answer key, as
// HTML for headless Chromium (render.ts). Layout follows the reference sheets
// in PRD Physics §5.1 / §5.3 and PRD English §5.1 / §5.3.
//
// The rules this file is built around:
//   • One logical question = Tamil block then English block, numbered ONCE on
//     the Tamil block, no rule between them (PRD Physics §5.2 — "the single
//     most important rendering rule"). English papers are monolingual.
//   • Option codes are derived at render time: a→அ, b→ஆ, c→இ, d→ஈ.
//   • A grouped directive is emitted once above the first question of its run
//     (PRD English §4.2 / §5.2) and is never numbered.
//   • The answer key is a SEPARATE document; a question-paper render never
//     receives answers or explanations (load-paper.ts strips them unless the
//     key was asked for), so there is nothing here that could leak one.
//   • The coverage summary reports the JABT level mix (decision 6) — there is
//     no Easy / Medium / Hard anywhere.

import { escapeHtml, itemTextToHtml } from './notation';
import {
  OPTION_KEYS_EN,
  OPTION_KEYS_TA,
  directiveRuns,
  printedAnswerKey,
} from './layout';
import { paperCss } from './styles';
import type { ArrangedItem, ArrangedPaper, PaperModel, PaperSubject } from './types';

interface SubjectProfile {
  partLabel: string;
  subjectTa: string | null;
  subjectEn: string;
  /** Total score of the full board paper (Part I + the rest). */
  totalScore: number;
  timeHours: string;
  /** Printed above the Part-I note, e.g. "15 x 1 = 15". */
  keySubtitle: string;
}

// Tamil strings copied verbatim from PRD Physics §5.1 — needs native review
// before a hall paper is printed from this (CLAUDE.md #24).
const PROFILES: Record<PaperSubject, SubjectProfile> = {
  physics: {
    partLabel: 'PART - III',
    subjectTa: 'இயற்பியல்',
    subjectEn: 'PHYSICS',
    totalScore: 70,
    timeHours: '3.00',
    keySubtitle: 'HIGHER SECONDARY SECOND YEAR · PART - III · PHYSICS · PART - I',
  },
  english: {
    partLabel: 'Language — Part II — English',
    subjectTa: null,
    subjectEn: 'ENGLISH',
    totalScore: 90,
    timeHours: '3.00',
    keySubtitle: 'HIGHER SECONDARY SECOND YEAR · PART II - ENGLISH · PART - I',
  },
  generic: {
    partLabel: 'PART - III',
    subjectTa: null,
    subjectEn: '',
    totalScore: 0,
    timeHours: '3.00',
    keySubtitle: 'HIGHER SECONDARY SECOND YEAR · PART - I',
  },
};

function profileFor(model: PaperModel): SubjectProfile {
  const p = PROFILES[model.subject];
  if (model.subject === 'generic') {
    return { ...p, subjectEn: model.examDisplayName.toUpperCase() };
  }
  return p;
}

function shortId(id: string): string {
  return id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

/** Series letter box is board furniture on Physics; English papers carry one
 *  only when the Senior Learner actually asked for variants (PRD English §5.2). */
export function showSeriesBox(paper: ArrangedPaper): boolean {
  if (paper.model.subject === 'english') return paper.model.seriesCount > 1 || paper.series !== 'A';
  return true;
}

function htmlShell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="ta">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${paperCss()}</style>
</head>
<body>${body}</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Question paper
// ---------------------------------------------------------------------------

function renderOptions(arr: ArrangedItem, lang: 'ta' | 'en'): string {
  const source = lang === 'ta' ? arr.item.optionsTa : arr.item.optionsEn;
  if (!source || source.length === 0) return '';
  const keys = lang === 'ta' ? OPTION_KEYS_TA : OPTION_KEYS_EN;
  const cells = arr.optionOrder
    .map((canonicalIndex, printedIndex) => {
      const opt = source[canonicalIndex];
      if (!opt) return '';
      const code = keys[printedIndex] ?? String(printedIndex + 1);
      return `<span class="opt"><span class="code">(${code})</span><span class="text">${itemTextToHtml(opt.text)}</span></span>`;
    })
    .join('');
  return `<div class="opts ${arr.layout}">${cells}</div>`;
}

function renderQuestion(arr: ArrangedItem, bilingual: boolean): string {
  const { item } = arr;
  const blocks: string[] = [];
  if (bilingual && item.stemTa) {
    blocks.push(
      `<div class="lang ta"><div class="stem">${itemTextToHtml(item.stemTa)}</div>${renderOptions(arr, 'ta')}</div>`,
    );
  }
  blocks.push(
    `<div class="lang en"><div class="stem">${itemTextToHtml(item.stemEn)}</div>${renderOptions(arr, 'en')}</div>`,
  );
  return `<div class="q"><div class="num">${arr.number}.</div><div class="body">${blocks.join('')}</div></div>`;
}

function renderQuestions(paper: ArrangedPaper): string {
  const runs = directiveRuns(paper.items);
  const runStart = new Map<number, string>();
  for (const r of runs) runStart.set(r.from, r.directive);
  const out: string[] = [];
  paper.items.forEach((arr, idx) => {
    const directive = runStart.get(idx);
    if (directive) out.push(`<div class="directive">${itemTextToHtml(directive)}</div>`);
    out.push(renderQuestion(arr, paper.model.bilingual));
  });
  return `<div class="questions">${out.join('')}</div>`;
}

function physicsMasthead(paper: ArrangedPaper, profile: SubjectProfile): string {
  const n = paper.items.length;
  const series = showSeriesBox(paper) ? `<span class="series-box">${paper.series}</span>` : '';
  return `
<div class="masthead">
  <div class="left">${series}</div>
  <div class="mid"><div class="regno"><span class="ta">பதிவு எண்</span> / Register Number <span class="cells"><span></span><span></span><span></span><span></span><span></span><span></span></span></div></div>
  <div class="right">Test ID : ${shortId(paper.model.assessmentId)}</div>
</div>
<div class="title-block">
  <div class="part">${escapeHtml(profile.partLabel)}</div>
  <div class="subject"><span class="ta">${escapeHtml(profile.subjectTa ?? '')}</span>${profile.subjectTa ? ' / ' : ''}${escapeHtml(profile.subjectEn)}</div>
  <div class="medium">( <span class="ta">தமிழ் மற்றும் ஆங்கில வழி</span> / Tamil &amp; English Version )</div>
</div>
<div class="timebar">
  <div><span class="ta">கால அளவு : ${profile.timeHours} மணி நேரம்</span> ]<br>Time Allowed : ${profile.timeHours} Hours ]</div>
  <div>[ <span class="ta">மொத்த மதிப்பெண்கள் : ${profile.totalScore}</span><br>[ Maximum Marks : ${profile.totalScore}</div>
</div>
<div class="rule"></div>
<div class="instructions ta"><span class="label">அறிவுரைகள் :</span><ol>
  <li>அனைத்து வினாக்களும் சரியாகப் பதிவாகி உள்ளதா என்பதைச் சரிபார்த்துக் கொள்ளவும்.</li>
  <li>நீலம் அல்லது கருப்பு மையினை மட்டுமே எழுதுவதற்கும் அடிக்கோடிடுவதற்கும் பயன்படுத்த வேண்டும்.</li>
</ol></div>
<div class="instructions"><span class="label">Instructions :</span><ol>
  <li>Check the question paper for fairness of printing.</li>
  <li>Use Blue or Black ink to write and underline and pencil to draw diagrams.</li>
</ol></div>
<div class="rule"></div>
<div class="part-head"><span class="ta">பகுதி - I</span> / PART - I</div>
<div class="note ta"><span class="label">குறிப்பு :</span><ol>
  <li>(i) அனைத்து வினாக்களுக்கும் விடையளிக்கவும்.</li>
  <li>(ii) கொடுக்கப்பட்டுள்ள நான்கு மாற்று விடைகளில் மிகவும் ஏற்புடைய விடையைத் தேர்ந்தெடுத்துக் குறியீட்டுடன் விடையினையும் சேர்த்து எழுதவும்.</li>
</ol><span class="score">${n} x 1 = ${n}</span></div>
<div class="note"><span class="label">Note :</span><ol>
  <li>(i) Answer all the questions.</li>
  <li>(ii) Choose the most appropriate answer from the given four alternatives and write the option code and the corresponding answer.</li>
</ol><span></span></div>
<div class="thin"></div>`;
}

function englishMasthead(paper: ArrangedPaper, profile: SubjectProfile): string {
  const n = paper.items.length;
  const series = showSeriesBox(paper) ? `<span class="series-box">${paper.series}</span>` : '';
  return `
<div class="masthead">
  <div class="left">${series}</div>
  <div class="mid"><div class="regno">Register Number <span class="cells"><span></span><span></span><span></span><span></span><span></span><span></span></span></div></div>
  <div class="right">Test ID : ${shortId(paper.model.assessmentId)}</div>
</div>
<div class="title-block">
  <div class="subject">${escapeHtml(profile.partLabel)}</div>
</div>
<div class="timebar">
  <div>Time Allowed : ${profile.timeHours} Hours ]</div>
  <div>[ Maximum Marks : ${profile.totalScore}</div>
</div>
<div class="instructions"><span class="label">Instructions :</span><ol>
  <li>Check the question paper for fairness of printing. If there is any lack of fairness, inform the Hall Supervisor immediately.</li>
  <li>Use Blue or Black ink pen to write and underline and pencil to draw diagrams.</li>
</ol></div>
<div class="rule"></div>
<div class="part-head">PART - I</div>
<div class="note"><span class="label">Note :</span><ol>
  <li>(i) Answer all the questions.</li>
  <li>(ii) Choose the most appropriate answer from the given four alternatives and write both the option code and the corresponding answer for each question.</li>
</ol><span class="score">${n}x1=${n}</span></div>
<div class="thin"></div>`;
}

export function questionPaperHtml(paper: ArrangedPaper): string {
  const profile = profileFor(paper.model);
  const masthead =
    paper.model.subject === 'english' ? englishMasthead(paper, profile) : physicsMasthead(paper, profile);
  const end = paper.model.subject === 'english' ? '<div class="end-mark">- o 0 o -</div>' : '';
  const title = `${paper.model.title} — Series ${paper.series}`;
  return htmlShell(title, `${masthead}${renderQuestions(paper)}${end}`);
}

// ---------------------------------------------------------------------------
// Answer key (separate document — PRD §5.3)
// ---------------------------------------------------------------------------

function unitShort(item: ArrangedItem['item']): string | null {
  if (!item.topicLabel) return null;
  const m = item.topicLabel.match(/^Unit\s+(\d+)/i);
  return m ? `U${m[1]}` : item.topicLabel.split(/\s+[—–-]\s+/)[0];
}

/** "U3 · Magnetism …" for a unit topic; the label's own short form otherwise
 *  ("Grammar (General)" — never the long description twice). */
function topicReference(item: ArrangedItem['item']): string | null {
  if (!item.topicLabel) return null;
  const m = item.topicLabel.match(/^Unit\s+(\d+):\s*(.*)$/i);
  if (m) return `U${m[1]} · ${escapeHtml(m[2])}`;
  return escapeHtml(item.topicLabel.split(/\s+[—–-]\s+/)[0]);
}

function tally(values: Array<string | null>): Array<[string, number]> {
  const m = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function unitSortKey(u: string): number {
  const m = u.match(/^U(\d+)$/);
  return m ? Number(m[1]) : 999;
}

function coverageSummary(paper: ArrangedPaper): string {
  const items = paper.items.map((a) => a.item);
  const units = tally(items.map((i) => unitShort(i)))
    .sort((a, b) => unitSortKey(a[0]) - unitSortKey(b[0]))
    .map(([u, n]) => `${escapeHtml(u)}×${n}`)
    .join('  ');
  const levels = tally(items.map((i) => i.bloomLevel))
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, n]) => `${escapeHtml(k)} ${n}`)
    .join(' · ');
  const unassigned = items.filter((i) => !i.bloomLevel).length;
  const tags = tally(items.flatMap((i) => (i.tags.length ? i.tags : [null])))
    .map(([t, n]) => `${escapeHtml(t.replace(/_/g, ' '))} ${n}`)
    .join(' · ');
  const blueprint =
    paper.model.subject === 'english'
      ? `<div><b>Blueprint :</b> ${directiveRuns(paper.items)
          .map((r) => `Q${paper.items[r.from].number}–${paper.items[r.to].number} ${escapeHtml(shortDirective(r.directive))}`)
          .join(' · ') || 'free shape'}</div>`
      : '';
  return `<div class="coverage">
  <div class="h">COVERAGE SUMMARY</div>
  ${blueprint}
  <div><b>Units :</b> ${units || '—'}</div>
  <div><b>JABT level mix :</b> ${levels || '—'}${unassigned ? ` · unassigned ${unassigned}` : ''}</div>
  <div><b>Category mix :</b> ${tags || '—'}</div>
</div>`;
}

function shortDirective(d: string): string {
  if (/synonym/i.test(d)) return 'Synonyms';
  if (/antonym/i.test(d)) return 'Antonyms';
  return d.length > 32 ? `${d.slice(0, 30)}…` : d;
}

export function answerKeyHtml(paper: ArrangedPaper): string {
  const profile = profileFor(paper.model);
  const bilingual = paper.model.bilingual;
  const n = paper.items.length;
  const rows = paper.items
    .map((arr) => {
      const keyEn = printedAnswerKey(arr, OPTION_KEYS_EN);
      const keyTa = printedAnswerKey(arr, OPTION_KEYS_TA);
      // No key → no answer text either: an empty-string key on some option must
      // not match an empty answer and present that option as the answer.
      const canonicalIndex = arr.item.answerKey
        ? arr.item.optionsEn.findIndex((o) => (o.key ?? '').toLowerCase() === arr.item.answerKey!.toLowerCase())
        : -1;
      const ansEn = canonicalIndex >= 0 ? arr.item.optionsEn[canonicalIndex].text : '';
      const ansTa = canonicalIndex >= 0 && arr.item.optionsTa ? arr.item.optionsTa[canonicalIndex]?.text ?? '' : '';
      const code = keyEn
        ? bilingual && keyTa
          ? `(${keyEn}) / (<span class="ta">${keyTa}</span>)`
          : `(${keyEn})`
        : '—';
      const ref = [topicReference(arr.item),
        arr.item.tags.length ? escapeHtml(arr.item.tags.map((t) => t.replace(/_/g, ' ')).join(', ')) : null,
        arr.item.bloomLevel ? escapeHtml(arr.item.bloomLevel) : null]
        .filter(Boolean)
        .join(' · ');
      const expl = [
        bilingual && arr.item.explanationTa ? `<div class="ta">${itemTextToHtml(arr.item.explanationTa)}</div>` : '',
        arr.item.explanationEn ? `<div>${itemTextToHtml(arr.item.explanationEn)}</div>` : '',
        ref ? `<span class="ref">${ref}</span>` : '',
      ].join('');
      const ans = [
        bilingual && ansTa ? `<div class="ta">${itemTextToHtml(ansTa)}</div>` : '',
        `<div>${itemTextToHtml(ansEn)}</div>`,
      ].join('');
      return `<tr><td class="n">${arr.number}</td><td class="code">${code}</td><td class="ans">${ans}</td><td>${expl}</td></tr>`;
    })
    .join('');

  const seriesCell = showSeriesBox(paper) ? `<div><b>Series :</b> ${paper.series}</div>` : '<div></div>';
  const body = `
<div class="key-title">OneMark Master — ANSWER KEY &amp; EXPLANATIONS</div>
<div class="key-sub">${escapeHtml(profile.keySubtitle)}</div>
<div class="rule double"></div>
<div class="key-meta">
  <div><b>Test ID :</b> ${shortId(paper.model.assessmentId)}</div>
  ${seriesCell}
  <div><b>Items :</b> ${n} &nbsp; <b>Score :</b> ${n}</div>
  <div><b>Senior Learner :</b> ${escapeHtml(paper.model.facilitatorName ?? '—')}</div>
  <div><b>Learning Studio :</b> ${escapeHtml(paper.model.studioName ?? '—')}</div>
  <div><b>Generated :</b> ${escapeHtml(fmtDate(paper.model.generatedAt))}</div>
</div>
<div class="rule"></div>
<table class="key">
  <thead><tr><th>Q.No.</th><th>Code</th><th>Answer Text</th><th>Rule Reference / Explanation</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="rule double"></div>
${coverageSummary(paper)}`;
  return htmlShell(`${paper.model.title} — Answer Key ${paper.series}`, body);
}

/** Footer template for Chromium's print job: series box bottom-left, page
 *  number centred, "Turn over" right. A print template is its own document
 *  and cannot see the page's @font-face registry, so render.ts prepends the
 *  embedded faces to this markup before handing it to Chromium. */
export function footerTemplate(paper: ArrangedPaper): string {
  const series = showSeriesBox(paper)
    ? `<span style="border:1px solid #000;padding:1px 6px;font-weight:700">${paper.series}</span>`
    : '';
  const turnOver =
    paper.model.subject === 'english'
      ? '[ Turn over'
      : '[ <span style="font-family:\'Noto Sans Tamil\'">திருப்புக</span> / Turn over';
  return `<div style="width:100%;font-family:'Tinos','Times New Roman',serif;font-size:9pt;padding:0 12mm;display:flex;justify-content:space-between;align-items:center;color:#000">
  <div>${series}</div>
  <div><span class="pageNumber"></span> / <span class="totalPages"></span></div>
  <div>${turnOver}</div>
</div>`;
}
