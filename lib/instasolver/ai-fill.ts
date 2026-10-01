// lib/instasolver/ai-fill.ts
// ============================================================================
// InstaSolver "Fill it for me" — the shared pieces behind
// app/api/instasolver/ai-fill/route.ts and the broken-thing form.
//
// Director rulings, 30 Sep 2026: a person describes the problem in ANY words
// (Tamil included); the AI picks the trade, the place and how urgent it is,
// and when it is unsure it asks ONE question with tap-to-pick answers. If the
// person skips that question the report still goes, flagged for the estate
// office (EAO) to sort.
//
// Lives here, not in the route, because a Next.js route file may only export
// its handlers — the trade list and the validator are needed by the client,
// the ai-fill route, the broken route and the tests.
//
// NOTHING IN THIS FILE TOUCHES THE DATABASE, and it is imported by the client,
// so it must stay free of server-only imports. The per-user cap is in memory.
// ============================================================================

/**
 * The 11 clean trades, built 2026-09-30 from the old InstaSolver site's
 * categories (clean_groups only — no personal data travelled with it).
 * 'Other' is last on purpose: it is what a skipped question falls back to.
 * One label differs from that file: its "Lab & clinical equipment" is written
 * "Learning-lab & clinical equipment" here, per the JKKN terminology standard
 * (the blocking CI gate flags "lab" as a word, even inside "learning lab").
 */
export const INSTASOLVER_TRADES = [
  'Electrical',
  'Plumbing & water',
  'Computers & printers',
  'Internet & Wi-Fi',
  'Civil & building',
  'Furniture, doors & carpentry',
  'AC, TV, audio & xerox',
  'Learning-lab & clinical equipment',
  'Cleaning, pests & waste',
  'Security & CCTV',
  'Other'
] as const;

export type InstaSolverTrade = (typeof INSTASOLVER_TRADES)[number];

export const FALLBACK_TRADE: InstaSolverTrade = 'Other';

export function isInstaSolverTrade(v: unknown): v is InstaSolverTrade {
  return typeof v === 'string' && (INSTASOLVER_TRADES as readonly string[]).includes(v);
}

export type AiFillUrgency = 'normal' | 'dangerous';
export type AiFillQuestionField = 'trade' | 'place' | 'urgency';

/** The same limits the broken-thing form and route enforce. */
export const AI_FILL_LIMITS = {
  inputMin: 3,
  inputMax: 1000,
  placeMax: 120,
  descriptionMax: 500,
  titleMax: 120,
  questionMax: 120,
  optionMax: 60,
  optionsMin: 2,
  optionsMax: 5
} as const;

/** What the person sees in place of a filled form when anything goes wrong. */
export const AI_FILL_FALLBACK_MESSAGE = "Couldn't fill it — please pick below.";

/** Put in "Where is it?" when the person skipped and no place was found. */
export const SKIPPED_PLACE_TEXT = 'Place not given (estate office to sort)';

/**
 * The AI may turn "dangerous" ON, never OFF. A box the person ticked by hand
 * stays ticked whatever the model says (repair round, 1 Oct 2026): a hazard
 * must never drop from same-day-plus-a-page into the 2-day lane because a
 * model read it as routine. Only the person can untick it.
 */
export function mergeDangerous(current: boolean, aiUrgency: unknown): boolean {
  return current || aiUrgency === 'dangerous';
}

/**
 * A fill replaces a text field only when the field is empty or still holds
 * exactly what the previous fill (or a skip placeholder) put there — never
 * words the person typed by hand. A second "Fill it for me" still updates
 * what the first one wrote.
 */
export function mergeFilledField(
  current: string,
  lastFilled: string | null,
  next: string
): string {
  if (!current.trim()) return next;
  if (lastFilled !== null && current === lastFilled) return next;
  return current;
}

export interface AiFillQuestion {
  field: AiFillQuestionField;
  text: string;
  options: string[];
}

export interface AiFillResult {
  trade: InstaSolverTrade;
  /** Empty string when the AI could not tell. */
  place: string;
  urgency: AiFillUrgency;
  title: string;
  description: string;
  /** 0..1 */
  confidence: number;
  one_question: AiFillQuestion | null;
}

function clampText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  const t = v.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max).trimEnd() : t;
}

/**
 * Validate a question's shape and its options. Options for a trade question
 * must be real trades; options for an urgency question must be the two
 * urgency values; options for a place question must come from the known
 * places when there are any (so a chip never names a block that does not
 * exist), and are free text only when the college has no places recorded.
 * Returns null when the question is not usable — the form then simply fills
 * without asking.
 */
function parseQuestion(raw: unknown, knownPlaces: readonly string[]): AiFillQuestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const q = raw as Record<string, unknown>;
  const field = q.field;
  if (field !== 'trade' && field !== 'place' && field !== 'urgency') return null;
  const text = clampText(q.text, AI_FILL_LIMITS.questionMax);
  if (text.length < 3) return null;
  if (!Array.isArray(q.options)) return null;

  const seen = new Set<string>();
  let options: string[] = [];
  for (const o of q.options) {
    const opt = clampText(o, AI_FILL_LIMITS.optionMax);
    if (!opt || seen.has(opt.toLowerCase())) continue;
    seen.add(opt.toLowerCase());
    options.push(opt);
  }

  if (field === 'trade') {
    options = options.filter((o) => isInstaSolverTrade(o));
  } else if (field === 'urgency') {
    options = options.filter((o) => o === 'normal' || o === 'dangerous');
  } else if (knownPlaces.length > 0) {
    const byLower = new Map(knownPlaces.map((p) => [p.toLowerCase(), p]));
    options = options
      .map((o) => byLower.get(o.toLowerCase()))
      .filter((o): o is string => typeof o === 'string');
  }

  options = options.slice(0, AI_FILL_LIMITS.optionsMax);
  if (options.length < AI_FILL_LIMITS.optionsMin) return null;
  return { field, text, options };
}

