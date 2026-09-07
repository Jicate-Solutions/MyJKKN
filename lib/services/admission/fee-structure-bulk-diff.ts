// lib/services/admission/fee-structure-bulk-diff.ts
//
// "What will actually change" for the bulk fee-structure preview.
//
// The row-by-row preview answers "will this row be accepted", which is a
// different question from "what does this file DO to my data". An operator
// re-uploading an edited export sees `12 update` and has no way to tell whether
// they changed one due date or wiped every fee off six structures — and the
// import is destructive by design: a fee whose row was deleted is REMOVED.
// This module reads the current state of every structure the sheet claims to
// update and reports the delta field by field, before anything is written.
//
// Comparison is by ID, display is by NAME. Those have to be different: a sheet
// may name an accommodation by its code ("dayscholar") where the database holds
// "Day Scholar", and comparing the two strings would report a change that is not
// one. The names shown come from the DB for the "before" side and from the
// operator's own cells (RowResolution.source) for the "after" side.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DUE_ANCHOR_LABELS,
  APPLIES_TO_LABELS,
  type BulkResolveLookups,
  type BulkUpsertPayload,
  type FeeAppliesTo,
  type ItemScheduleConfig,
  type RowResolution,
} from '@/lib/utils/mappings/fee-structure-excel-mappings';

export interface FieldChange {
  field: string;
  from: string;
  to: string;
}

export interface FeeChange {
  category: string;
  kind: 'added' | 'removed' | 'changed';
  /** Human description of the fee before / after. null on the side it is absent. */
  from: string | null;
  to: string | null;
}

export interface StructureChange {
  /** Sheet row this structure starts on — the same number the preview shows. */
  row: number;
  name: string;
  action: 'create' | 'update';
  structureId: string | null;
  /** The identity columns as typed, so a CREATE says what it is creating. */
  identity: Array<{ label: string; value: string }>;
  fields: FieldChange[];
  fees: FeeChange[];
  /** An update that matches the database in every compared field. */
  unchanged: boolean;
  /** An update naming a Fee Structure ID that is not there (or not visible). */
  missing: boolean;
}

/** Identity columns worth repeating on a create card, in reading order. */
const IDENTITY_COLUMNS = [
  'Institution',
  'Degree',
  'Department',
  'Programme',
  'Admission Year',
  'Quota',
  'Gender',
  'Accommodation',
  'Room Category',
  'Mess Category',
  'Communities',
] as const;

const money = (n: number): string => `₹${Number(n).toLocaleString('en-IN')}`;

const text = (v: unknown, blank = '—'): string => {
  const s = String(v ?? '').trim();
  return s === '' ? blank : s;
};

const sortedIds = (ids: readonly string[]): string => [...ids].sort().join(',');

/** "+15d", "on 2027-01-31", or '' when the row sets neither. */
function describeDue(offsetDays: number | null, dueDate: string | null): string {
  if (dueDate) return `on ${dueDate}`;
  if (offsetDays !== null && offsetDays !== undefined) return `+${offsetDays}d`;
  return '';
}

function describeLine(line: {
  sequence_no: number;
  share_percent: number | null;
  fixed_amount: number | null;
  due_offset_days: number | null;
  due_date: string | null;
  promotes_to_status_code: string | null;
}): string {
  const size =
    line.share_percent !== null && line.share_percent !== undefined
      ? `${line.share_percent}%`
      : line.fixed_amount !== null && line.fixed_amount !== undefined
        ? money(line.fixed_amount)
        : '?';
  const due = describeDue(line.due_offset_days ?? null, line.due_date ?? null);
  const promo = line.promotes_to_status_code ? ` → ${line.promotes_to_status_code}` : '';
  return `#${line.sequence_no} ${size}${due ? ` ${due}` : ''}${promo}`;
}

/** Which years bill this fee, as one short phrase. */
export interface AppliesConfig {
  appliesTo: FeeAppliesTo;
  year: number | null;
}

function describeApplies(applies: AppliesConfig | null): string {
  if (!applies) return APPLIES_TO_LABELS.every_year; // the column default
  return applies.appliesTo === 'specific_year'
    ? `Year ${applies.year} only`
    : APPLIES_TO_LABELS[applies.appliesTo];
}

