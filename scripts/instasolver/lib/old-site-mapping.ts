/**
 * Old InstaSolver site -> MyJKKN: the PURE part of the import.
 *
 * Everything here is a plain function of its inputs — no database, no file
 * system — so vitest can pin it with synthetic rows and never touch the real
 * export (which holds names, emails and mobile numbers and must never enter
 * the repo). scripts/instasolver/import-old-site.ts does the reading and the
 * writing around these functions.
 *
 * Director rulings, 30 Sep 2026:
 *   - every UNFINISHED old job becomes a Campus Walk task; one older than a
 *     year is titled 'Check if still broken: ...';
 *   - the whole old history is kept (legacy_instasolver_issues /
 *     legacy_instasolver_requirements);
 *   - the old 'Pending MD Approval' purchase requests are decided on
 *     /instasolver/old-purchase-requests.
 */

import type { CreateWalkTaskInput } from '@/lib/services/campus-walk/campus-walk-service';

// ── Old-site record shapes (only the fields the import reads) ──────────────

export interface OldIssue {
  id: number;
  date?: string | null;
  institution?: string | null;
  issue_category?: string | null;
  issue_details?: string | null;
  issue_location?: string | null;
  issue_reason?: string | null;
  resolution_suggestion?: string | null;
  image_url?: string | null;
  severity?: string | null;
  assigned_to?: string | null;
  status?: string | null;
  completed?: boolean | null;
  date_completed?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  reopened?: boolean | null;
  reopen_reason?: string | null;
  rejection_reason?: string | null;
  completed_image_url?: string | null;
  ai_summary?: string | null;
  reporter?: string | null;
  email_id?: string | null;
}

export interface OldRequirement {
  id: number;
  date?: string | null;
  institution?: string | null;
  requirement_category?: string | null;
  requirement_details?: string | null;
  requirement_location?: string | null;
  requirement_reason?: string | null;
  resolution_suggestion?: string | null;
  image_url?: string | null;
  priority?: string | null;
  assigned_to?: string | null;
  status?: string | null;
  completed?: boolean | null;
  date_completed?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  reopened?: boolean | null;
  reopen_reason?: string | null;
  rejection_reason?: string | null;
  completed_image_url?: string | null;
  reporter?: string | null;
  email_id?: string | null;
}

export interface OldAdminNote {
  content?: string | null;
  created_at?: string | null;
  admin_name?: string | null;
  admin_role?: string | null;
  attachments?: unknown;
  issue_id?: number | null;
  requirement_id?: number | null;
}

export interface CleanPlaces {
  institution_rules: Array<{ regex: string; institution: string }>;
  generic_regex: string;
  tamil_transliteration_hints?: Record<string, string>;
  site_override_rules: Array<{ regex: string; site: string }>;
  area_rules_by_site: Record<string, Array<{ regex: string; area: string }>>;
  generic_area_rules: Array<{ regex: string; area: string }>;
  mapping: Record<string, { site: string; area: string; via?: string }>;
}

export interface CleanCategories {
  raw_to_clean: Record<string, string>;
  resort_by_keywords: string[];
  keyword_rules: Array<{ group: string; regex: string }>;
  requirement_category_map: Record<string, string>;
}

export interface InstitutionTarget {
  institution_id: string;
  code: string;
  label?: string;
  review?: boolean;
  why?: string;
}

export interface InstitutionMapFile {
  fallback_institution: InstitutionTarget;
  map: Record<string, InstitutionTarget>;
}

// ── Small helpers ──────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

/** Old records older than this at import are titled 'Check if still broken'. */
export const STILL_BROKEN_AFTER_DAYS = 365;

/** The day the old site bulk-loaded 672 rows with no real report date. */
export const BULK_LOAD_DAY = '2024-11-23';

export const STILL_BROKEN_PREFIX = 'Check if still broken: ';

/** Trim, collapse inner whitespace, lower-case — the key the institution map uses. */
export function normaliseKey(raw: string | null | undefined): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function collapse(text: string | null | undefined): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function nullIfBlank(text: string | null | undefined): string | null {
  const t = String(text ?? '').trim();
  return t.length > 0 ? t : null;
}

function isoOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function safeRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return null;
  }
}

// ── College ────────────────────────────────────────────────────────────────

export interface MappedInstitution {
  institutionId: string;
  code: string;
  /** false = not in the map; fell back to Main Office. */
  mapped: boolean;
  /** true = in the map, but flagged for the Director to confirm. */
  review: boolean;
}

export function mapInstitution(
  raw: string | null | undefined,
  file: InstitutionMapFile
): MappedInstitution {
  const hit = file.map[normaliseKey(raw)];
  if (hit) {
    return {
      institutionId: hit.institution_id,
      code: hit.code,
      mapped: true,
      review: Boolean(hit.review),
    };
  }
  return {
    institutionId: file.fallback_institution.institution_id,
    code: file.fallback_institution.code,
    mapped: false,
    review: false,
  };
}

// ── Place ──────────────────────────────────────────────────────────────────

/** The clean-places file's own college label (its keys start with it). */
export function cleanInstitutionLabel(
  raw: string | null | undefined,
  places: CleanPlaces
): string {
  const text = normaliseKey(raw);
  for (const rule of places.institution_rules) {
    if (safeRegex(rule.regex)?.test(text)) return rule.institution;
  }
  return 'Main Office & others';
}

function applyTamilHints(text: string, places: CleanPlaces): string {
  let out = text;
  for (const [tamil, latin] of Object.entries(places.tamil_transliteration_hints ?? {})) {
    if (out.includes(tamil)) out = out.split(tamil).join(latin);
  }
  return out.toLowerCase();
}

function derivePlace(text: string, site: string, places: CleanPlaces): { site: string; area: string } {
  const t = applyTamilHints(text, places);
  let resolvedSite = site;
  for (const rule of places.site_override_rules) {
    if (safeRegex(rule.regex)?.test(t)) {
      resolvedSite = rule.site;
      break;
    }
  }
  const areaRules = [
    ...(places.area_rules_by_site[resolvedSite] ?? []),
    ...places.generic_area_rules,
  ];
  for (const rule of areaRules) {
    if (safeRegex(rule.regex)?.test(t)) return { site: resolvedSite, area: rule.area };
  }
  return { site: resolvedSite, area: 'Unspecified' };
}

/**
 * clean-places.json's rule: the key is "<clean college> || <lower-cased raw
 * location>". A GENERIC location ("ground floor", "jkkn") says nothing, so the
 * place is derived per row from the details instead — the file's own note says
 * its "(from details)" entries only show the first row's result.
 */
export function cleanPlace(
  rawInstitution: string | null | undefined,
  rawLocation: string | null | undefined,
  details: string | null | undefined,
  places: CleanPlaces
): { site: string; area: string } {
  const college = cleanInstitutionLabel(rawInstitution, places);
  const loc = collapse(rawLocation).toLowerCase();
  const generic = safeRegex(places.generic_regex)?.test(loc) ?? false;

  if (!generic) {
    const exact = places.mapping[`${college} || ${String(rawLocation ?? '').toLowerCase()}`];
    const tidy = places.mapping[`${college} || ${loc}`];
    const hit = exact ?? tidy;
    if (hit) return { site: hit.site, area: hit.area };
    return derivePlace(loc, college, places);
  }
  return derivePlace(`${loc} ${collapse(details)}`, college, places);
}

// ── Category ───────────────────────────────────────────────────────────────

export function cleanIssueCategory(
  raw: string | null | undefined,
  details: string | null | undefined,
  cats: CleanCategories
): string {
  const key = String(raw ?? '');
  const trimmed = key.trim();
  const resort = cats.resort_by_keywords.includes(key) || cats.resort_by_keywords.includes(trimmed);
  const direct = cats.raw_to_clean[key] ?? cats.raw_to_clean[trimmed];
  if (direct && !resort) return direct;
  const text = collapse(details).toLowerCase();
  for (const rule of cats.keyword_rules) {
    if (safeRegex(rule.regex)?.test(text)) return rule.group;
  }
  return 'Other';
}

export function cleanRequirementCategory(
  raw: string | null | undefined,
  cats: CleanCategories
): string {
  const key = String(raw ?? '');
  return cats.requirement_category_map[key] ?? cats.requirement_category_map[key.trim()] ?? 'Other';
}

