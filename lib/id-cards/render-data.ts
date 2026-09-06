// lib/id-cards/render-data.ts
// Phase 2 — data assembly for the ID-card render engine.
//
// Given a profile_id, gathers everything the compositor needs:
//   • profiles row (the universal person anchor — learner OR employee)
//   • learners_profiles join when profiles.learner_id is set (name, roll,
//     register number, photo, program/department display names)
//   • staff row via the canonical email bridge when learner_id is null
//     (staff has NO user_id column; the sync_staff_to_profiles trigger keys
//     profiles.email == staff.institution_email — see lib/services/staff)
//   • institution display name for the header band
//   • the person's active JKKN ID from jkkn_identities, which is what the QR
//     carries — falling back to the internal UUID for anyone the backfill has
//     not reached yet, so no card is ever printed with a blank QR
//   • ordered photo-candidate URLs (fallback chain) and the QR payload
//
// Every lookup is defensive: a missing joined row degrades the card, it never
// throws. Only the profiles row itself is load-bearing (absent → 404 upstream).
//
// NOTE: column identifiers like learners_profiles.student_photo_url and the
// staff table are existing DB identifiers (terminology-exempt).

import type { SupabaseClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';

// Mirrors CardField in app/(routes)/admin/id-cards/_types.ts (Agent B's local
// contract). Kept as a lib-side mirror so lib/ does not import from app/;
// the planned consolidation PR moves both into types/id-cards.ts.
export type CardField =
  | 'name_line_1'
  | 'roll_number'
  | 'course'
  | 'department'
  | 'valid_until'
  | 'qr_code'
  | 'photo'
  // Portrait-engine additions (2026-07-25, Director-locked):
  //   study_period — learner batch span like "2025-2028" (batches via batch_id)
  //   staff_id     — team-member id code (staff.staff_id)
  | 'study_period'
  | 'staff_id';

export const CARD_FIELDS: readonly CardField[] = [
  'name_line_1',
  'roll_number',
  'course',
  'department',
  'valid_until',
  'qr_code',
  'photo',
  'study_period',
  'staff_id'
] as const;

export type FieldMapping = { card_field: CardField; db_column: string };

// Fields placeable on the BACK side via back_layout_json.elements. The text
// fields of the front alphabet carry over; photo/qr_code do not (the back
// carries a Code 39 barcode instead), and five back-only data fields plus
// 'barcode' join. See parseBackLayout in render-card.tsx for the schema.
export type BackCardField =
  | 'name_line_1'
  | 'roll_number'
  | 'course'
  | 'department'
  | 'valid_until'
  | 'blood_group'
  | 'date_of_birth'
  | 'guardian'
  | 'address'
  | 'contact_phone'
  | 'barcode';

export const BACK_CARD_FIELDS: readonly BackCardField[] = [
  'name_line_1',
  'roll_number',
  'course',
  'department',
  'valid_until',
  'blood_group',
  'date_of_birth',
  'guardian',
  'address',
  'contact_phone',
  'barcode'
] as const;

export type CardPersonData = {
  kind: 'learner' | 'employee';
  fullName: string;
  rollNumber: string | null;
  registerNumber: string | null;
  designation: string | null;
  courseName: string | null;
  departmentName: string | null;
  institutionName: string | null;
  /**
   * True when this card belongs to a SCHOOL (institutions.entity_type ===
   * 'school'), not a college. Schools use different vocabulary for the same
   * columns — lib/utils/school-label-adapter.ts maps Program → Class and
   * Department → Wing — so a school card must not print "COURSE: Standard 12".
   * The VALUE is correct either way; only the printed label changes.
   * Defaults false, so an unreadable institution degrades to college wording
   * rather than throwing.
   */
  isSchool: boolean;
  /**
   * QR payload: the person's permanent JKKN ID (e.g. '348295-7') when they
   * hold an active one, otherwise the internal UUID the card carried before —
   * learners_profiles.id for learners, profiles.id for employees. Never blank.
   */
  qrValue: string;
  /** Ordered photo fallback chain (absolute URLs / data URLs, nulls removed). */
  photoCandidates: string[];
  /** db_column -> display value, for template field_mappings resolution. */
  valueBag: Record<string, string>;

  // ── Back-side fields (all fail-soft: null → the block is omitted) ──────────
  /** learners_profiles.blood_group / staff.blood_group. */
  bloodGroup: string | null;
  /** Display-formatted date of birth (formatDateLabel), or null. */
  dateOfBirthLabel: string | null;
  /** Guardian display name: father_name → mother_name (learners only). */
  guardianName: string | null;
  /** Guardian phone: father_mobile → mother_mobile (learners only). */
  guardianPhone: string | null;
  /** Joined permanent address (learners) / staff.address. */
  address: string | null;
  /** Person's own contact: student_mobile (learners) / staff.phone. */
  contactPhone: string | null;
  /**
   * Barcode payload: learners_profiles.roll_number for learners,
   * staff.staff_id for team members. null → barcode omitted.
   */
  idCode: string | null;

  // ── Portrait-engine fields (2026-07-25; all fail-soft) ─────────────────────
  /**
   * Learner study period like "2025-2028", derived from the batches row via
   * learners_profiles.batch_id (batch_name when already "YYYY-YYYY", else
   * start/end-date years). null → the YEAR line is omitted (only ~half of
   * prod learners carry a batch_id). Always null for team members.
   */
  studyPeriod: string | null;
  /** Team member's staff.staff_id for the front side. null for learners. */
  staffId: string | null;
  /**
   * The learner's course end date — learners_profiles.batch_id → batches.end_date,
   * ISO as stored. Drives the card's VALID UNTIL under the course_end policy.
   * null for team members and for the learners who carry no batch (those fall
   * back to the yearly rule). Deliberately NOT derived from studyPeriod:
   * deriveStudyPeriodLabel short-circuits on batch_name and never reads end_date.
   */
  courseEndDate: string | null;
};

export type AssembleFailure = {
  ok: false;
  status: 404 | 500;
  code: string;
  message: string;
};

export type AssembleResult = { ok: true; data: CardPersonData } | AssembleFailure;

/**
 * Type-predicate guard for the failure arm. Truthiness narrowing of the
 * `ok` discriminant is unreliable with this repo's strictNullChecks:false —
 * a predicate narrows under every compiler configuration.
 */
export function isAssembleFailure(result: AssembleResult): result is AssembleFailure {
  return result.ok === false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (unit-tested)
// ─────────────────────────────────────────────────────────────────────────────

/** First letters of up to two name words, uppercased. Fallback 'ID'. */
export function initialsFromName(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'ID';
  const letters = words
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return letters || 'ID';
}

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
] as const;

/** The historic academic-year end (31 May), used when policy is unreadable. */
const DEFAULT_YEAR_END_MMDD = '05-31';

/**
 * Parse a `MM-DD` academic-year-end string into 1-based month + day.
 * Anything malformed falls back to 31 May — a card must always carry a date.
 */
export function parseYearEndMmdd(value: string | null | undefined): {
  month: number;
  day: number;
} {
  const match = /^(\d{2})-(\d{2})$/.exec((value ?? '').trim());
  const month = match ? Number(match[1]) : 5;
  const day = match ? Number(match[2]) : 31;
  if (month < 1 || month > 12 || day < 1 || day > 31) return { month: 5, day: 31 };
  return { month, day };
}

/**
 * The yearly rule: the next occurrence of the academic-year end on or after
 * today. With the default 31 May that reproduces the historic behaviour
 * exactly — academic years run June→May, so from June onward the card runs to
 * 31 May of the NEXT calendar year.
 */
export function yearlyValidUntilLabel(
  now: Date = new Date(),
  yearEndMmdd: string = DEFAULT_YEAR_END_MMDD
): string {
  const { month, day } = parseYearEndMmdd(yearEndMmdd);
  const nowMonth = now.getMonth() + 1;
  const passed = nowMonth > month || (nowMonth === month && now.getDate() > day);
  const year = passed ? now.getFullYear() + 1 : now.getFullYear();
  return `${String(day).padStart(2, '0')} ${MONTH_LABELS[month - 1]} ${year}`;
}

/**
 * The yearly rule at the built-in 31 May year end. Kept as its own export
 * because it is the terminal branch of resolveValidUntilLabel and is pinned
 * by tests written before the policy existed.
 */
export function defaultValidUntilLabel(now: Date = new Date()): string {
  return yearlyValidUntilLabel(now, DEFAULT_YEAR_END_MMDD);
}

/**
 * The Director's card-validity rules, held as config in platform_policies
 * (`id_card.validity.*`) and resolved by fn_get_id_card_policy. Never a
 * TypeScript constant — a college can be moved back to yearly learner cards
 * with a policy row change and no deploy.
 */
export type IdCardValidityPolicy = {
  /** 'course_end' = the card lasts the whole course; 'yearly' = the yearly rule. */
  learnerMode: 'course_end' | 'yearly';
  /** Team-member cards are re-issued every academic year. */
  teamMemberMode: 'yearly';
  /** Academic-year end as `MM-DD`. */
  yearEndMmdd: string;
};

export const DEFAULT_VALIDITY_POLICY: IdCardValidityPolicy = {
  learnerMode: 'course_end',
  teamMemberMode: 'yearly',
  yearEndMmdd: DEFAULT_YEAR_END_MMDD
};

/**
 * Read the `validity` block out of the fn_get_id_card_policy JSONB. Fail-soft
 * by design: an older database that predates this migration returns no
 * `validity` key at all, and the built-in defaults (which ARE the Director's
 * policy) apply. Never throws — a card must render.
 */
export function parseValidityPolicy(raw: unknown): IdCardValidityPolicy {
  if (!raw || typeof raw !== 'object') return DEFAULT_VALIDITY_POLICY;
  const block = (raw as Record<string, unknown>).validity;
  if (!block || typeof block !== 'object') return DEFAULT_VALIDITY_POLICY;
  const v = block as Record<string, unknown>;
  const learnerMode = v.learner_mode === 'yearly' ? 'yearly' : 'course_end';
  const yearEndRaw = typeof v.year_end_mmdd === 'string' ? v.year_end_mmdd : '';
  const { month, day } = parseYearEndMmdd(yearEndRaw);
  return {
    learnerMode,
    teamMemberMode: 'yearly',
    yearEndMmdd: `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  };
}

/**
 * The card's VALID UNTIL label.
 *
 *   • team member                          → the yearly rule
 *   • learner with a course end date       → that date (the whole course)
 *   • learner with no course end date      → the yearly rule
 *   • learner_mode flipped back to yearly  → the yearly rule
 *
 * Pure and unit-tested. `courseEndDate` is batches.end_date as stored (ISO);
 * anything that is not an ISO date is ignored rather than printed, so a junk
 * value degrades to the yearly rule instead of putting junk on a card.
 */
export function resolveValidUntilLabel(input: {
  kind: CardPersonData['kind'];
  courseEndDate: string | null;
  policy?: IdCardValidityPolicy | null;
  now?: Date;
}): string {
  const policy = input.policy ?? DEFAULT_VALIDITY_POLICY;
  const now = input.now ?? new Date();
  const yearly = yearlyValidUntilLabel(now, policy.yearEndMmdd);

  if (input.kind !== 'learner') return yearly;
  if (policy.learnerMode !== 'course_end') return yearly;

  const courseEnd = (input.courseEndDate ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(courseEnd)) return yearly;
  const label = formatDateLabel(courseEnd);
  return label || yearly;
}

/**
 * Format a stored date-of-birth for the card back. learners_profiles stores
 * date_of_birth as TEXT — mostly ISO `YYYY-MM-DD`, occasionally free-form
 * junk; staff.date_of_birth is a DATE (arrives as ISO). Valid ISO prefixes
 * become "09 Nov 2001"; anything else is returned trimmed as stored (we
 * print what the record says — never invent). Empty → ''.
 */
export function formatDateLabel(value: string | null | undefined): string {
  const s = (value ?? '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!match) return s;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return s;
  return `${match[3]} ${MONTH_LABELS[month - 1]} ${match[1]}`;
}

/** Shape of the joined batches row used to derive the learner study period. */
export type BatchLike = {
  batch_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

/**
 * Derive the "2025-2028"-style YEAR study-period label from a batches row.
 * Prod survey 2026-07-25: batches.batch_name already IS that string for every
 * sampled row ("2023-2026", "2024-2027", …) — use it when it matches; else
 * fall back to the start_date/end_date years; else null (line omitted —
 * never invent a period). Pure and unit-tested.
 */
export function deriveStudyPeriodLabel(batch: BatchLike | null | undefined): string | null {
  if (!batch) return null;
  const name = (batch.batch_name ?? '').trim();
  const nameMatch = /^(\d{4})\s*[-–—]\s*(\d{4})$/.exec(name);
  if (nameMatch) return `${nameMatch[1]}-${nameMatch[2]}`;
  const startYear = /^(\d{4})-\d{2}-\d{2}/.exec((batch.start_date ?? '').trim())?.[1];
  const endYear = /^(\d{4})-\d{2}-\d{2}/.exec((batch.end_date ?? '').trim())?.[1];
  if (startYear && endYear) return `${startYear}-${endYear}`;
  return null;
}

// ── Rotation-safe photo geometry (2026-07-25) ────────────────────────────────
// satori (next/og) mispaints <img objectFit:'cover'> inside a transformed
// (rotated) subtree — the bitmap lands at a wrong offset/scale (Lane H's
// isolated repro; plain <img> without objectFit is proven good under the same
// rotation by the QR). sharp is unavailable and no npm deps may be added, so
// the cover-crop is computed GEOMETRICALLY: read the bitmap's intrinsic
// dimensions from its data-URL header bytes, then draw a plain <img> at the
// computed size/offset inside an overflow-hidden frame. Pure + unit-tested.

export type ImageDimensions = { width: number; height: number };

/**
 * Intrinsic pixel dimensions from a base64 image data URL's header bytes —
 * PNG / JPEG / GIF / WebP (VP8, VP8L, VP8X). No decoding library involved.
 * Returns null for anything unparseable (caller falls back, never throws).
 */
export function imageDimensionsFromDataUrl(dataUrl: string): ImageDimensions | null {
  try {
    const match = /^data:image\/[a-z0-9.+-]+;base64,(.+)$/i.exec((dataUrl ?? '').trim());
    if (!match) return null;
    // Headers live in the first bytes; 256 base64 chars ≫ enough for every
    // format except JPEG, whose SOF marker can sit after big EXIF blobs.
    const buf = Buffer.from(match[1].slice(0, 262144), 'base64');
    if (buf.length < 24) return null;

    // PNG: 8-byte signature, IHDR width/height at offsets 16/20 (BE).
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }

    // GIF: "GIF8", width/height at offsets 6/8 (LE).
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    }

    // WebP: RIFF….WEBP + first chunk VP8 / VP8L / VP8X.
    if (
      buf.length >= 30 &&
      buf.toString('ascii', 0, 4) === 'RIFF' &&
      buf.toString('ascii', 8, 12) === 'WEBP'
    ) {
      const chunk = buf.toString('ascii', 12, 16);
      if (chunk === 'VP8 ') {
        return {
          width: buf.readUInt16LE(26) & 0x3fff,
          height: buf.readUInt16LE(28) & 0x3fff
        };
      }
      if (chunk === 'VP8L' && buf[20] === 0x2f) {
        const bits = buf.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      if (chunk === 'VP8X') {
        return {
          width: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)),
          height: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16))
        };
      }
      return null;
    }

    // JPEG: walk the segment markers to the first SOFn frame header.
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let offset = 2;
      while (offset + 9 < buf.length) {
        if (buf[offset] !== 0xff) return null;
        const marker = buf[offset + 1];
        if (marker === 0xff) {
          offset += 1; // fill byte
          continue;
        }
        // Standalone markers without a length payload.
        if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
          offset += 2;
          continue;
        }
        const length = buf.readUInt16BE(offset + 2);
        if (length < 2) return null;
        const isSof =
          marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isSof) {
          return {
            height: buf.readUInt16BE(offset + 5),
            width: buf.readUInt16BE(offset + 7)
          };
        }
        offset += 2 + length;
      }
      return null;
    }

    return null;
  } catch {
    return null;
  }
}

export type CoverPlacement = { left: number; top: number; width: number; height: number };

/**
 * object-fit:'cover' + object-position:center as pure geometry: the drawn
 * size covers the box on both axes (never a sliver of background), centered
 * so the overflow crops evenly. Feed the result to a PLAIN absolutely-
 * positioned <img> inside an overflow-hidden box of boxW x boxH.
 */
export function coverPlacement(
  boxW: number,
  boxH: number,
  imgW: number,
  imgH: number
): CoverPlacement | null {
  if (boxW <= 0 || boxH <= 0 || imgW <= 0 || imgH <= 0) return null;
  const scale = Math.max(boxW / imgW, boxH / imgH);
  // Round UP so rounding can never leave a background seam inside the box.
  const width = Math.max(boxW, Math.ceil(imgW * scale));
  const height = Math.max(boxH, Math.ceil(imgH * scale));
  return {
    left: Math.round((boxW - width) / 2),
    top: Math.round((boxH - height) / 2),
    width,
    height
  };
}

/**
 * Wrap a bitmap data URL in an SVG data URL that performs the cover-crop via
 * its own viewport: the inner <image> is drawn at the computed cover size and
 * offset, and everything outside the viewBox is cut by the SVG itself. The
 * caller then renders a PLAIN in-flow <img> at exactly boxW x boxH — the one
 * image shape satori paints correctly under a rotated ancestor (both
 * objectFit and overflow-clipped absolute imgs mispaint there; the in-flow
 * exact-size img is proven good by the QR). resvg rasterizes nested data-URL
 * <image> elements — that is how every card bitmap already renders.
 * Returns null when the bitmap's header is unparseable (caller falls back).
 */
export function svgCoverImageDataUrl(
  dataUrl: string,
  boxW: number,
  boxH: number,
  cornerRadius: number = 0
): string | null {
  const dims = imageDimensionsFromDataUrl(dataUrl);
  if (!dims) return null;
  const placement = coverPlacement(boxW, boxH, dims.width, dims.height);
  if (!placement) return null;
  // Corner rounding also happens INSIDE the SVG (resvg-side clipPath) —
  // satori-side overflow:'hidden' clips mispaint under the rotated wrapper,
  // so the frame element must never rely on them for bitmaps.
  const radius = Math.max(0, Math.round(cornerRadius));
  const clip =
    radius > 0
      ? `<clipPath id="r"><rect x="0" y="0" width="${boxW}" height="${boxH}" rx="${radius}" ry="${radius}"/></clipPath>`
      : '';
  // The bitmap is inlined as a base64 data URL, so naming it on BOTH `href` and
  // `xlink:href` doubles the payload. A 3.6 MB photo became ~10.2 MB of XML and
  // the SVG rasteriser refused it outright ("Buffer size limit exceeded"),
  // 500-ing the whole card. 467 learner photos are over 2 MB, so this was not
  // an edge case. One attribute is enough — xlink:href is the SVG 1.1 spelling
  // every rasteriser has understood for years.
  const imageTag =
    `<image xlink:href="${dataUrl}" x="${placement.left}" y="${placement.top}" ` +
    `width="${placement.width}" height="${placement.height}" preserveAspectRatio="none"/>`;
  const body = radius > 0 ? `${clip}<g clip-path="url(#r)">${imageTag}</g>` : imageTag;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${boxW}" height="${boxH}" viewBox="0 0 ${boxW} ${boxH}">${body}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/** Hard-truncate long strings so they cannot overflow the fixed card canvas. */
export function truncateForCard(value: string | null | undefined, max: number): string {
  const s = (value ?? '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/**
 * How many characters at the END of an address are reserved as the
 * DELIVERABLE TAIL. The address is joined street → taluk → district → state →
 * PIN, so the parts that decide where a letter actually goes sit LAST.
 * Measured over the 787 active Engineering learners on 2026-08-14: the
 * district+state+PIN tail is at most 35 characters (p99 = 34), so 40 covers
 * the whole estate with the joining ", " included.
 */
export const ADDRESS_TAIL_CHARS = 40;

/**
 * Truncate an address so its END survives.
 *
 * `truncateForCard` cuts from the front and keeps a prefix, which is right for
 * a name or a course line. For an address it throws away exactly the parts
 * that matter: 402 of 787 active Engineering learners (51.1%) joined to more
 * than the generic 80-character cap, and the worst case (214 characters) had
 * its district, state and PIN cut off — the card printed a street fragment
 * ending mid-word, which no postal service can deliver to.
 *
 * When the value does not fit, the MIDDLE is elided instead: a head from the
 * start, then " … ", then the tail. The tail is snapped FORWARD to the next
 * component boundary (", ") so it starts on a whole component rather than
 * mid-word, and the head is snapped BACK to a whole component or word for the
 * same reason. Junk in the street field (this estate has records carrying a
 * mobile number and a second, contradictory PIN) is what the elision eats
 * first, which is the correct thing to sacrifice.
 *
 * Values within `max` are returned identically to `truncateForCard`.
 */
export function truncateAddressForCard(
  value: string | null | undefined,
  max: number,
  tailChars: number = ADDRESS_TAIL_CHARS
): string {
  const s = (value ?? '').trim();
  if (s.length <= max) return s;

  const separator = ' … ';
  // Not enough room to show a head, a separator and a tail — fall back to the
  // plain head-only cut rather than emitting something unreadable.
  const minHead = 8;
  if (max < minHead + separator.length + 8) return truncateForCard(s, max);

  const tailBudget = Math.min(tailChars, max - separator.length - minHead);
  let tail = s.slice(s.length - tailBudget);
  // Snap forward to a whole component (", ") if one is in reach, else to a
  // whole word, so the tail never opens mid-token.
  const compAt = tail.indexOf(', ');
  if (compAt !== -1) tail = tail.slice(compAt + 2);
  else {
    const spaceAt = tail.indexOf(' ');
    if (spaceAt !== -1) tail = tail.slice(spaceAt + 1);
  }
  tail = tail.trim();

  const headBudget = max - separator.length - tail.length;
  let head = s.slice(0, Math.max(minHead, headBudget));
  // Snap back to a whole component, else a whole word, so the head never ends
  // mid-token either.
  const lastComp = head.lastIndexOf(', ');
  if (lastComp >= minHead) head = head.slice(0, lastComp);
  else {
    const lastSpace = head.lastIndexOf(' ');
    if (lastSpace >= minHead) head = head.slice(0, lastSpace);
  }
  head = head.replace(/[\s,]+$/, '');

  return `${head}${separator}${tail}`;
}

/** Defensive parse of id_card_templates.field_mappings (JSONB, default '[]'). */
export function parseFieldMappings(raw: unknown): FieldMapping[] {
  if (!Array.isArray(raw)) return [];
  const out: FieldMapping[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const cf = (entry as Record<string, unknown>).card_field;
    const col = (entry as Record<string, unknown>).db_column;
    if (typeof cf !== 'string' || typeof col !== 'string') continue;
    if (!(CARD_FIELDS as readonly string[]).includes(cf)) continue;
    out.push({ card_field: cf as CardField, db_column: col });
  }
  return out;
}

/**
 * Resolve a card field's display value through field_mappings + the value bag,
 * falling back to the built-in default for that field.
 */
export function resolveMappedValue(
  field: CardField,
  mappings: FieldMapping[],
  valueBag: Record<string, string>,
  builtIn: string
): string {
  const mapping = mappings.find((m) => m.card_field === field);
  if (mapping) {
    const mapped = valueBag[mapping.db_column];
    if (typeof mapped === 'string' && mapped.trim() !== '') return mapped;
  }
  return builtIn;
}

// ─────────────────────────────────────────────────────────────────────────────
// Photo + QR helpers (network / async — all fail-soft)
// ─────────────────────────────────────────────────────────────────────────────

const PHOTO_FETCH_TIMEOUT_MS = 4000;
const PHOTO_MAX_BYTES = 4 * 1024 * 1024; // 4 MB
const BACKGROUND_MAX_BYTES = 6 * 1024 * 1024; // 6 MB — matches the bucket limit

/**
 * Fetch a single image URL and return it as a data URL, or null on ANY
 * failure (timeout, non-2xx, wrong content-type, oversized, network error).
 * Pre-fetching here means the compositor never does network I/O itself, so a
 * broken photo can never 500 the render.
 */
export async function fetchImageAsDataUrl(
  url: string,
  maxBytes: number = PHOTO_MAX_BYTES
): Promise<string | null> {
  const trimmed = (url ?? '').trim();
  if (trimmed === '') return null;
  // Already inline — accept as-is (cheap, no fetch).
  if (trimmed.startsWith('data:image/')) return trimmed;
  if (!/^https?:\/\//i.test(trimmed)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PHOTO_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(trimmed, { signal: controller.signal });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().startsWith('image/')) return null;
    const declaredLength = Number(res.headers.get('content-length') ?? '0');
    if (declaredLength > maxBytes) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > maxBytes) return null;
    const base64 = Buffer.from(buf).toString('base64');
    return `data:${contentType.split(';')[0]};base64,${base64}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Walk the ordered fallback chain; first fetchable image wins. */
export async function resolvePhotoDataUrl(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    const dataUrl = await fetchImageAsDataUrl(candidate);
    if (dataUrl) return dataUrl;
  }
  return null;
}

/**
 * Card artwork fetch with an SSRF allowlist: template JSON is editor-supplied
 * content, so the server only ever fetches backgrounds hosted in our own
 * public id-card-assets bucket. Anything else is ignored (fail-soft — the
 * card renders without artwork rather than erroring).
 */
export async function resolveBackgroundDataUrl(
  backgroundImageUrl: string | null | undefined
): Promise<string | null> {
  const url = (backgroundImageUrl ?? '').trim();
  if (url === '') return null;
  // .trim() is load-bearing: the deployed env value can carry a trailing
  // newline (fetch/URL parsing strips it everywhere else, so the app works —
  // but THIS plain-string prefix compare doesn't, and fail-soft hid it:
  // every background silently rendered as the standard design in prod).
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    .trim()
    .replace(/\/+$/, '');
  if (supabaseUrl === '') return null;
  const allowedPrefix = `${supabaseUrl}/storage/v1/object/public/id-card-assets/`;
  if (!url.startsWith(allowedPrefix)) {
    console.warn(
      '[id-cards/render] background_image outside the id-card-assets bucket — ignoring'
    );
    return null;
  }
  return fetchImageAsDataUrl(url, BACKGROUND_MAX_BYTES);
}

/** QR PNG as a data URL via the qrcode package; null on failure (fail-soft). */
export async function makeQrDataUrl(value: string): Promise<string | null> {
  try {
    if (!value || value.trim() === '') return null;
    return await QRCode.toDataURL(value, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 280
    });
  } catch (err) {
    console.warn('[id-cards/render] QR generation failed (rendering without QR):', err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// QR payload — the permanent JKKN ID, with the internal UUID as the fallback
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Choose what the card's QR actually carries.
 *
 * Preference order is deliberate and one-way: the permanent JKKN ID when the
 * person holds one, otherwise the internal UUID the card has always carried.
 * The fallback is not a nicety — the JKKN ID register is being filled in by a
 * backfill, so on any given day some people have a number and some do not, and
 * BOTH must print a scannable card.
 *
 * jkkn_identities.jkkn_id is char(8), so PostgREST can hand back a padded or
 * whitespace-only string. Trimming to empty is treated exactly like "no number
 * yet" — a blank QR is the one outcome this function exists to prevent.
 */
export function pickQrValue(
  jkknId: string | null | undefined,
  fallbackUuid: string | null | undefined
): string {
  const permanent = (jkknId ?? '').trim();
  if (permanent !== '') return permanent;
  return (fallbackUuid ?? '').trim();
}

/**
 * Read the person's ACTIVE JKKN ID, or null.
 *
 * Retired identities are excluded at the query (`retired_at IS NULL`). A
 * retired number is one that was issued in error or superseded; the register
 * keeps the row forever so the number is never handed to anyone else, but it
 * must never be printed on a card again.
 *
 * Fail-soft like every other read in this file: an error degrades to null (the
 * card then falls back to the UUID) rather than failing the render.
 */
async function readActiveJkknId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  link: { column: 'learner_profile_id' | 'team_member_id'; value: string }
): Promise<string | null> {
  const { data, error } = await supabase
    .from('jkkn_identities')
    .select('jkkn_id')
    .eq(link.column, link.value)
    .is('retired_at', null)
    .limit(1);

  if (error) {
    console.warn('[id-cards/render] JKKN ID lookup failed, falling back to UUID:', error.message);
    return null;
  }
  const rows = (data ?? []) as { jkkn_id: string | null }[];
  const value = (rows[0]?.jkkn_id ?? '').trim();
  return value === '' ? null : value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data assembly
// ─────────────────────────────────────────────────────────────────────────────

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  institution_id: string | null;
  learner_id: string | null;
};

type LearnerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  roll_number: string | null;
  register_number: string | null;
  student_photo_url: string | null;
  // Back-side columns — names verified against prod information_schema
  // 2026-07-25 (all TEXT on learners_profiles).
  blood_group: string | null;
  date_of_birth: string | null;
  father_name: string | null;
  father_mobile: string | null;
  mother_name: string | null;
  mother_mobile: string | null;
  student_mobile: string | null;
  permanent_address_street: string | null;
  permanent_address_taluk: string | null;
  permanent_address_district: string | null;
  permanent_address_state: string | null;
  permanent_address_pin_code: string | null;
  program: { program_name: string | null; card_short_name: string | null } | null;
  department: { department_name: string | null } | null;
  // fk_learners_profiles_batch (batch_id → batches.id) — verified in prod
  // pg_constraint 2026-07-25.
  batch: BatchLike | null;
};

type StaffRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  designation: string | null;
  profile_picture: string | null;
  // Back-side columns — verified against prod information_schema 2026-07-25.
  staff_id: string | null;
  blood_group: string | null;
  date_of_birth: string | null;
  address: string | null;
  phone: string | null;
  // staff_department_id_fkey (department_id → departments.id) — verified in
  // prod pg_constraint 2026-07-25. Display name for the front DEPT line.
  department: { department_name: string | null } | null;
};

function joinName(first: string | null, last: string | null): string {
  return [first, last]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Assemble everything the compositor needs for one person.
 * `supabase` is either the session-bound client (user path) or the
 * service-role client (agent path) — mirroring the jobs route pattern.
 */
export async function assembleCardData(
  // Session and service clients carry different generics; the reads below are
  // schema-typed at the call sites we control.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  profileId: string,
  templateInstitutionId: string | null
): Promise<AssembleResult> {
  // 1. The universal person anchor.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, email, avatar_url, institution_id, learner_id')
    .eq('id', profileId)
    .maybeSingle();

  if (profileError) {
    console.error('[id-cards/render] profile read error:', profileError);
    return {
      ok: false,
      status: 500,
      code: 'query_failed',
      message: `Failed to read profile: ${profileError.message}`
    };
  }
  if (!profile) {
    return {
      ok: false,
      status: 404,
      code: 'profile_not_found',
      message: 'No profile exists for the given profile_id'
    };
  }
  const p = profile as ProfileRow;

  let kind: CardPersonData['kind'] = 'employee';
  let fullName = (p.full_name ?? '').trim();
  let rollNumber: string | null = null;
  let registerNumber: string | null = null;
  let designation: string | null = null;
  let courseName: string | null = null;
  let departmentName: string | null = null;
  let qrValue = p.id;
  let bloodGroup: string | null = null;
  let dateOfBirthLabel: string | null = null;
  let guardianName: string | null = null;
  let guardianPhone: string | null = null;
  let address: string | null = null;
  let contactPhone: string | null = null;
  let idCode: string | null = null;
  let studyPeriod: string | null = null;
  let staffId: string | null = null;
  let courseEndDate: string | null = null;
  // Which row in jkkn_identities (if any) belongs to this person. Set by
  // whichever branch below identifies them; jkkn_identities keys learners on
  // learners_profiles.id and team members on staff.id — two different identity
  // spaces, neither of which is profiles.id.
  let identityLink: { column: 'learner_profile_id' | 'team_member_id'; value: string } | null = null;
  const photoCandidates: string[] = [];
  const valueBag: Record<string, string> = {
    'profiles.id': p.id,
    'profiles.full_name': fullName,
    'profiles.email': p.email ?? '',
    'profiles.avatar_url': p.avatar_url ?? ''
  };

  if (p.learner_id) {
    // 2a. Learner path — join learners_profiles + cheap display-name joins.
    kind = 'learner';
    let learner: LearnerRow | null = null;
    const { data: learnerData, error: learnerError } = await supabase
      .from('learners_profiles')
      .select(
        `id, first_name, last_name, roll_number, register_number, student_photo_url,
         blood_group, date_of_birth, father_name, father_mobile, mother_name,
         mother_mobile, student_mobile, permanent_address_street,
         permanent_address_taluk, permanent_address_district,
         permanent_address_state, permanent_address_pin_code,
         program:programs(program_name, card_short_name),
         department:departments(department_name),
         batch:batches(batch_name, start_date, end_date)`
      )
      .eq('id', p.learner_id)
      .maybeSingle();

    if (learnerError) {
      // Degrade (render from the profile alone) rather than fail the card.
      console.warn('[id-cards/render] learner read failed, degrading:', learnerError.message);
    } else {
      learner = learnerData as unknown as LearnerRow | null;
    }

    if (learner) {
      fullName = joinName(learner.first_name, learner.last_name) || fullName;
      rollNumber = learner.roll_number?.trim() || null;
      registerNumber = learner.register_number?.trim() || null;
      courseName = learner.program?.program_name?.trim() || null;
      departmentName = learner.department?.department_name?.trim() || null;
      qrValue = learner.id;
      identityLink = { column: 'learner_profile_id', value: learner.id };
      if (learner.student_photo_url) photoCandidates.push(learner.student_photo_url);
      valueBag['learners_profiles.id'] = learner.id;
      valueBag['learners_profiles.first_name'] = learner.first_name ?? '';
      valueBag['learners_profiles.last_name'] = learner.last_name ?? '';
      valueBag['learners_profiles.roll_number'] = learner.roll_number ?? '';
      valueBag['learners_profiles.register_number'] = learner.register_number ?? '';
      valueBag['learners_profiles.student_photo_url'] = learner.student_photo_url ?? '';
      // Display intent: program_id / department_id map to their display names
      // (a raw UUID must never be printed on a card).
      valueBag['learners_profiles.program_id'] = courseName ?? '';
      valueBag['learners_profiles.department_id'] = departmentName ?? '';
      // Short form for the card's narrow COURSE line ("BTECH IT"). Empty when
      // the programme has none — resolveMappedValue then falls through to the
      // built-in full programme name, so a card is never left blank.
      valueBag['programs.card_short_name'] = learner.program?.card_short_name?.trim() ?? '';

      // Back-side data (all fail-soft; blanks stay null → block omitted).
      bloodGroup = learner.blood_group?.trim() || null;
      dateOfBirthLabel = formatDateLabel(learner.date_of_birth) || null;
      guardianName = learner.father_name?.trim() || learner.mother_name?.trim() || null;
      guardianPhone = learner.father_mobile?.trim() || learner.mother_mobile?.trim() || null;
      address =
        [
          learner.permanent_address_street,
          learner.permanent_address_taluk,
          learner.permanent_address_district,
          learner.permanent_address_state,
          learner.permanent_address_pin_code
        ]
          .map((part) => (part ?? '').trim())
          .filter(Boolean)
          .join(', ') || null;
      contactPhone = learner.student_mobile?.trim() || null;
      idCode = learner.roll_number?.trim() || null;
      studyPeriod = deriveStudyPeriodLabel(learner.batch);
      // Course end date for the VALID UNTIL line. Read straight off the batch
      // row already in hand — batches.end_date is NOT NULL, so a batch row
      // means a real course end. No batch → stays null → the yearly rule.
      courseEndDate = (learner.batch?.end_date ?? '').trim() || null;
      // Display intent (like program_id/department_id): batch_id maps to the
      // derived study-period label — a raw UUID must never print on a card.
      valueBag['learners_profiles.batch_id'] = studyPeriod ?? '';
      valueBag['batches.batch_name'] = studyPeriod ?? '';
      valueBag['learners_profiles.blood_group'] = bloodGroup ?? '';
      valueBag['learners_profiles.date_of_birth'] = dateOfBirthLabel ?? '';
      valueBag['learners_profiles.father_name'] = learner.father_name ?? '';
      valueBag['learners_profiles.mother_name'] = learner.mother_name ?? '';
      valueBag['learners_profiles.student_mobile'] = contactPhone ?? '';
    } else {
      // Degraded learner path: profiles.learner_id IS learners_profiles.id, so
      // the identity link still resolves even though the learner read failed.
      qrValue = p.learner_id;
      identityLink = { column: 'learner_profile_id', value: p.learner_id };
    }
  } else {
    // 2b. Employee path — staff has no user_id column; the canonical bridge is
    // profiles.email == staff.institution_email (personal email as fallback).
    let staffRow: StaffRow | null = null;
    const email = (p.email ?? '').trim();
    if (email !== '') {
      for (const column of ['institution_email', 'email'] as const) {
        const { data: staffRows, error: staffError } = await supabase
          .from('staff')
          .select(
            'id, first_name, last_name, designation, profile_picture, staff_id, blood_group, date_of_birth, address, phone, department:departments(department_name)'
          )
          .eq(column, email)
          .limit(1);
        if (staffError) {
          console.warn(
            `[id-cards/render] team-member record lookup via ${column} failed, degrading:`,
            staffError.message
          );
          continue;
        }
        if (staffRows && staffRows.length > 0) {
          // Same cast shape as the learner read — the untyped client infers
          // the FK-embedded department as an array; PostgREST returns an
          // object for a many-to-one embed at runtime.
          staffRow = staffRows[0] as unknown as StaffRow;
          break;
        }
      }
    }

    if (staffRow) {
      fullName = joinName(staffRow.first_name, staffRow.last_name) || fullName;
      identityLink = { column: 'team_member_id', value: staffRow.id };
      designation = staffRow.designation?.trim() || null;
      departmentName = staffRow.department?.department_name?.trim() || null;
      if (staffRow.profile_picture) photoCandidates.push(staffRow.profile_picture);
      valueBag['staff.first_name'] = staffRow.first_name ?? '';
      valueBag['staff.last_name'] = staffRow.last_name ?? '';
      valueBag['staff.designation'] = staffRow.designation ?? '';
      valueBag['staff.profile_picture'] = staffRow.profile_picture ?? '';

      // Back-side data (staff.date_of_birth is a DATE — arrives as ISO text).
      bloodGroup = staffRow.blood_group?.trim() || null;
      dateOfBirthLabel = formatDateLabel(staffRow.date_of_birth) || null;
      address = staffRow.address?.trim() || null;
      contactPhone = staffRow.phone?.trim() || null;
      idCode = staffRow.staff_id?.trim() || null;
      staffId = idCode;
      valueBag['staff.staff_id'] = idCode ?? '';
      valueBag['staff.blood_group'] = bloodGroup ?? '';
      valueBag['staff.phone'] = contactPhone ?? '';
      // Display intent: department_id maps to its display name.
      valueBag['staff.department_id'] = departmentName ?? '';
      valueBag['departments.department_name'] = departmentName ?? '';
    }
  }

  // 2c. The QR payload. Prefer the permanent JKKN ID; keep the UUID assigned
  // above as the fallback so a card still scans for anyone the backfill has
  // not reached yet. qrValue already holds a non-blank UUID at this point, so
  // the QR can never come out empty.
  if (identityLink) {
    qrValue = pickQrValue(await readActiveJkknId(supabase, identityLink), qrValue);
  }

  // 3. Remaining photo fallbacks (chain: learner photo -> staff picture -> avatar).
  if (p.avatar_url) photoCandidates.push(p.avatar_url);

  // 4. Institution display name for the header band (fail-soft).
  let institutionName: string | null = null;
  let isSchool = false;
  const institutionId = templateInstitutionId ?? p.institution_id;
  if (institutionId) {
    const { data: inst, error: instError } = await supabase
      .from('institutions')
      .select('name, entity_type')
      .eq('id', institutionId)
      .maybeSingle();
    if (instError) {
      console.warn('[id-cards/render] institution read failed, degrading:', instError.message);
    } else {
      const row = inst as { name: string | null; entity_type: string | null } | null;
      institutionName = row?.name?.trim() || null;
      isSchool = (row?.entity_type ?? '').trim() === 'school';
    }
  }

  if (fullName === '') fullName = 'Name unavailable';
  valueBag['profiles.full_name'] = valueBag['profiles.full_name'] || fullName;

  return {
    ok: true,
    data: {
      kind,
      fullName,
      rollNumber,
      registerNumber,
      designation,
      courseName,
      departmentName,
      institutionName,
      isSchool,
      qrValue,
      photoCandidates,
      valueBag,
      bloodGroup,
      dateOfBirthLabel,
      guardianName,
      guardianPhone,
      address,
      contactPhone,
      idCode,
      studyPeriod,
      staffId,
      courseEndDate
    }
  };
}