/** One fee, as one line of text: amount, which years bill it, how it is split, and when it falls due. */
function describeFee(
  amount: number,
  plan: {
    schedule_mode: 'single' | 'split' | null;
    due_anchor?: string | null;
    due_offset_days: number | null;
    due_date: string | null;
    promotes_to_status_code: string | null;
    lines: Array<Parameters<typeof describeLine>[0]>;
  } | null,
  applies: AppliesConfig | null = null,
): string {
  // Applies-to sits right next to the money because that is what it scales: the
  // same 5,000 is 5,000 or 20,000 over a four-year programme depending on this
  // one word, and it is the field the sheet could not set until now.
  const head = `${money(amount)} · ${describeApplies(applies)}`;
  if (!plan) return `${head} · one payment`;

  if (plan.schedule_mode === 'split' && plan.lines.length > 0) {
    const parts = [...plan.lines]
      .sort((a, b) => a.sequence_no - b.sequence_no)
      .map(describeLine)
      .join(' · ');
    return `${head} · split ${plan.lines.length}× — ${parts}`;
  }

  const anchor =
    plan.due_anchor && plan.due_anchor in DUE_ANCHOR_LABELS
      ? DUE_ANCHOR_LABELS[plan.due_anchor as keyof typeof DUE_ANCHOR_LABELS]
      : null;
  const due = describeDue(plan.due_offset_days, plan.due_date);
  const promo = plan.promotes_to_status_code ? ` → ${plan.promotes_to_status_code}` : '';
  // The anchor is only meaningful next to an OFFSET; printing "Fixed Date"
  // beside a hard date says the same thing twice, and printing an anchor beside
  // nothing at all invites the reader to think a date was set.
  const anchorSuffix = due.startsWith('+') && anchor ? ` from ${anchor}` : '';
  return `${head} · one payment${due ? ` ${due}` : ''}${anchorSuffix}${promo}`;
}

/** Shape of one item as the database holds it. */
interface DbItem {
  billing_category_id: string;
  amount: number;
  applies_to: FeeAppliesTo | null;
  applies_year_of_study: number | null;
  schedule_mode: 'single' | 'split' | null;
  due_anchor: string | null;
  due_offset_days: number | null;
  due_date: string | null;
  promotes_to_status_code: string | null;
  billing_category: { category_name: string } | null;
  schedules: Array<{
    sequence_no: number;
    share_percent: number | null;
    fixed_amount: number | null;
    due_offset_days: number | null;
    due_date: string | null;
    promotes_to_status_code: string | null;
  }> | null;
}

/**
 * A comparable fingerprint of a fee. Built from the same describeFee() text the
 * operator reads, deliberately: if two fees render identically there is nothing
 * to show them, and a diff nobody can see is worse than no diff at all.
 */
const feeSignature = (
  amount: number,
  plan: Parameters<typeof describeFee>[1],
  applies: AppliesConfig | null,
): string => describeFee(amount, plan, applies);

function appliesFromDbItem(item: DbItem): AppliesConfig {
  const appliesTo = (item.applies_to ?? 'every_year') as FeeAppliesTo;
  return { appliesTo, year: appliesTo === 'specific_year' ? item.applies_year_of_study : null };
}

/**
 * What the sheet said about a fee's years, or null when it said nothing — a
 * blank cell or a workbook with no "Applies To" column at all. Null means the
 * stored value survives, so the caller substitutes it rather than showing the
 * default and reporting a change that will not happen.
 */
function appliesFromSheet(item: {
  applies_to?: FeeAppliesTo;
  applies_year_of_study?: number | null;
}): AppliesConfig | null {
  if (!item.applies_to) return null;
  return {
    appliesTo: item.applies_to,
    year: item.applies_to === 'specific_year' ? item.applies_year_of_study ?? null : null,
  };
}

function planFromDbItem(item: DbItem): Parameters<typeof describeFee>[1] {
  return {
    schedule_mode: item.schedule_mode ?? 'single',
    due_anchor: item.due_anchor,
    due_offset_days: item.due_offset_days,
    due_date: item.due_date,
    promotes_to_status_code: item.promotes_to_status_code,
    lines: item.schedules ?? [],
  };
}

function planFromSheet(config: ItemScheduleConfig | undefined): Parameters<typeof describeFee>[1] {
  if (!config) return null;
  return {
    schedule_mode: config.schedule_mode,
    // OMITTED means "the sheet did not say, keep what is stored". Rendering a
    // default here would show every unsplit fee as changing its anchor.
    due_anchor: config.due_anchor ?? null,
    due_offset_days: config.due_offset_days,
    due_date: config.due_date,
    promotes_to_status_code: config.promotes_to_status_code,
    lines: config.lines,
  };
}

/** billing_category_id → the category name as the catalog spells it. */
function categoryNamesById(lookups: BulkResolveLookups): Map<string, string> {
  const map = new Map<string, string>();
  for (const header of lookups.amountHeaders) {
    const id = lookups.categoriesByName.get(header.toLowerCase());
    if (id) map.set(id, header);
  }
  return map;
}

