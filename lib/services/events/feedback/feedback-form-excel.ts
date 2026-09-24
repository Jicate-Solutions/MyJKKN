// lib/services/events/feedback/feedback-form-excel.ts
//
// Excel round-trip for the event feedback questionnaire: a coordinator downloads
// a template, fills one row per question, and imports it into the form editor.
//
// The import lands in the EDITOR STATE, not the database. Rows become sections
// and questions the coordinator can still reorder or fix before pressing Save,
// so a typo in the sheet never reaches event_feedback_questions unreviewed.
//
// Sheet layout (first sheet, header row, one question per row):
//   Section | Question | Type | Required | Options | Help text | Rating scale
// Rows with the same Section text (case-insensitive, in order of first
// appearance) are grouped into one section. Type accepts the machine value
// ('rating', 'radio', …) OR the label shown in the editor ('Single choice').

import * as XLSX from 'xlsx';
import {
  CHOICE_QUESTION_TYPES,
  DEFAULT_RATING_SCALE,
  FEEDBACK_QUESTION_TYPES,
  RATING_SCALES,
  isAnswerableQuestion,
} from '@/types/event-feedback';
import type { FeedbackQuestionType, FormFieldOption } from '@/types/event-feedback';

export const FEEDBACK_TEMPLATE_COLUMNS = [
  'Section',
  'Question',
  'Type',
  'Required',
  'Options',
  'Help text',
  'Rating scale',
] as const;

export interface ImportedFeedbackQuestion {
  question_label: string;
  question_type: FeedbackQuestionType;
  is_required: boolean;
  options: FormFieldOption[] | null;
  help_text: string | null;
  rating_scale: number | null;
}

export interface ImportedFeedbackSection {
  title: string;
  questions: ImportedFeedbackQuestion[];
}

export interface FeedbackImportResult {
  sections: ImportedFeedbackSection[];
  /** Row-level problems, each naming the sheet row (1-based, header = row 1). */
  errors: string[];
  /** Rows that were skipped because they were blank. */
  skipped: number;
}

const SAMPLE_ROWS: Record<(typeof FEEDBACK_TEMPLATE_COLUMNS)[number], string | number>[] = [
  {
    Section: 'Overall',
    Question: 'How would you rate the event overall?',
    Type: 'rating',
    Required: 'Yes',
    Options: '',
    'Help text': '1 = poor, 5 = excellent',
    'Rating scale': 5,
  },
  {
    Section: 'Overall',
    Question: 'Which session was most useful?',
    Type: 'radio',
    Required: 'No',
    Options: 'Keynote | Workshop | Panel discussion',
    'Help text': '',
    'Rating scale': '',
  },
  {
    Section: 'Suggestions',
    Question: 'What should we improve next time?',
    Type: 'textarea',
    Required: 'No',
    Options: '',
    'Help text': '',
    'Rating scale': '',
  },
];