// ── Status and age ─────────────────────────────────────────────────────────

/**
 * Unfinished = the old site still shows it as live ('Approved' = accepted but
 * not done, 'Pending' = not yet looked at) AND it was never marked complete.
 * On the 30 Sep export that is 171 rows.
 */
export function isOpenIssue(r: Pick<OldIssue, 'status' | 'completed'>): boolean {
  const s = normaliseKey(r.status);
  return (s === 'approved' || s === 'pending') && r.completed !== true;
}

export function reportedAt(r: { date?: string | null; created_at?: string | null }): string | null {
  return isoOrNull(r.date) ?? isoOrNull(r.created_at);
}

export function isBulkLoaded(r: { created_at?: string | null }): boolean {
  return String(r.created_at ?? '').startsWith(BULK_LOAD_DAY);
}

export function ageInDays(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  return Math.floor((now.getTime() - Date.parse(iso)) / DAY_MS);
}

export function needsStillBrokenCheck(r: OldIssue, now: Date): boolean {
  const age = ageInDays(reportedAt(r), now);
  return isOpenIssue(r) && age !== null && age > STILL_BROKEN_AFTER_DAYS;
}

// ── Rows for the two history tables ────────────────────────────────────────

export interface MappingContext {
  institutions: InstitutionMapFile;
  places: CleanPlaces;
  categories: CleanCategories;
  /** lower-cased email -> MyJKKN profiles.id. Empty when matching was not run. */
  profileIdByEmail: Map<string, string>;
  /**
   * Matched profiles that are inactive or login-disabled — people who no
   * longer work or study at JKKN (ruling 1 Oct 2026). Their id stays on the
   * history row; their imported job carries no reporter.
   */
  leftProfileIds?: ReadonlySet<string>;
  /** lower-cased email -> name, from the old site's own profiles (for assigned_to). */
  oldNameByEmail: Map<string, string>;
  notesByIssue: Map<number, OldAdminNote[]>;
  notesByRequirement: Map<number, OldAdminNote[]>;
  now: Date;
}

/**
 * Columns the importer must NEVER send: they belong to what happened AFTER the
 * import (the task that was created, the Director's decision). The upsert
 * sends only the columns in its payload, so leaving these out is what makes a
 * re-run safe. Tested.
 */
export const ISSUE_IMPORT_NEVER_WRITES = ['imported_task_id', 'task_imported_at'] as const;
export const REQUIREMENT_IMPORT_NEVER_WRITES = [
  'decision',
  'decision_reason',
  'decided_by',
  'decided_at',
  'decision_claimed_at',
  'imported_purchase_request_id',
] as const;

function matchReporter(email: string | null | undefined, ctx: MappingContext): string | null {
  const key = normaliseKey(email);
  return key ? ctx.profileIdByEmail.get(key) ?? null : null;
}

/** assigned_to is usually a team member's email; keep their NAME, never the address. */
function assignedToName(raw: string | null | undefined, ctx: MappingContext): string | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  if (!text.includes('@')) return text;
  return ctx.oldNameByEmail.get(text.toLowerCase()) ?? null;
}

function notesFor(list: OldAdminNote[] | undefined) {
  return (list ?? []).map((n) => ({
    content: n.content ?? null,
    created_at: n.created_at ?? null,
    admin_name: n.admin_name ?? null,
    admin_role: n.admin_role ?? null,
    attachments: Array.isArray(n.attachments) ? n.attachments : [],
  }));
}