/**
 * Reads the current state of every structure the sheet updates and returns the
 * delta, one entry per structure, in sheet order.
 *
 * Only rows that RESOLVED cleanly are compared — a row with errors has no
 * payload, so there is nothing to diff, and the validation step already speaks
 * for it.
 */
export async function buildChangeSets(
  supabase: SupabaseClient,
  resolutions: readonly RowResolution[],
  lookups: BulkResolveLookups,
): Promise<StructureChange[]> {
  const catNames = categoryNamesById(lookups);
  const withPayload = resolutions.filter((r) => r.payload);
  const updateIds = withPayload
    .map((r) => r.payload!.structure_id)
    .filter((id): id is string => !!id);

  const current = new Map<string, any>();
  if (updateIds.length > 0) {
    // Left joins throughout: an `!inner` on any of these embeds would silently
    // drop a structure that has no communities or no items yet, and a missing
    // structure reads to the caller as "deleted", which it is not.
    const { data, error } = await supabase
      .from('admission_fee_structures')
      .select(`
        id, name, status, notes, effective_from, effective_to, gender, package_type,
        default_due_offset_days,
        accommodation_type_id, hostel_category_id, mess_category_id,
        accommodation:accommodation_types(name),
        hostel_category:hostel_categories(name),
        mess_category:mess_categories(name),
        communities:admission_fee_structure_communities(
          community_category_id, community_category:community_categories(name)
        ),
        items:admission_fee_structure_items(
          billing_category_id, amount, applies_to, applies_year_of_study,
          schedule_mode, due_anchor, due_offset_days,
          due_date, promotes_to_status_code,
          billing_category:billing_categories(category_name),
          schedules:admission_fee_structure_item_schedules(
            sequence_no, share_percent, fixed_amount, due_offset_days, due_date,
            promotes_to_status_code
          )
        )
      `)
      .in('id', updateIds);
    if (error) throw error;
    for (const row of (data ?? []) as any[]) current.set(row.id, row);
  }

  const changes: StructureChange[] = [];

  for (const res of withPayload) {
    const p = res.payload!;
    const src = res.source ?? {};
    const identity = IDENTITY_COLUMNS.filter((c) => text(src[c], '') !== '').map((c) => ({
      label: c,
      value: String(src[c]),
    }));

    // ABSENT (not empty) item_schedules means the workbook said nothing about
    // instalments — an old two-tab export with no "Fee Schedules" sheet — and
    // the RPC then PRESERVES every stored plan. Diffing the plan in that case
    // would report a split being flattened on every fee of every row, which is
    // the opposite of what apply does.
    const speaksForSchedules = p.item_schedules !== undefined;

    // ── CREATE ────────────────────────────────────────────────────────────
    if (!p.structure_id) {
      changes.push({
        row: res.rowNumber,
        name: p.name,
        action: 'create',
        structureId: null,
        identity,
        fields: [],
        fees: p.items.map((it) => {
          const category = catNames.get(it.billing_category_id) ?? 'Fee';
          return {
            category,
            kind: 'added' as const,
            from: null,
            to: describeFee(
              it.amount,
              speaksForSchedules
                ? planFromSheet(
                    (p.item_schedules ?? []).find(
                      (s) => s.billing_category_id === it.billing_category_id,
                    ),
                  )
                : null,
              // Nothing stored to inherit on a brand-new structure, so a blank
              // cell here really does land on the column default.
              appliesFromSheet(it),
            ),
          };
        }),
        unchanged: false,
        missing: false,
      });
      continue;
    }

    // ── UPDATE ────────────────────────────────────────────────────────────
    const db = current.get(p.structure_id);
    if (!db) {
      changes.push({
        row: res.rowNumber,
        name: p.name,
        action: 'update',
        structureId: p.structure_id,
        identity,
        fields: [],
        fees: [],
        unchanged: false,
        missing: true,
      });
      continue;
    }

    const fields: FieldChange[] = [];
    const push = (field: string, before: unknown, after: unknown, same: boolean) => {
      if (!same) fields.push({ field, from: text(before), to: text(after) });
    };

    push('Name', db.name, p.name, String(db.name ?? '') === p.name);
    push('Status', db.status, p.status, db.status === p.status);
    push(
      'Gender',
      db.gender ?? 'Any',
      p.gender ?? 'Any',
      (db.gender ?? null) === (p.gender ?? null),
    );
    push(
      'Accommodation',
      db.accommodation?.name ?? 'Any',
      text(src['Accommodation'], 'Any'),
      (db.accommodation_type_id ?? null) === (p.accommodation_type_id ?? null),
    );
    push(
      'Room Category',
      db.hostel_category?.name ?? 'None',
      text(src['Room Category'], 'None'),
      (db.hostel_category_id ?? null) === (p.hostel_category_id ?? null),
    );
    push(
      'Mess Category',
      db.mess_category?.name ?? 'None',
      text(src['Mess Category'], 'None'),
      (db.mess_category_id ?? null) === (p.mess_category_id ?? null),
    );

    const dbCommunityIds = ((db.communities ?? []) as any[]).map(
      (c) => c.community_category_id as string,
    );
    push(
      'Communities',
      ((db.communities ?? []) as any[])
        .map((c) => c.community_category?.name)
        .filter(Boolean)
        .sort()
        .join(', '),
      text(src['Communities']),
      sortedIds(dbCommunityIds) === sortedIds(p.community_category_ids),
    );

    push(
      'Effective From',
      db.effective_from,
      p.effective_from,
      (db.effective_from ?? null) === (p.effective_from ?? null),
    );
    push(
      'Effective To',
      db.effective_to,
      p.effective_to,
      (db.effective_to ?? null) === (p.effective_to ?? null),
    );
    push(
      'Notes',
      db.notes,
      p.notes,
      String(db.notes ?? '').trim() === String(p.notes ?? '').trim(),
    );

    // These two are three-state: an absent key means the column was not on the
    // sheet at all and the RPC preserves the stored value. Reporting "unchanged"
    // by simply not pushing a row is exactly right for that case.
    if (Object.prototype.hasOwnProperty.call(p, 'package_type')) {
      const label = (v: string | null | undefined) =>
        v === 'package' ? 'Package' : v === 'non_package' ? 'Non-Package' : 'Unclassified';
      push(
        'Package Type',
        label(db.package_type),
        label(p.package_type),
        (db.package_type ?? null) === (p.package_type ?? null),
      );
    }
    if (Object.prototype.hasOwnProperty.call(p, 'default_due_offset_days')) {
      push(
        'Default Due (Days)',
        db.default_due_offset_days,
        p.default_due_offset_days,
        (db.default_due_offset_days ?? null) === (p.default_due_offset_days ?? null),
      );
    }

    // ── Fees ──────────────────────────────────────────────────────────────
    const dbItems = new Map<string, DbItem>();
    for (const it of ((db.items ?? []) as DbItem[])) dbItems.set(it.billing_category_id, it);

    const sheetSchedules = new Map<string, ItemScheduleConfig>();
    for (const s of p.item_schedules ?? []) sheetSchedules.set(s.billing_category_id, s);

    const fees: FeeChange[] = [];
    const seen = new Set<string>();

    for (const it of p.items) {
      seen.add(it.billing_category_id);
      const category = catNames.get(it.billing_category_id) ?? 'Fee';
      const dbItem = dbItems.get(it.billing_category_id);
      // When the sheet does not speak for schedules, the fee's plan is whatever
      // is already stored — so describe the AFTER side with the stored plan and
      // let the amount be the only thing that can differ.
      const afterPlan = speaksForSchedules
        ? planFromSheet(sheetSchedules.get(it.billing_category_id))
        : dbItem
          ? planFromDbItem(dbItem)
          : null;
      // Blank "Applies To" on an EXISTING fee inherits what is stored; on a fee
      // this sheet is adding there is nothing to inherit, so it takes the
      // column default. Showing the default in the first case would report a
      // change the RPC is not going to make.
      const afterApplies =
        appliesFromSheet(it) ?? (dbItem ? appliesFromDbItem(dbItem) : null);
      const after = describeFee(it.amount, afterPlan, afterApplies);
      if (!dbItem) {
        fees.push({ category, kind: 'added', from: null, to: after });
        continue;
      }
      const before = feeSignature(dbItem.amount, planFromDbItem(dbItem), appliesFromDbItem(dbItem));
      if (before !== after) fees.push({ category, kind: 'changed', from: before, to: after });
    }

    // Anything the database has that the sheet no longer lists is DELETED on
    // apply. This is the single most destructive thing a bulk import does and
    // the row-by-row preview cannot show it at all — a deleted row leaves no row
    // behind to flag.
    for (const [catId, dbItem] of dbItems) {
      if (seen.has(catId)) continue;
      // A legacy workbook with no schedules tab sends no item_schedules key, but
      // it DOES send items, so an absent category there is still a removal.
      fees.push({
        category: dbItem.billing_category?.category_name ?? catNames.get(catId) ?? 'Fee',
        kind: 'removed',
        from: feeSignature(dbItem.amount, planFromDbItem(dbItem), appliesFromDbItem(dbItem)),
        to: null,
      });
    }

    changes.push({
      row: res.rowNumber,
      name: p.name,
      action: 'update',
      structureId: p.structure_id,
      identity,
      fields,
      fees,
      unchanged: fields.length === 0 && fees.length === 0,
      missing: false,
    });
  }

  return changes;
}

