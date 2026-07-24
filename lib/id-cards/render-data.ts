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
  | 'photo';

export const CARD_FIELDS: readonly CardField[] = [
  'name_line_1',
  'roll_number',
  'course',
  'department',
  'valid_until',
  'qr_code',
  'photo'
] as const;

export type FieldMapping = { card_field: CardField; db_column: string };

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
};

export type AssembleResult =
  | { ok: true; data: CardPersonData }
  | { ok: false; status: 404 | 500; code: string; message: string };

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

/**
 * Fetch a single image URL and return it as a data URL, or null on ANY
 * failure (timeout, non-2xx, wrong content-type, oversized, network error).
 * Pre-fetching here means the compositor never does network I/O itself, so a
 * broken photo can never 500 the render.
 */
export async function fetchImageAsDataUrl(url: string): Promise<string | null> {
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
    if (declaredLength > PHOTO_MAX_BYTES) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > PHOTO_MAX_BYTES) return null;
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
  program: { program_name: string | null } | null;
  department: { department_name: string | null } | null;
};

type StaffRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  designation: string | null;
  profile_picture: string | null;
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
         program:programs(program_name),
         department:departments(department_name)`
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
          .select('id, first_name, last_name, designation, profile_picture')
          .eq(column, email)
          .limit(1);
        if (staffError) {
          console.warn(
            `[id-cards/render] staff lookup via ${column} failed, degrading:`,
            staffError.message
          );
          continue;
        }
        if (staffRows && staffRows.length > 0) {
          staffRow = staffRows[0] as StaffRow;
          break;
        }
      }
    }

    if (staffRow) {
      fullName = joinName(staffRow.first_name, staffRow.last_name) || fullName;
      designation = staffRow.designation?.trim() || null;
      if (staffRow.profile_picture) photoCandidates.push(staffRow.profile_picture);
      valueBag['staff.first_name'] = staffRow.first_name ?? '';
      valueBag['staff.last_name'] = staffRow.last_name ?? '';
      valueBag['staff.designation'] = staffRow.designation ?? '';
      valueBag['staff.profile_picture'] = staffRow.profile_picture ?? '';
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
      valueBag
    }
  };
}
