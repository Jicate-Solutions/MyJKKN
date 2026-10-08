/**
 * HR intake helper — cleaning the cells of a CVViZ export. Pure, no I/O.
 *
 * Real exports carry spreadsheet debris: a leading apostrophe that kept a phone
 * number as text, "+91" typed twice, a date sitting in the phone column, trailing
 * spaces and trailing commas, "NA" for "not given", city lists that start with a
 * comma. Every function here takes the raw cell and returns either a clean value
 * or null — never a guess dressed up as data.
 */

/** Trim, drop leading spreadsheet apostrophes and collapse inner whitespace. */
export function cleanCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/ /g, ' ')
    .replace(/^[\s']+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const EMPTY_MARKERS = new Set(['', 'na', 'n/a', 'n.a', 'n.a.', 'nil', 'none', 'null', '-', '--', 'not available']);

/** A cleaned cell, or null when it is empty or says "not given". Trailing commas go. */
export function cleanText(value: unknown): string | null {
  const s = cleanCell(value).replace(/[,\s]+$/, '').trim();
  return EMPTY_MARKERS.has(s.toLowerCase()) ? null : s;
}

/** Names: trimmed, inner spaces collapsed, case kept as the person typed it. */
export function normaliseName(first: unknown, last: unknown): { first_name: string; last_name: string } {
  return { first_name: cleanText(first) ?? '', last_name: cleanText(last) ?? '' };
}

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i;

/** Lower-cased email, or null when the cell is not one email address. */
export function normaliseEmail(value: unknown): string | null {
  const s = cleanCell(value).replace(/^mailto:/i, '').toLowerCase();
  return EMAIL_RE.test(s) ? s : null;
}

const DATE_LIKE_RE = /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/;

export interface PhoneResult {
  /** Ten-digit Indian mobile number, or null. */
  phone: string | null;
  /** Plain-English problem with the cell, or null when it is fine (or empty). */
  phone_issue: string | null;
}

/**
 * Indian mobile numbers only: ten digits starting 6, 7, 8 or 9, after stripping
 * apostrophes, spaces, dashes, a "+91" (even when typed twice), "0091" or a
 * leading 0. Anything else is not stored as a phone; the reason is.
 */
export function normalisePhone(value: unknown): PhoneResult {
  const raw = cleanCell(value);
  if (!raw) return { phone: null, phone_issue: 'No phone number in the export' };
  if (DATE_LIKE_RE.test(raw)) {
    return { phone: null, phone_issue: `Looks like a date (${raw}), not a phone number` };
  }
  if (/[a-z]/i.test(raw)) return { phone: null, phone_issue: `Has letters in it (${raw})` };

  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  while (digits.length > 10 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);

  if (digits.length < 10) {
    return { phone: null, phone_issue: `Too short for a mobile number (${digits.length} digits)` };
  }
  if (digits.length > 10) {
    return { phone: null, phone_issue: `Too long for a mobile number (${digits.length} digits)` };
  }
  if (!/^[6-9]/.test(digits)) {
    return { phone: null, phone_issue: 'An Indian mobile number starts with 6, 7, 8 or 9' };
  }
  return { phone: digits, phone_issue: null };
}

/** Every stored form a ten-digit mobile might take elsewhere in MyJKKN. */
export function phoneVariants(phone: string): string[] {
  return [phone, `+91${phone}`, `+91 ${phone}`, `91${phone}`, `0${phone}`, `+91-${phone}`];
}

/**
 * Normalised CVViZ job title for rule matching: lower case, "&" as "and",
 * punctuation as spaces, collapsed. "Vice Principal, " -> "vice principal";
 * "Head - Accounts/Finance" -> "head accounts finance".
 */
export function normaliseJobTitle(value: unknown): string {
  return cleanCell(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const GENERAL_POOL_TITLES = new Set([
  'candidates database', 'candidate database', 'general', 'general application',
  'general pool', 'talent pool', 'open application',
]);

/** True when the CVViZ "job" is the general candidate pool, or missing. */
export function isGeneralPool(title: string | null | undefined): boolean {
  const norm = normaliseJobTitle(title ?? '');
  return norm === '' || GENERAL_POOL_TITLES.has(norm);
}

/** Cities: split on commas, empties and repeats dropped, original casing kept. */
export function normaliseCities(value: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of cleanCell(value).split(',')) {
    const city = part.trim();
    if (city.length < 2) continue;
    const key = city.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(city);
  }
  return out;
}

/** An http(s) link, or null. */
export function normaliseUrl(value: unknown): string | null {
  const s = cleanCell(value);
  return /^https?:\/\/\S+$/i.test(s) ? s : null;
}

/** True when a cell holds a date or timestamp rather than a code. */
export function looksLikeDate(value: unknown): boolean {
  const s = cleanCell(value);
  if (!s) return false;
  if (DATE_LIKE_RE.test(s)) return true;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return true;
  return /^(mon|tue|wed|thu|fri|sat|sun)[a-z]* [a-z]{3} \d{1,2} \d{4}/i.test(s);
}

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

/**
 * ISO timestamp for the export's dates, or null. Handles the JavaScript
 * toString() form CVViZ writes ("Wed Sep 30 2026 09:14:05 GMT+0000 (Coordinated
 * Universal Time)"), ISO dates, dd/mm/yyyy and Excel serial day numbers.
 */
export function parseExportDate(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 20000 || value > 80000) return null;
    return new Date(EXCEL_EPOCH_MS + value * 86400000).toISOString();
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();

  const s = cleanCell(value).replace(/\s*\([^)]*\)\s*$/, '');
  if (!s) return null;

  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const t = Date.UTC(Number(y), Number(m) - 1, Number(d));
    const back = new Date(t);
    if (back.getUTCDate() !== Number(d) || back.getUTCMonth() !== Number(m) - 1) return null;
    return back.toISOString();
  }

  const js = s.match(/^[a-z]{3} ([a-z]{3}) (\d{1,2}) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT([+-])(\d{2})(\d{2})$/i);
  if (js) {
    const [, mon, d, y, hh, mm, ss, sign, oh, om] = js;
    const month = MONTHS.indexOf(mon.toLowerCase());
    if (month < 0) return null;
    const offsetMin = (Number(oh) * 60 + Number(om)) * (sign === '+' ? 1 : -1);
    const t = Date.UTC(Number(y), month, Number(d), Number(hh), Number(mm), Number(ss)) - offsetMin * 60000;
    return new Date(t).toISOString();
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const t = Date.parse(s);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  return null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Words that carry no meaning when comparing job titles. */
export const TITLE_STOPWORDS = new Set(['of', 'the', 'and', 'in', 'for', 'at', 'a', 'an', 'to', 'cum', 'with']);

/** Meaningful lower-case words of a title or subject. */
export function titleTokens(value: unknown): string[] {
  return normaliseJobTitle(value)
    .split(' ')
    .filter((t) => t.length > 1 && !TITLE_STOPWORDS.has(t));
}
