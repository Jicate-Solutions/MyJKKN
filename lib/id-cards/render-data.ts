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
  /** QR payload: learners_profiles.id for learners, profiles.id for employees. */
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

/**
 * Default validity label: end of the current academic year (31 May).
 * Academic years run June→May, so from June onward the card is valid until
 * 31 May of the NEXT calendar year. Placeholder policy until a dedicated
 * id_card validity policy key exists.
 */
export function defaultValidUntilLabel(now: Date = new Date()): string {
  const year = now.getMonth() >= 5 ? now.getFullYear() + 1 : now.getFullYear();
  return `31 ${MONTH_LABELS[4]} ${year}`;
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
  const imageTag =
    `<image href="${dataUrl}" xlink:href="${dataUrl}" x="${placement.left}" y="${placement.top}" ` +
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
  program: { program_name: string | null } | null;
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
         program:programs(program_name),
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
      qrValue = p.learner_id;
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

  // 3. Remaining photo fallbacks (chain: learner photo -> staff picture -> avatar).
  if (p.avatar_url) photoCandidates.push(p.avatar_url);

  // 4. Institution display name for the header band (fail-soft).
  let institutionName: string | null = null;
  const institutionId = templateInstitutionId ?? p.institution_id;
  if (institutionId) {
    const { data: inst, error: instError } = await supabase
      .from('institutions')
      .select('name')
      .eq('id', institutionId)
      .maybeSingle();
    if (instError) {
      console.warn('[id-cards/render] institution read failed, degrading:', instError.message);
    } else {
      institutionName = (inst as { name: string | null } | null)?.name?.trim() || null;
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
      staffId
    }
  };
}