/**
 * Strict parse of the model's reply. Accepts the JSON object alone or inside
 * a ```json fence; anything else, or any required field of the wrong type,
 * returns null and the caller answers with the plain-form fallback.
 */
export function parseAiFill(
  text: string,
  knownPlaces: readonly string[] = []
): AiFillResult | null {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) return null;

  let obj: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(match[0]);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    obj = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  if (!isInstaSolverTrade(obj.trade)) return null;
  if (obj.urgency !== 'normal' && obj.urgency !== 'dangerous') return null;
  const confidence = typeof obj.confidence === 'number' ? obj.confidence : Number.NaN;
  if (!Number.isFinite(confidence)) return null;

  const description = clampText(obj.description, AI_FILL_LIMITS.descriptionMax);
  if (description.length < 3) return null;

  return {
    trade: obj.trade,
    place: clampText(obj.place, AI_FILL_LIMITS.placeMax),
    urgency: obj.urgency,
    title: clampText(obj.title, AI_FILL_LIMITS.titleMax),
    description,
    confidence: Math.min(1, Math.max(0, confidence)),
    one_question: parseQuestion(obj.one_question, knownPlaces)
  };
}

/** One place label from a resources row: "Building Main · Block A". */
export function placeLabel(row: {
  name?: string | null;
  building_number?: string | null;
  block_number?: string | null;
  floor_number?: string | null;
  room_number?: string | null;
}): string {
  const part = (label: string, v: string | null | undefined) => {
    const t = (v ?? '').trim();
    if (!t) return null;
    // "Block A" and "Main Building" already say what they are; "A" does not.
    return new RegExp(`\\b${label}\\b`, 'i').test(t) ? t : `${label} ${t}`;
  };
  return [part('Building', row.building_number), part('Block', row.block_number)]
    .filter((p): p is string => Boolean(p))
    .join(' · ');
}

/**
 * Distinct building/block labels for the prompt and for place chips. Room and
 * floor are dropped on purpose: a campus has thousands of rooms, and the
 * question the Director named is "Which block is this in?".
 */
export function distinctPlaces(
  rows: ReadonlyArray<Parameters<typeof placeLabel>[0]>,
  cap = 60
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const label = placeLabel(r);
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push(label);
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * The `places` payload value for the `instasolver.ai_fill` job. The prompt
 * itself lives in the ai_job_types row (migration
 * 20261230090300_instasolver_ai_fill_job_type.sql); this is the one part of it
 * that changes per college.
 */
export function buildAiFillPlacesBlock(knownPlaces: readonly string[]): string {
  return knownPlaces.length > 0
    ? `Known places at this person's college (use one of these exactly when the text points to it):\n${knownPlaces
        .map((p) => `- ${p}`)
        .join('\n')}`
    : 'No list of places is available for this college; take the place from the text.';
}

// ── The Max-lane job (Director ruling, 1 Oct 2026) ─────────────────────────
// "Fill it for me" runs as an ai_jobs job on the Windows box's Claude Max
// lane, model Opus, at no API cost — never through a paid API key.

/** The ai_job_types row the route enqueues. */
export const AI_FILL_JOB_TYPE = 'instasolver.ai_fill';

/** The same words from the same person within this window reuse one job. */
export const AI_FILL_DEDUPE_WINDOW_MS = 10 * 60 * 1000;

/** How the client waits for the Max lane: quick at first, then slower, then gives up. */
export const AI_FILL_POLL = {
  firstMs: 3_000,
  laterMs: 8_000,
  switchAfterMs: 60_000,
  giveUpAfterMs: 10 * 60 * 1000
} as const;

/** What counts as "the same text" for the dedupe: trimmed, spaces collapsed. */
export function normalizeAiFillText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * For a pick-one field (the trade): the same rule as mergeFilledField. A fill
 * sets it when nothing is picked or when it still holds what the previous fill
 * picked — never over a choice the person made by hand.
 */
export function mergeFilledChoice<T extends string>(
  current: T | null,
  lastFilled: T | null,
  next: T
): T | null {
  if (current === null) return next;
  if (lastFilled !== null && current === lastFilled) return next;
  return current;
}

// ── Per-user cap (in memory) ───────────────────────────────────────────────
// A queue-load control, not a security boundary: it lives in one server
// instance's memory, so on serverless it limits a burst, not a day. A request
// that reuses an existing job (the 10-minute dedupe) does not take a slot. Chosen because the
// only durable counter (instasolver_report_ledger) counts FILED reports — a
// fill that wrote there would eat the reporter's 10-a-day report slots.
export const AI_FILL_LIMIT_PER_WINDOW = 15;
export const AI_FILL_WINDOW_MS = 60 * 60 * 1000;

const fillLog = new Map<string, number[]>();

/**
 * Record one fill attempt for `userId` and say whether it is allowed. A
 * refused attempt is not recorded, so waiting frees a slot on schedule.
 */
export function takeAiFillSlot(userId: string, nowMs: number = Date.now()): boolean {
  const since = nowMs - AI_FILL_WINDOW_MS;
  const recent = (fillLog.get(userId) ?? []).filter((t) => t > since);
  if (recent.length >= AI_FILL_LIMIT_PER_WINDOW) {
    fillLog.set(userId, recent);
    return false;
  }
  recent.push(nowMs);
  fillLog.set(userId, recent);
  return true;
}

/** Tests only. */
export function resetAiFillSlots(): void {
  fillLog.clear();
}