/** Build the workbook (exported separately so tests can inspect it without a download). */
export function buildFeedbackTemplateWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const ws = XLSX.utils.json_to_sheet(SAMPLE_ROWS, {
    header: FEEDBACK_TEMPLATE_COLUMNS as unknown as string[],
  });
  ws['!cols'] = [
    { wch: 18 },
    { wch: 48 },
    { wch: 14 },
    { wch: 10 },
    { wch: 40 },
    { wch: 30 },
    { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Questions');

  const guide = [
    ['Column', 'What to enter'],
    ['Section', 'Heading the question sits under. Same text = same section. Optional; blank rows join the section above.'],
    ['Question', 'The question shown to attendees. Required.'],
    [
      'Type',
      'One of: ' +
        FEEDBACK_QUESTION_TYPES.map((t) => `${t.value} (${t.label})`).join(', ') +
        '. You may type either the code or the label.',
    ],
    ['Required', 'Yes / No (also accepts true/false, 1/0). Ignored for section_note.'],
    ['Options', 'For radio, select and multi_select: choices separated by | (pipe). Example: Yes | No | Maybe'],
    ['Help text', 'Optional hint shown under the question.'],
    ['Rating scale', `For rating only: one of ${RATING_SCALES.join(', ')}. Blank = ${DEFAULT_RATING_SCALE}.`],
    [],
    ['Tip', 'Delete the sample rows on the Questions sheet before importing, or keep the ones you like.'],
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet(guide);
  wsGuide['!cols'] = [{ wch: 14 }, { wch: 110 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, 'How to fill');

  return wb;
}

/** Trigger the browser download of the template. */
export function downloadFeedbackTemplate(eventName?: string | null): void {
  const wb = buildFeedbackTemplateWorkbook();
  const stem = (eventName ?? 'event')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  XLSX.writeFile(wb, `feedback-questions-template-${stem || 'event'}.xlsx`);
}

// ── Parsing ─────────────────────────────────────────────────────────────────

const TYPE_BY_TOKEN: Map<string, FeedbackQuestionType> = (() => {
  const m = new Map<string, FeedbackQuestionType>();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  for (const t of FEEDBACK_QUESTION_TYPES) {
    m.set(norm(t.value), t.value);
    m.set(norm(t.label), t.value);
    // Label without its parenthetical: "Rating", "Dropdown", "Note".
    m.set(norm(t.label.replace(/\(.*\)/, '')), t.value);
  }
  // Friendly aliases people actually type.
  m.set('star', 'rating');
  m.set('stars', 'rating');
  m.set('scale', 'rating');
  m.set('shorttext', 'text');
  m.set('longtext', 'textarea');
  m.set('paragraph', 'textarea');
  m.set('singlechoice', 'radio');
  m.set('multiplechoice', 'multi_select');
  m.set('multichoice', 'multi_select');
  m.set('multiselect', 'multi_select');
  m.set('dropdown', 'select');
  m.set('yesno', 'checkbox');
  m.set('boolean', 'checkbox');
  m.set('note', 'section_note');
  return m;
})();

function parseType(raw: unknown): FeedbackQuestionType | null {
  const token = String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  if (!token) return null;
  return TYPE_BY_TOKEN.get(token) ?? null;
}

function parseBool(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  return s === 'yes' || s === 'y' || s === 'true' || s === '1' || s === 'required';
}

function parseOptions(raw: unknown): FormFieldOption[] {
  const text = String(raw ?? '').trim();
  if (!text) return [];
  // Accept | ; or newline as separators; commas are too common inside a choice.
  const parts = text
    .split(/\s*[|;\n]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: FormFieldOption[] = [];
  for (const label of parts) {
    let value = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!value) value = `option_${out.length + 1}`;
    let unique = value;
    let n = 2;
    while (seen.has(unique)) unique = `${value}_${n++}`;
    seen.add(unique);
    out.push({ label, value: unique });
  }
  return out;
}

/** Find a header cell regardless of case, spaces or punctuation. */
function pick(row: Record<string, unknown>, wanted: string): unknown {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const target = norm(wanted);
  for (const key of Object.keys(row)) {
    if (norm(key) === target) return row[key];
  }
  return undefined;
}

/**
 * Pure row parser — the sheet already read into objects keyed by header. Exported
 * so the rules are testable without a File.
 */
export function parseFeedbackRows(rows: Record<string, unknown>[]): FeedbackImportResult {
  const sections: ImportedFeedbackSection[] = [];
  const byTitle = new Map<string, ImportedFeedbackSection>();
  const errors: string[] = [];
  let skipped = 0;
  let current: ImportedFeedbackSection | null = null;

  rows.forEach((row, i) => {
    const rowNo = i + 2; // header is row 1
    const sectionRaw = String(pick(row, 'Section') ?? '').trim();
    const label = String(pick(row, 'Question') ?? '').trim();
    const typeRaw = pick(row, 'Type');
    const requiredRaw = pick(row, 'Required');
    const optionsRaw = pick(row, 'Options');
    const helpRaw = String(pick(row, 'Help text') ?? '').trim();
    const scaleRaw = pick(row, 'Rating scale');

    const blank =
      !sectionRaw && !label && !String(typeRaw ?? '').trim() && !String(optionsRaw ?? '').trim();
    if (blank) {
      skipped += 1;
      return;
    }

    // Resolve the section: named rows open/reuse one; unnamed rows join the last.
    if (sectionRaw) {
      const key = sectionRaw.toLowerCase();
      let sec = byTitle.get(key);
      if (!sec) {
        sec = { title: sectionRaw, questions: [] };
        byTitle.set(key, sec);
        sections.push(sec);
      }
      current = sec;
    } else if (!current) {
      current = { title: 'Questions', questions: [] };
      byTitle.set('questions', current);
      sections.push(current);
    }

    if (!label) {
      errors.push(`Row ${rowNo}: Question is empty.`);
      return;
    }

    const type = parseType(typeRaw);
    if (!type) {
      errors.push(
        `Row ${rowNo}: unknown Type "${String(typeRaw ?? '').trim()}" — use one of ${FEEDBACK_QUESTION_TYPES.map((t) => t.value).join(', ')}.`,
      );
      return;
    }

    const options = CHOICE_QUESTION_TYPES.has(type) ? parseOptions(optionsRaw) : [];
    if (CHOICE_QUESTION_TYPES.has(type) && options.length < 2) {
      errors.push(`Row ${rowNo}: "${label}" needs at least two Options separated by |.`);
      return;
    }

    let rating_scale: number | null = null;
    if (type === 'rating') {
      const n = Number(String(scaleRaw ?? '').trim());
      if (!String(scaleRaw ?? '').trim()) rating_scale = DEFAULT_RATING_SCALE;
      else if ((RATING_SCALES as readonly number[]).includes(n)) rating_scale = n;
      else {
        errors.push(
          `Row ${rowNo}: Rating scale must be one of ${RATING_SCALES.join(', ')} (got "${String(scaleRaw).trim()}").`,
        );
        return;
      }
    }

    current!.questions.push({
      question_label: label,
      question_type: type,
      is_required: isAnswerableQuestion(type) ? parseBool(requiredRaw) : false,
      options: options.length ? options : null,
      help_text: helpRaw || null,
      rating_scale,
    });
  });

  // Drop sections that ended up with nothing usable in them.
  const kept = sections.filter((s) => s.questions.length > 0);
  return { sections: kept, errors, skipped };
}

/** Read an uploaded .xlsx / .csv and parse its first sheet. */
export async function parseFeedbackExcel(file: File): Promise<FeedbackImportResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { sections: [], errors: ['The file has no sheets.'], skipped: 0 };
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (!rows.length) {
    return { sections: [], errors: ['The first sheet has no rows under the header.'], skipped: 0 };
  }
  return parseFeedbackRows(rows);
}