// ============================================================================
// CREATE rows that would duplicate a structure that already exists
// ============================================================================
// A blank Fee Structure ID means "create". Nothing on the sheet can tell the
// operator that the structure it describes was created by the LAST import of
// this same file, so the row asks for the same create again and the database's
// overlap trigger refuses it at Apply — per row, after everything else has been
// written, with advice to change a dimension. This predicts that refusal at
// Validate, and names the structure the row is really talking about.

/** What the Validate step says about the structure a CREATE row collides with. */
export interface DuplicateOfExisting {
  id: string;
  name: string;
  created_at: string | null;
}

/** The columns of a stored structure that make up the overlap trigger's key. */
export interface ExistingStructureKey {
  id: string;
  name: string;
  created_at: string | null;
  status: string;
  institution_id: string;
  degree_id: string;
  department_id: string;
  programme_id: string;
  quota_id: string;
  admission_year_id: string;
  accommodation_type_id: string | null;
  gender: string | null;
  communities: Array<{ community_category_id: string }> | null;
}

/**
 * Would inserting `p` trip _fee_structure_community_no_overlap against
 * `existing`? Mirrored column for column from that trigger so the Validate
 * step predicts exactly what Apply would hit: institution, degree, department,
 * programme, quota, admission year, accommodation type (null only equals
 * null), gender where either side is "Any" or both agree, and at least one
 * community in common. Hostel and mess categories are NOT in the trigger's
 * key, so two hostel structures differing only by room tier DO collide — and
 * this says so rather than pretending otherwise. Pure, so it is unit-tested.
 */
