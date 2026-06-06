// lib/utils/mappings/fee-structure-excel-mappings.ts
//
// Pure module (NO DB access) for the fee-structure bulk Excel round-trip.
// The import route builds the `BulkResolveLookups` maps from the DB, then calls
// resolveRow() once per spreadsheet row to get a payload or a list of errors.

export const FEE_STRUCTURE_SHEET_NAME = 'Fee Structures';

// Fixed (non-amount) columns, left→right. Amount columns (one per active
// billing category, excluding transport/hostel) are appended dynamically by
// the template/export routes — their headers are the category names.
export const FIXED_HEADERS = [
  'Fee Structure ID',
  'Institution',
  'Degree',
  'Department',
  'Programme',
  'Admission Year',
  'Quota',
  'Gender',
  'Communities',
  'Name',
  'Status',
  'Effective From',
  'Effective To',
  'Notes',
] as const;

export interface BulkResolveLookups {
  institutions: Map<string, string>;        // name(lower) -> institution_id (accessible only)
  degrees: Map<string, string>;             // `${institutionId}::${degreeName(lower)}` -> id
  departments: Map<string, string>;         // `${institutionId}::${degreeId}::${deptName(lower)}` -> id
  programmes: Map<string, string>;          // `${departmentId}::${programmeName(lower)}` -> id
  admissionYears: Map<string, string>;      // `${programmeId}::${yearName(lower)}` -> id
  quotas: Map<string, string>;              // name(lower) -> id
  communities: Map<string, string>;         // name(lower) -> id
  categoriesByName: Map<string, string>;    // category_name(lower) -> billing_category_id
  amountHeaders: string[];                   // category names, in column order
}

export interface BulkUpsertPayload {
  structure_id: string | null;
  institution_id: string;
  degree_id: string;
  department_id: string;
  programme_id: string;
  admission_year_id: string;
  quota_id: string;
  gender: string | null;
  community_category_ids: string[];
  name: string;
  status: 'draft' | 'active' | 'archived';
  notes: string | null;
  effective_from: string | null;
  effective_to: string | null;
  items: Array<{ billing_category_id: string; amount: number; is_optional: boolean }>;
}

export interface RowResolution {
  rowNumber: number;
  name: string;
  payload?: BulkUpsertPayload;
  errors: string[];
}

const norm = (v: unknown): string => String(v ?? '').trim();
const lower = (v: unknown): string => norm(v).toLowerCase();

export function splitCommunities(cell: unknown): string[] {
  return norm(cell).split(',').map((s) => s.trim()).filter(Boolean);
}

/** Returns the number, null for blank, or NaN for non-numeric. */
export function parseAmountCell(cell: unknown): number | null {
  const s = norm(cell);
  if (s === '') return null;
  return Number(s.replace(/,/g, ''));
}

export function normalizeGender(cell: unknown): string | null | 'INVALID' {
  const s = norm(cell).toUpperCase();
  if (s === '' || s === 'ANY' || s === 'ANY GENDER') return null;
  if (s === 'MALE' || s === 'FEMALE') return s;
  return 'INVALID';
}

export function normalizeStatus(cell: unknown): 'draft' | 'active' | 'archived' | 'INVALID' {
  const s = lower(cell);
  if (s === '') return 'draft';
  if (s === 'draft' || s === 'active' || s === 'archived') return s;
  return 'INVALID';
}

