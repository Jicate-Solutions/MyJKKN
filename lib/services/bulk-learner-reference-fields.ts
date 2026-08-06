// lib/services/bulk-learner-reference-fields.ts
//
// Single source of truth for the learner "reference" (referral attribution) as
// it travels through the Bulk Edit Active Excel template.
//
// Why this module exists (2026-08-01):
// learners_profiles carries TWO reference systems. The admission leads module
// writes the typed triple — referral_type / referred_by_id / referred_by_name —
// where referred_by_id is a POLYMORPHIC key whose target table is decided by
// referral_type (education_consultants | learners_profiles | staff). The bulk
// edit template only ever wrote the LEGACY free-text triple (reference_type /
// reference_name / reference_contact), which links to nothing. The result was
// 4,088 rows of empty-string reference_type and values like 'BROTHER', 'NILL'
// and 'DAY SCHOLAR' sitting next to 891 correctly-linked rows.
//
// This module resolves an Excel row's (Type, ID, Person) cells to a real record
// and produces BOTH triples, so /learners/profiles/[id] — which renders only the
// legacy columns — keeps working without a UI change.
//
// Three things worth knowing before editing:
//
//  1. referred_by_id has NO foreign key (verified against pg_constraint). It
//     can't have one; it's polymorphic. So a wrong-table uuid writes silently
//     with no 23503 to catch it, and every type check has to happen here.
//
//  2. A name with a NULL id is a SUPPORTED state, not an error. 63 production
//     rows live that way and types/admission.ts:46 documents it as the
//     "free-text fallback when the referrer wasn't in the consultant list".
//     That is tier 3 below — old staff and old learners with no record at all.
//
//  3. Bare-name matching is provably unsafe: 333 duplicate full names among
//     active learners, 7 among staff, and 'SURESH' is four different
//     consultants. Ambiguity is therefore ALWAYS a warning, never a guess.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Separator the dropdown labels use between name and disambiguating code. */
const LABEL_SEP = ' — ';

export type ReferenceTypeKey = 'consultant' | 'student' | 'faculty';

/**
 * What the Excel dropdown shows. Note Staff -> 'faculty': the label is NOT the
 * stored value, and learners_profiles_referral_type_check only accepts the
 * lowercase DB values.
 */
export const REFERENCE_TYPE_EXCEL_LABEL: Record<ReferenceTypeKey, string> = {
  consultant: 'Consultant',
  student: 'Student',
  faculty: 'Staff',
};

/**
 * Mirror written to the legacy reference_type column. All three are members of
 * EXCEL_REFERENCE_TYPE (lib/utils/mappings/enquiry-excel-mappings.ts) so the
 * legacy column stays consistent with the enquiry template's vocabulary.
 */
export const REFERENCE_TYPE_LEGACY_LABEL: Record<ReferenceTypeKey, string> = {
  consultant: 'EDUCATIONAL CONSULTANT',
  student: 'CURRENT/FORMER STUDENT',
  faculty: 'JKKN STAFF',
};

/** Learner lifecycle stages that can plausibly refer someone. */
const STUDENT_LIFECYCLE_SCOPE = ['active', 'graduated', 'inactive', 'exited'];

/**
 * Status suffix shown in the dropdown label so the editor knows a past record
 * is a past record. Active learners and current staff get no suffix.
 */
const STUDENT_STATUS_SUFFIX: Record<string, string | null> = {
  active: null,
  graduated: 'Graduated',
  inactive: 'Inactive',
  exited: 'Exited',
};

export interface ReferenceCandidate {
  id: string;
  /** Plain name — what gets stored in referred_by_name / reference_name. */
  name: string;
  /** Disambiguator: consultant phone, staff_id, or roll_number. */
  code: string | null;
  /** 'Former' | 'Graduated' | 'Inactive' | 'Exited', else null. */
  statusSuffix: string | null;
  /** Phone used to auto-fill reference_contact on a match. */
  contact: string | null;
  /** "NAME — CODE (Status)" — exactly what the Lists sheet offers. */
  label: string;
}

interface TypeIndex {
  byLabel: Map<string, ReferenceCandidate>;
  byCode: Map<string, ReferenceCandidate[]>;
  byName: Map<string, ReferenceCandidate[]>;
}