export function buildIssueRow(r: OldIssue, ctx: MappingContext) {
  const place = cleanPlace(r.institution, r.issue_location, r.issue_details, ctx.places);
  return {
    legacy_id: r.id,
    legacy_institution: nullIfBlank(r.institution),
    institution_id: mapInstitution(r.institution, ctx.institutions).institutionId,
    legacy_category: nullIfBlank(r.issue_category),
    clean_category: cleanIssueCategory(r.issue_category, r.issue_details, ctx.categories),
    legacy_location: nullIfBlank(r.issue_location),
    clean_site: place.site,
    clean_area: place.area,
    details: nullIfBlank(r.issue_details),
    cause: nullIfBlank(r.issue_reason),
    suggested_fix: nullIfBlank(r.resolution_suggestion),
    ai_summary: nullIfBlank(r.ai_summary),
    notes: nullIfBlank(r.notes),
    severity: nullIfBlank(r.severity),
    legacy_status: nullIfBlank(r.status),
    is_completed: r.completed === true,
    is_open: isOpenIssue(r),
    reopened: r.reopened === true,
    reopen_reason: nullIfBlank(r.reopen_reason),
    rejection_reason: nullIfBlank(r.rejection_reason),
    legacy_assigned_to: assignedToName(r.assigned_to, ctx),
    photo_url: nullIfBlank(r.image_url),
    completed_photo_url: nullIfBlank(r.completed_image_url),
    reporter_name: nullIfBlank(r.reporter),
    reporter_profile_id: matchReporter(r.email_id, ctx),
    reported_at: reportedAt(r),
    reported_at_is_bulk_load: isBulkLoaded(r),
    completed_at: isoOrNull(r.date_completed),
    legacy_created_at: isoOrNull(r.created_at),
    legacy_updated_at: isoOrNull(r.updated_at),
    admin_notes: notesFor(ctx.notesByIssue.get(r.id)),
    needs_still_broken_check: needsStillBrokenCheck(r, ctx.now),
    updated_at: ctx.now.toISOString(),
  };
}

export function buildRequirementRow(r: OldRequirement, ctx: MappingContext) {
  const place = cleanPlace(r.institution, r.requirement_location, r.requirement_details, ctx.places);
  return {
    legacy_id: r.id,
    legacy_institution: nullIfBlank(r.institution),
    institution_id: mapInstitution(r.institution, ctx.institutions).institutionId,
    legacy_category: nullIfBlank(r.requirement_category),
    clean_category: cleanRequirementCategory(r.requirement_category, ctx.categories),
    legacy_location: nullIfBlank(r.requirement_location),
    clean_site: place.site,
    clean_area: place.area,
    details: nullIfBlank(r.requirement_details),
    cause: nullIfBlank(r.requirement_reason),
    suggested_fix: nullIfBlank(r.resolution_suggestion),
    notes: nullIfBlank(r.notes),
    priority: nullIfBlank(r.priority),
    legacy_status: nullIfBlank(r.status),
    is_completed: r.completed === true,
    reopened: r.reopened === true,
    reopen_reason: nullIfBlank(r.reopen_reason),
    rejection_reason: nullIfBlank(r.rejection_reason),
    legacy_assigned_to: assignedToName(r.assigned_to, ctx),
    photo_url: nullIfBlank(r.image_url),
    completed_photo_url: nullIfBlank(r.completed_image_url),
    reporter_name: nullIfBlank(r.reporter),
    reporter_profile_id: matchReporter(r.email_id, ctx),
    requested_at: reportedAt(r),
    requested_at_is_bulk_load: isBulkLoaded(r),
    completed_at: isoOrNull(r.date_completed),
    legacy_created_at: isoOrNull(r.created_at),
    legacy_updated_at: isoOrNull(r.updated_at),
    admin_notes: notesFor(ctx.notesByRequirement.get(r.id)),
    updated_at: ctx.now.toISOString(),
  };
}

export type IssueRow = ReturnType<typeof buildIssueRow>;

// ── The Campus Walk task for an open row ───────────────────────────────────

export const IMPORTED_FROM = 'old-instasolver';

/**
 * Director ruling, 1 Oct 2026: the old reporter has LEFT JKKN when no MyJKKN
 * profile matched their email, or the matched profile is inactive or
 * login-disabled. Their job is still created (normal routing for its college
 * and place), but with no reporter — so nobody is told it was fixed.
 */
export function reporterHasLeft(
  row: Pick<IssueRow, 'reporter_profile_id'>,
  leftProfileIds: ReadonlySet<string>
): boolean {
  return !row.reporter_profile_id || leftProfileIds.has(row.reporter_profile_id);
}