/** yyyy-mm-dd string, null for blank, 'INVALID' otherwise. Accepts Date cells. */
export function parseDateCell(cell: unknown): string | null | 'INVALID' {
  if (cell instanceof Date && !isNaN(cell.getTime())) return cell.toISOString().slice(0, 10);
  const s = norm(cell);
  if (s === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'INVALID';
  return isNaN(new Date(s + 'T00:00:00Z').getTime()) ? 'INVALID' : s;
}

export function resolveRow(
  raw: Record<string, unknown>,
  rowNumber: number,
  lookups: BulkResolveLookups,
): RowResolution {
  const errors: string[] = [];
  const name = norm(raw['Name']);
  const structureId = norm(raw['Fee Structure ID']) || null;

  const instId = lookups.institutions.get(lower(raw['Institution']));
  if (!instId) errors.push(`Institution "${norm(raw['Institution'])}" not found or not accessible`);

  const degId = instId ? lookups.degrees.get(`${instId}::${lower(raw['Degree'])}`) : undefined;
  if (instId && !degId) errors.push(`Degree "${norm(raw['Degree'])}" not found in that institution`);

  const deptId = instId && degId
    ? lookups.departments.get(`${instId}::${degId}::${lower(raw['Department'])}`)
    : undefined;
  if (instId && degId && !deptId) errors.push(`Department "${norm(raw['Department'])}" not found`);

  const progId = deptId ? lookups.programmes.get(`${deptId}::${lower(raw['Programme'])}`) : undefined;
  if (deptId && !progId) errors.push(`Programme "${norm(raw['Programme'])}" not found`);

  const yearId = instId
    ? lookups.admissionYears.get(`${instId}::${lower(raw['Admission Year'])}`)
    : undefined;
  if (instId && !yearId) errors.push(`Admission Year "${norm(raw['Admission Year'])}" not found for that institution`);

  const quotaId = lookups.quotas.get(lower(raw['Quota']));
  if (!quotaId) errors.push(`Quota "${norm(raw['Quota'])}" not found`);

  const gender = normalizeGender(raw['Gender']);
  if (gender === 'INVALID') errors.push('Gender must be Male, Female, or blank');

  const status = normalizeStatus(raw['Status']);
  if (status === 'INVALID') errors.push('Status must be draft, active, or archived');

  const communityNames = splitCommunities(raw['Communities']);
  const communityIds: string[] = [];
  for (const cn of communityNames) {
    const cid = lookups.communities.get(cn.toLowerCase());
    if (cid) communityIds.push(cid);
    else errors.push(`Community "${cn}" not found`);
  }
  if (communityNames.length === 0) errors.push('At least one community is required');

  const effFrom = parseDateCell(raw['Effective From']);
  const effTo = parseDateCell(raw['Effective To']);
  if (effFrom === 'INVALID') errors.push('Effective From must be yyyy-mm-dd');
  if (effTo === 'INVALID') errors.push('Effective To must be yyyy-mm-dd');
  if (typeof effFrom === 'string' && typeof effTo === 'string' && effTo < effFrom) {
    errors.push('Effective To must be on/after Effective From');
  }

  if (name.length < 2) errors.push('Name must be at least 2 characters');

  const items: BulkUpsertPayload['items'] = [];
  for (const header of lookups.amountHeaders) {
    const parsed = parseAmountCell(raw[header]);
    if (parsed === null) continue; // blank = not included
    if (Number.isNaN(parsed) || parsed < 0) { errors.push(`"${header}" must be a number ≥ 0`); continue; }
    const catId = lookups.categoriesByName.get(header.toLowerCase());
    if (!catId) { errors.push(`Fee category "${header}" not found`); continue; }
    items.push({ billing_category_id: catId, amount: parsed, is_optional: false });
  }
  if (items.length === 0) errors.push('At least one fee amount is required');

  if (errors.length > 0) return { rowNumber, name, errors };

  return {
    rowNumber, name, errors: [],
    payload: {
      structure_id: structureId,
      institution_id: instId!, degree_id: degId!, department_id: deptId!,
      programme_id: progId!, admission_year_id: yearId!, quota_id: quotaId!,
      gender: gender as string | null,
      community_category_ids: communityIds,
      name,
      status: status as 'draft' | 'active' | 'archived',
      notes: norm(raw['Notes']) || null,
      effective_from: (effFrom as string | null) ?? null,
      effective_to: (effTo as string | null) ?? null,
      items,
    },
  };
}