export interface ReferenceResolvers {
  byType: Record<ReferenceTypeKey, ReferenceCandidate[]>;
  /** uuid -> which table it actually belongs to. The only wrong-table check we have. */
  byId: Map<string, { type: ReferenceTypeKey; candidate: ReferenceCandidate }>;
  index: Record<ReferenceTypeKey, TypeIndex>;
}

export type ReferenceOutcome = 'linked' | 'name_only' | 'type_only';

export interface ReferenceResolution {
  /** The DB columns to merge into updateData. Empty when there is nothing to write. */
  values: Record<string, any>;
  outcome: ReferenceOutcome | null;
  matched?: { type: ReferenceTypeKey; candidate: ReferenceCandidate };
  /** Tier 3 — a real name with no record behind it. */
  nameOnly?: { type: ReferenceTypeKey; name: string };
  warnings: string[];
}

/**
 * Excel-facing keys this module consumes. Callers MUST skip these in their
 * generic diff/update loops — the same contract FK_CONSUMED_KEYS has in
 * bulk-learner-fk-fields.ts, and for the same reason: two of them
 * (referral_type, referred_by_id) must never be written raw from a cell.
 */
export const REFERENCE_CONSUMED_KEYS = new Set<string>([
  'reference_type',
  'reference_name',
  'reference_contact',
  'referral_type',
  'referred_by_id',
  'referred_by_name',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Normalisation helpers
// ─────────────────────────────────────────────────────────────────────────────

const norm = (value: unknown): string =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

/** Digits only, so '+91 98765 43210' and '9876543210' compare equal. */
const normPhone = (value: unknown): string => String(value ?? '').replace(/\D/g, '');

const joinName = (first: unknown, last: unknown): string =>
  `${String(first ?? '').trim()} ${String(last ?? '').trim()}`.replace(/\s+/g, ' ').trim();

function buildLabel(name: string, code: string | null, statusSuffix: string | null): string {
  let label = name;
  if (code) label += `${LABEL_SEP}${code}`;
  if (statusSuffix) label += ` (${statusSuffix})`;
  return label;
}

/**
 * Split "NAME — CODE (Status)" back into its parts. Tolerant by design: a hand
 * typed name with no separator returns the whole cell as the name, which then
 * falls through to name matching.
 */
function splitLabel(raw: string): { namePart: string; codePart: string | null } {
  const withoutStatus = raw.replace(/\s*\([^)]*\)\s*$/, '').trim();
  // Accept em dash, en dash and a plain hyphen surrounded by spaces — editors
  // retype these labels by hand and Excel autocorrect rewrites dashes.
  const parts = withoutStatus.split(/\s+[—–]\s+|\s+-\s+/);
  if (parts.length < 2) return { namePart: withoutStatus, codePart: null };
  const codePart = parts[parts.length - 1].trim();
  const namePart = parts.slice(0, -1).join(' ').trim();
  return { namePart, codePart: codePart || null };
}

/**
 * Accepts the Excel label ('Staff'), the stored DB value ('faculty'), and the
 * handful of synonyms operators actually type.
 */
export function parseReferenceType(raw: unknown): ReferenceTypeKey | null {
  const value = norm(raw);
  if (!value) return null;
  switch (value) {
    case 'CONSULTANT':
    case 'EDUCATIONAL CONSULTANT':
    case 'CONSULTANCY':
      return 'consultant';
    case 'STUDENT':
    case 'LEARNER':
    case 'CURRENT/FORMER STUDENT':
      return 'student';
    case 'STAFF':
    case 'FACULTY':
    case 'JKKN STAFF':
      return 'faculty';
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PostgREST caps an unbounded select at 1,000 rows. The student list is 5,657,
 * so a plain .select() would silently drop ~4,600 people — they would vanish
 * from the dropdown AND fail name matching, becoming tier-3 orphans without a
 * single error. Same trap as ProgramService's default limit of 10.
 */
async function fetchAll(supabase: any, table: string, columns: string, apply?: (q: any) => any) {
  const BATCH = 1000;
  const rows: any[] = [];
  for (let offset = 0; ; offset += BATCH) {
    let query = supabase.from(table).select(columns).range(offset, offset + BATCH - 1);
    if (apply) query = apply(query);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to load ${table} for reference matching: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < BATCH) break;
  }
  return rows;
}

function indexCandidates(candidates: ReferenceCandidate[]): TypeIndex {
  const byLabel = new Map<string, ReferenceCandidate>();
  const byCode = new Map<string, ReferenceCandidate[]>();
  const byName = new Map<string, ReferenceCandidate[]>();

  for (const candidate of candidates) {
    byLabel.set(norm(candidate.label), candidate);
    if (candidate.code) {
      const key = norm(candidate.code);
      byCode.set(key, [...(byCode.get(key) ?? []), candidate]);
    }
    const nameKey = norm(candidate.name);
    if (nameKey) byName.set(nameKey, [...(byName.get(nameKey) ?? []), candidate]);
  }

  return { byLabel, byCode, byName };
}

export async function buildReferenceResolvers(supabase: any): Promise<ReferenceResolvers> {
  const [consultantRows, staffRows, learnerRows] = await Promise.all([
    fetchAll(supabase, 'education_consultants', 'id, name, phone'),
    fetchAll(supabase, 'staff', 'id, first_name, last_name, staff_id, designation, phone, is_active'),
    fetchAll(supabase, 'learners_profiles', 'id, first_name, last_name, roll_number, student_mobile, lifecycle_status', (q) =>
      q.in('lifecycle_status', STUDENT_LIFECYCLE_SCOPE)
    ),
  ]);

  const consultants: ReferenceCandidate[] = consultantRows.map((row: any) => {
    const name = String(row.name ?? '').trim();
    // education_consultants.code is empty on all 151 rows, so phone is the only
    // disambiguator available — and it is needed: SURESH is four consultants.
    const code = row.phone ? String(row.phone).trim() : null;
    return {
      id: row.id,
      name,
      code,
      statusSuffix: null,
      contact: code,
      label: buildLabel(name, code, null),
    };
  });

  const staff: ReferenceCandidate[] = staffRows.map((row: any) => {
    const name = joinName(row.first_name, row.last_name);
    const code = row.staff_id
      ? String(row.staff_id).trim()
      : row.designation
      ? String(row.designation).trim()
      : null;
    const statusSuffix = row.is_active === true ? null : 'Former';
    return {
      id: row.id,
      name,
      code,
      statusSuffix,
      contact: row.phone ? String(row.phone).trim() : null,
      label: buildLabel(name, code, statusSuffix),
    };
  });

  const students: ReferenceCandidate[] = learnerRows.map((row: any) => {
    const name = joinName(row.first_name, row.last_name);
    const code = row.roll_number ? String(row.roll_number).trim() : null;
    const statusSuffix = STUDENT_STATUS_SUFFIX[row.lifecycle_status] ?? null;
    return {
      id: row.id,
      name,
      code,
      statusSuffix,
      contact: row.student_mobile ? String(row.student_mobile).trim() : null,
      label: buildLabel(name, code, statusSuffix),
    };
  });

  const byType: Record<ReferenceTypeKey, ReferenceCandidate[]> = {
    consultant: consultants,
    faculty: staff,
    student: students,
  };

  const byId = new Map<string, { type: ReferenceTypeKey; candidate: ReferenceCandidate }>();
  for (const type of Object.keys(byType) as ReferenceTypeKey[]) {
    for (const candidate of byType[type]) {
      byId.set(String(candidate.id).toLowerCase(), { type, candidate });
    }
  }

  return {
    byType,
    byId,
    index: {
      consultant: indexCandidates(consultants),
      faculty: indexCandidates(staff),
      student: indexCandidates(students),
    },
  };
}

// Process-level cache, same shape and TTL as getLearnerFkResolvers: one upload
// iterates thousands of rows and these lookups are effectively static, but a
// newly added consultant must not stay invisible for the life of the process.
const RESOLVER_TTL_MS = 60_000;
let resolverCache: { at: number; value: Promise<ReferenceResolvers> } | null = null;

export function getReferenceResolvers(supabase: any): Promise<ReferenceResolvers> {
  if (resolverCache && Date.now() - resolverCache.at < RESOLVER_TTL_MS) {
    return resolverCache.value;
  }
  const value = buildReferenceResolvers(supabase);
  resolverCache = { at: Date.now(), value };
  value.catch(() => {
    resolverCache = null;
  });
  return value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolution
// ─────────────────────────────────────────────────────────────────────────────

export interface ResolveReferenceContext {
  /** Existing learners_profiles row — supplies the stored type when the cell is blank. */
  existing?: Record<string, any> | null;
}

const candidateSummary = (candidates: ReferenceCandidate[]): string =>
  candidates
    .slice(0, 4)
    .map((c) => c.label)
    .join(' | ') + (candidates.length > 4 ? ` | +${candidates.length - 4} more` : '');

/**
 * Turn the (Reference Type, Reference ID, Reference Person, Reference Contact)
 * cells into both reference triples.
 *
 * Precedence: Reference ID wins over Reference Person, exactly as "<Field> ID"
 * wins over the label column for the five FK fields.
 */
export function resolveLearnerReference(
  row: Record<string, any>,
  resolvers: ReferenceResolvers,
  ctx: ResolveReferenceContext = {}
): ReferenceResolution {
  const warnings: string[] = [];
  const empty: ReferenceResolution = { values: {}, outcome: null, warnings };

  const rawType = row.reference_type;
  const rawId = row.referred_by_id;
  const rawPerson = row.referred_by_name;
  const rawContact = row.reference_contact;

  const has = (v: any) => v !== undefined && v !== null && String(v).trim() !== '';
  if (!has(rawType) && !has(rawId) && !has(rawPerson) && !has(rawContact)) {
    return empty;
  }

  // ── Type ────────────────────────────────────────────────────────────────
  let type: ReferenceTypeKey | null = null;
  if (has(rawType)) {
    type = parseReferenceType(rawType);
    if (!type) {
      warnings.push(
        `Reference Type "${String(rawType).trim()}" is not one of Consultant / Student / Staff — reference skipped.`
      );
      return empty;
    }
  } else if (has(rawId) || has(rawPerson)) {
    // Blank Type falls back to the learner's stored referral_type, the same way
    // resolveLearnerFkFields() scopes caste to ctx.existing.community_category_id.
    type = parseReferenceType(ctx.existing?.referral_type);
    if (!type) {
      warnings.push('Reference Type is required to match a Reference Person — reference skipped.');
      return empty;
    }
  } else {
    // Contact alone, with no type stored or supplied. reference_contact is a
    // legacy free-text column and editing it by itself is a legitimate edit, so
    // write it and say nothing — 123 active learners hold a legacy contact with
    // no typed reference, and warning on every one of them during an unedited
    // round-trip would bury the warnings that matter.
    const digits = normPhone(rawContact);
    if (!digits || digits === normPhone(ctx.existing?.reference_contact)) return empty;
    return { values: { reference_contact: digits }, outcome: null, warnings };
  }

  const typeLabel = REFERENCE_TYPE_EXCEL_LABEL[type];
  const index = resolvers.index[type];
  let matched: ReferenceCandidate | null = null;
  let ambiguous = false;

  // ── Tier 1/2 by ID ──────────────────────────────────────────────────────
  if (has(rawId)) {
    const id = String(rawId).trim().toLowerCase();
    if (!UUID_RE.test(id)) {
      warnings.push(`Reference ID "${String(rawId).trim()}" is not a valid ID — reference skipped.`);
      return empty;
    }
    const hit = resolvers.byId.get(id);
    if (!hit) {
      warnings.push(`Reference ID "${id}" matched no record — reference skipped.`);
      return empty;
    }
    if (hit.type !== type) {
      warnings.push(
        `Reference ID "${id}" is a ${REFERENCE_TYPE_EXCEL_LABEL[hit.type]} record, but Reference Type says ${typeLabel} — reference skipped.`
      );
      return empty;
    }
    matched = hit.candidate;
  }

  // ── Tier 1/2 by label, code, then bare name ─────────────────────────────
  let personName = '';
  if (!matched && has(rawPerson)) {
    const raw = String(rawPerson).trim();
    const { namePart, codePart } = splitLabel(raw);
    personName = namePart || raw;

    matched = index.byLabel.get(norm(raw)) ?? null;

    if (!matched && codePart) {
      const hits = index.byCode.get(norm(codePart)) ?? [];
      if (hits.length === 1) matched = hits[0];
      else if (hits.length > 1) {
        ambiguous = true;
        warnings.push(
          `Reference Person "${raw}" matches ${hits.length} ${typeLabel} records (${candidateSummary(hits)}) — reference skipped.`
        );
      }
    }

    if (!matched && !ambiguous) {
      const hits = index.byName.get(norm(personName)) ?? [];
      if (hits.length === 1) matched = hits[0];
      else if (hits.length > 1) {
        ambiguous = true;
        warnings.push(
          `Reference Person "${raw}" matches ${hits.length} ${typeLabel} records (${candidateSummary(hits)}) — add the code shown in the dropdown, or paste the Reference ID.`
        );
      }
    }
  }

  if (ambiguous) return empty;

  const contact = has(rawContact) ? normPhone(rawContact) : '';

  // ── Tier 1/2 — linked ───────────────────────────────────────────────────
  if (matched) {
    const values: Record<string, any> = {
      referral_type: type,
      referred_by_id: matched.id,
      referred_by_name: matched.name,
      reference_type: REFERENCE_TYPE_LEGACY_LABEL[type],
      reference_name: matched.name,
    };
    // Auto-fill the contact from the record only when the LINK is changing.
    // Deriving it unconditionally would rewrite reference_contact on rows whose
    // reference nobody touched, so a re-uploaded unedited template would report
    // changes — the promise the template's own instructions make.
    const linkChanged = String(ctx.existing?.referred_by_id ?? '') !== String(matched.id);
    const resolvedContact = contact || (linkChanged ? normPhone(matched.contact) : '');
    if (resolvedContact) values.reference_contact = resolvedContact;
    return { values, outcome: 'linked', matched: { type, candidate: matched }, warnings };
  }

  // ── Tier 3 — a real person with no record ───────────────────────────────
  if (has(rawPerson)) {
    const name = personName.toUpperCase();
    const values: Record<string, any> = {
      referral_type: type,
      // Explicit null clears a stale link. That also fires the attribution
      // trigger's DELETE branch for the previous consultant, which is correct:
      // the editor replaced a linked reference with a name-only one.
      referred_by_id: null,
      referred_by_name: name,
      reference_type: REFERENCE_TYPE_LEGACY_LABEL[type],
      reference_name: name,
    };
    if (contact) values.reference_contact = contact;
    return { values, outcome: 'name_only', nameOnly: { type, name }, warnings };
  }

  // ── Type only ───────────────────────────────────────────────────────────
  // Changing the type while a link to a DIFFERENT type's record is still stored
  // would leave referral_type='student' pointing at a consultant row. Refuse.
  const existingId = ctx.existing?.referred_by_id;
  if (existingId) {
    const existingHit = resolvers.byId.get(String(existingId).toLowerCase());
    if (existingHit && existingHit.type !== type) {
      warnings.push(
        `Reference Type ${typeLabel} conflicts with the linked ${REFERENCE_TYPE_EXCEL_LABEL[existingHit.type]} record already on this learner — give a Reference Person as well.`
      );
      return empty;
    }
  }

  const values: Record<string, any> = {
    referral_type: type,
    reference_type: REFERENCE_TYPE_LEGACY_LABEL[type],
  };
  if (contact) values.reference_contact = contact;
  return { values, outcome: 'type_only', warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// Typo hints
// ─────────────────────────────────────────────────────────────────────────────

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

/**
 * Best near-match for each name-only entry, so the reviewer can tell "SURESH
 * KUMR" (typo) from "K. BALAN, retired 2019" (genuinely gone).
 *
 * Cost control: names are deduped, capped, and candidates are pre-filtered by
 * first letter and length before any distance is computed. Without the cap a
 * 4,000-row sheet of bad names would be ~22M comparisons against the 5,657
 * student list.
 */
export function buildReferenceTypoHints(
  nameOnly: Array<{ type: ReferenceTypeKey; name: string }>,
  resolvers: ReferenceResolvers,
  limit = 100
): Map<string, string> {
  const hints = new Map<string, string>();
  const seen = new Set<string>();

  for (const entry of nameOnly) {
    const key = `${entry.type}|${norm(entry.name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (seen.size > limit) break;

    const target = norm(entry.name);
    if (target.length < 4) continue;

    let best: { label: string; distance: number } | null = null;
    for (const candidate of resolvers.byType[entry.type]) {
      const name = norm(candidate.name);
      if (!name || name[0] !== target[0]) continue;
      if (Math.abs(name.length - target.length) > 3) continue;
      const distance = editDistance(target, name);
      if (distance === 0) continue; // an exact match would have resolved already
      if (!best || distance < best.distance) best = { label: candidate.label, distance };
    }

    if (best && 1 - best.distance / Math.max(target.length, 1) >= 0.85) {
      hints.set(key, best.label);
    }
  }

  return hints;
}

/** Key used by buildReferenceTypoHints, so callers can look a hint back up. */
export const referenceHintKey = (type: ReferenceTypeKey, name: string): string =>
  `${type}|${norm(name)}`;