export function collidesWithExisting(p: BulkUpsertPayload, existing: ExistingStructureKey): boolean {
  if (existing.status === 'archived') return false;
  if (
    existing.institution_id !== p.institution_id ||
    existing.degree_id !== p.degree_id ||
    existing.department_id !== p.department_id ||
    existing.programme_id !== p.programme_id ||
    existing.quota_id !== p.quota_id ||
    existing.admission_year_id !== p.admission_year_id
  ) {
    return false;
  }
  if ((existing.accommodation_type_id ?? null) !== (p.accommodation_type_id ?? null)) return false;
  const genderAgrees = existing.gender == null || p.gender == null || existing.gender === p.gender;
  if (!genderAgrees) return false;
  const theirs = new Set((existing.communities ?? []).map((c) => c.community_category_id));
  return p.community_category_ids.some((id) => theirs.has(id));
}

/**
 * For every CREATE row (blank Fee Structure ID) on the sheet, the stored
 * structure it would duplicate, keyed by sheet row number. Reads every
 * non-archived structure of the institutions involved once and matches in
 * memory — a few dozen to a few hundred rows. Rows the sheet itself marks
 * archived are skipped, exactly as the trigger skips them.
 */
export async function findDuplicateCreates(
  supabase: SupabaseClient,
  resolutions: readonly RowResolution[],
): Promise<Map<number, DuplicateOfExisting>> {
  const out = new Map<number, DuplicateOfExisting>();
  const creates = resolutions.filter(
    (r) => r.payload && !r.payload.structure_id && r.payload.status !== 'archived',
  );
  if (creates.length === 0) return out;

  const institutionIds = [...new Set(creates.map((r) => r.payload!.institution_id))];
  // Left join on communities: a structure with none is never a collision, but
  // it must still come back rather than vanish from the comparison set.
  const { data, error } = await supabase
    .from('admission_fee_structures')
    .select(`
      id, name, created_at, status,
      institution_id, degree_id, department_id, programme_id, quota_id, admission_year_id,
      accommodation_type_id, gender,
      communities:admission_fee_structure_communities(community_category_id)
    `)
    .in('institution_id', institutionIds)
    .neq('status', 'archived');
  if (error) throw error;

  const existing = (data ?? []) as unknown as ExistingStructureKey[];
  for (const res of creates) {
    const hit = existing.find((e) => collidesWithExisting(res.payload!, e));
    if (hit) out.set(res.rowNumber, { id: hit.id, name: hit.name, created_at: hit.created_at });
  }
  return out;
}