/**
 * The CreateWalkTaskInput for one OPEN old record.
 *
 * isUnsafe is ALWAYS false, whatever the old severity said. 1,733 of the 2,021
 * old rows are 'High' or 'Critical'; isUnsafe:true makes the service page a
 * phone and set a same-day due date, so honouring the old label would ring
 * phones for every imported job at once. The old severity is kept in the
 * metadata and in the history table instead.
 *
 * No photo is passed as a storage path: the old photo lives on the OLD site's
 * storage, not in the private campus-walk bucket, and the fix screen and the
 * photo-retention cron both treat photo_storage_path as a path in that bucket.
 * The old URL goes in the description and in metadata.legacy_photo_url.
 *
 * reporterLeft (ruling 1 Oct 2026, see reporterHasLeft): no reporter_id and no
 * raised-by person, so the 'fixed' message goes to nobody; the task carries
 * only the non-personal flag metadata.reporter_left = true.
 */
export function buildWalkTaskInput(row: IssueRow, reporterLeft: boolean): CreateWalkTaskInput {
  const reporterId = reporterLeft ? null : row.reporter_profile_id;
  const details = collapse(row.details) || 'Old InstaSolver report (no details recorded)';
  const prefix = row.needs_still_broken_check ? STILL_BROKEN_PREFIX : '';
  const room = 160 - prefix.length;
  const body = details.length > room ? `${details.slice(0, room - 3).trimEnd()}...` : details;
  const place = [row.clean_site, row.clean_area].filter((p) => p && p !== 'Unspecified').join(' — ');

  const raisedOn = row.reported_at ? row.reported_at.slice(0, 10) : 'an unknown date';
  const lines = [
    row.details ?? '',
    row.cause ? `Cause (as reported): ${row.cause}` : '',
    row.suggested_fix ? `Suggested fix (as reported): ${row.suggested_fix}` : '',
    row.legacy_location ? `Where (as reported): ${row.legacy_location}` : '',
    row.photo_url ? `Photo on the old site: ${row.photo_url}` : '',
    `From old InstaSolver #${row.legacy_id}, raised ${raisedOn}${row.reported_at_is_bulk_load ? ' (bulk-loaded; real report date unknown)' : ''}.`,
    row.needs_still_broken_check ? 'Older than a year — check it is still broken before fixing.' : '',
  ].filter(Boolean);

  return {
    title: `${prefix}${body}`,
    description: lines.join('\n'),
    kind: 'symptom',
    isUnsafe: false,
    category: row.clean_category ?? undefined,
    institutionId: row.institution_id,
    raisedByProfileId: reporterId,
    extraMetadata: {
      front_door: 'instasolver',
      imported_from: IMPORTED_FROM,
      legacy_instasolver_id: row.legacy_id,
      ...(reporterId ? { reporter_id: reporterId } : { reporter_left: true }),
      location: place || row.legacy_location || null,
      legacy_severity: row.severity,
      legacy_reported_at: row.reported_at,
      legacy_photo_url: row.photo_url,
      needs_still_broken_check: row.needs_still_broken_check,
    },
  };
}

// ── Command line ───────────────────────────────────────────────────────────

export interface ImportArgs {
  exportDir: string | null;
  apply: boolean;
}

export function parseArgs(argv: string[]): ImportArgs {
  let exportDir: string | null = null;
  let apply = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--export-dir') exportDir = argv[++i] ?? null;
    else if (a.startsWith('--export-dir=')) exportDir = a.slice('--export-dir='.length);
    else if (a === '--apply') apply = true;
    else if (a === '--dry-run') apply = false;
  }
  return { exportDir, apply };
}

export const APPLY_CONFIRM_ENV = 'INSTASOLVER_IMPORT_CONFIRM';

/**
 * --apply writes to the live database and creates real tasks, so it needs a
 * second, deliberate signal. Throws with the reason; returns when allowed.
 */
export function assertApplyAllowed(args: ImportArgs, env: Record<string, string | undefined>): void {
  if (!args.apply) return;
  if (env[APPLY_CONFIRM_ENV] !== 'yes') {
    throw new Error(
      `--apply refused: set ${APPLY_CONFIRM_ENV}=yes to confirm you mean to write to the database.`
    );
  }
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('--apply refused: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  }
}
