export const dynamic = 'force-dynamic';

// app/api/resource-management/resources/import/route.ts
//
// Bulk-import resources from an Excel template.
//
// Contract:
//   POST multipart/form-data with `file` = .xlsx generated from
//   download-resource-template.tsx. Sheet name must be "Resources".
//
// Returns:
//   200 with ImportResult on partial OR full success.
//   400 when zero rows passed validation.
//   401 when caller is not authenticated.
//   500 on unexpected server errors.
//
// Validation strategy: per-row Zod first, then cascading FK resolution
// (institution → department, parent_category → subcategory). Rows that fail
// at any stage are reported with row numbers; the rest are batch-inserted.

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse, connection } from 'next/server';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { generateResourceCode } from '@/lib/utils/resource-id-generator';
import {
  RESOURCE_STATUS,
  BOOKING_TYPE
} from '@/types/resource-management';

// ============================================================================
// CONSTANTS
// ============================================================================

const SHEET_NAME = 'Resources';

/** Column index → header name. Must match download-resource-template.tsx. */
const COLUMN_INDEX = {
  name: 1,
  description: 2,
  parent_category_name: 3,
  subcategory_name: 4,
  institution_name: 5,
  department_name: 6,
  status: 7,
  booking_type: 8,
  initial_stock_quantity: 9,
  building_number: 10,
  block_number: 11,
  floor_number: 12,
  room_number: 13,
  location_notes: 14,
  vendor_name: 15,
  vendor_email: 16,
  vendor_mobile: 17,
  vendor_address_line1: 18,
  vendor_city: 19,
  vendor_state: 20,
  vendor_zip: 21,
  purchase_date: 22,
  warranty_expiry_date: 23
} as const;

const VALID_STATUSES = [
  RESOURCE_STATUS.AVAILABLE,
  RESOURCE_STATUS.OCCUPIED,
  RESOURCE_STATUS.MAINTENANCE,
  RESOURCE_STATUS.OUT_OF_ORDER,
  RESOURCE_STATUS.RETIRED
] as const;

const VALID_BOOKING_TYPES = [
  BOOKING_TYPE.RESERVATION,
  BOOKING_TYPE.WALK_IN,
  BOOKING_TYPE.BOTH
] as const;

// ============================================================================
// TYPES
// ============================================================================

interface ImportError {
  row: number;
  field?: string;
  message: string;
}

interface ImportResult {
  success: boolean;
  successCount: number;
  errorCount: number;
  totalRows: number;
  errors: ImportError[];
}

const resourceRowSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name must be at most 200 characters'),
  description: z.string().optional(),
  parent_category_name: z.string().min(1, 'Parent category is required'),
  subcategory_name: z.string().optional(),
  institution_name: z.string().min(1, 'Institution is required'),
  department_name: z.string().optional(),
  status: z.enum(VALID_STATUSES as unknown as [string, ...string[]]),
  booking_type: z.enum(VALID_BOOKING_TYPES as unknown as [string, ...string[]]),
  initial_stock_quantity: z.number().int().min(0).optional(),
  building_number: z.string().max(50, 'Building number must be at most 50 characters').optional(),
  block_number: z.string().max(50, 'Block number must be at most 50 characters').optional(),
  floor_number: z.string().max(100, 'Floor number must be at most 100 characters').optional(),
  room_number: z.string().max(50, 'Room number must be at most 50 characters').optional(),
  location_notes: z.string().optional(),
  vendor_name: z.string().max(200, 'Vendor name must be at most 200 characters').optional(),
  vendor_email: z
    .string()
    .max(100, 'Vendor email must be at most 100 characters')
    .email('Vendor email must be a valid email')
    .optional()
    .or(z.literal('')),
  vendor_mobile: z.string().max(30, 'Vendor mobile must be at most 30 characters').optional(),
  vendor_address_line1: z.string().max(255).optional(),
  vendor_city: z.string().max(100).optional(),
  vendor_state: z.string().max(100).optional(),
  vendor_zip: z.string().max(20, 'Vendor zip must be at most 20 characters').optional(),
  purchase_date: z.string().optional(),
  warranty_expiry_date: z.string().optional()
});

type ResourceRow = z.infer<typeof resourceRowSchema>;

// ============================================================================
// HELPERS
// ============================================================================

/** Read a cell value as a trimmed string (ExcelJS cell wrapper handling). */
function readCellAsString(cell: ExcelJS.Cell | undefined): string {
  if (!cell) return '';
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) {
    // Excel date → ISO yyyy-mm-dd
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // ExcelJS sometimes returns { text, hyperlink } or { result } for formulas
  const anyV = v as any;
  if (typeof anyV === 'object') {
    if (typeof anyV.text === 'string') return anyV.text.trim();
    if (anyV.result !== undefined) return String(anyV.result).trim();
  }
  return String(v).trim();
}

/** Parse a positive integer from a cell. Returns undefined when blank/invalid. */
function readCellAsInt(cell: ExcelJS.Cell | undefined): number | undefined {
  const raw = readCellAsString(cell);
  if (!raw) return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Empty string → undefined (so optional fields don't trip Zod min checks). */
function emptyToUndefined(s: string): string | undefined {
  return s === '' ? undefined : s;
}

/** Build a row object from an ExcelJS row. */
function parseRow(row: ExcelJS.Row, rowNumber: number): {
  data: Partial<ResourceRow> | null;
  errors: ImportError[];
} {
  const errors: ImportError[] = [];

  try {
    const name = readCellAsString(row.getCell(COLUMN_INDEX.name));
    const parentCategoryName = readCellAsString(
      row.getCell(COLUMN_INDEX.parent_category_name)
    );
    const institutionName = readCellAsString(
      row.getCell(COLUMN_INDEX.institution_name)
    );

    // Skip entirely blank rows
    if (!name && !parentCategoryName && !institutionName) {
      return { data: null, errors: [] };
    }

    const data: Partial<ResourceRow> = {
      name,
      description: emptyToUndefined(
        readCellAsString(row.getCell(COLUMN_INDEX.description))
      ),
      parent_category_name: parentCategoryName,
      subcategory_name: emptyToUndefined(
        readCellAsString(row.getCell(COLUMN_INDEX.subcategory_name))
      ),
      institution_name: institutionName,
      department_name: emptyToUndefined(
        readCellAsString(row.getCell(COLUMN_INDEX.department_name))
      ),
      status: emptyToUndefined(
        readCellAsString(row.getCell(COLUMN_INDEX.status)).toLowerCase()
      ) as ResourceRow['status'],
      booking_type: emptyToUndefined(
        readCellAsString(row.getCell(COLUMN_INDEX.booking_type)).toLowerCase()
      ) as ResourceRow['booking_type'],
      initial_stock_quantity: readCellAsInt(
        row.getCell(COLUMN_INDEX.initial_stock_quantity)
      ),
      building_number: emptyToUndefined(
        readCellAsString(row.getCell(COLUMN_INDEX.building_number))
      ),
      block_number: emptyToUndefined(
        readCellAsString(row.getCell(COLUMN_INDEX.block_number))
      ),
      floor_number: emptyToUndefined(
        readCellAsString(row.getCell(COLUMN_INDEX.floor_number))
      ),
      room_number: emptyToUndefined(
        readCellAsString(row.getCell(COLUMN_INDEX.room_number))
      ),
      location_notes: emptyToUndefined(
        readCellAsString(row.getCell(COLUMN_INDEX.location_notes))
      ),
      vendor_name: emptyToUndefined(
        readCellAsString(row.getCell(COLUMN_INDEX.vendor_name))
      ),
      vendor_email: emptyToUndefined(
        readCellAsString(row.getCell(COLUMN_INDEX.vendor_email))
      ),
      vendor_mobile: emptyToUndefined(
        readCellAsString(row.getCell(COLUMN_INDEX.vendor_mobile))
      ),
      vendor_address_line1: emptyToUndefined(
        readCellAsString(row.getCell(COLUMN_INDEX.vendor_address_line1))
      ),
      vendor_city: emptyToUndefined(
        readCellAsString(row.getCell(COLUMN_INDEX.vendor_city))
      ),
      vendor_state: emptyToUndefined(
        readCellAsString(row.getCell(COLUMN_INDEX.vendor_state))
      ),
      vendor_zip: emptyToUndefined(
        readCellAsString(row.getCell(COLUMN_INDEX.vendor_zip))
      ),
      purchase_date: emptyToUndefined(
        readCellAsString(row.getCell(COLUMN_INDEX.purchase_date))
      ),
      warranty_expiry_date: emptyToUndefined(
        readCellAsString(row.getCell(COLUMN_INDEX.warranty_expiry_date))
      )
    };

    return { data, errors };
  } catch (err) {
    errors.push({
      row: rowNumber,
      message: `Failed to parse row: ${
        err instanceof Error ? err.message : 'Unknown error'
      }`
    });
    return { data: null, errors };
  }
}

/** Run Zod validation. */
function validateRow(
  data: Partial<ResourceRow>,
  rowNumber: number
): { ok: true; data: ResourceRow } | { ok: false; errors: ImportError[] } {
  const result = resourceRowSchema.safeParse(data);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  const errors: ImportError[] = result.error.errors.map((e) => ({
    row: rowNumber,
    field: e.path.join('.'),
    message: `Row ${rowNumber}: ${e.path.join('.')} — ${e.message}`
  }));
  return { ok: false, errors };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  await connection();
  try {
    // ── Auth ─────────────────────────────────────────────────────────────
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (name: string) => cookieStore.get(name)?.value,
          set: (name: string, value: string, options: any) =>
            cookieStore.set(name, value, options),
          remove: (name: string, options: any) =>
            cookieStore.set(name, '', { ...options, maxAge: 0 })
        }
      }
    );

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── File ─────────────────────────────────────────────────────────────
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (
      !file.name.toLowerCase().endsWith('.xlsx') &&
      !file.name.toLowerCase().endsWith('.xls')
    ) {
      return NextResponse.json(
        { error: 'Invalid file type. Upload a .xlsx or .xls file.' },
        { status: 400 }
      );
    }

    // ── Read workbook ────────────────────────────────────────────────────
    const buf = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buf);
    const worksheet = workbook.getWorksheet(SHEET_NAME);
    if (!worksheet) {
      return NextResponse.json(
        {
          error: `Invalid template. Missing "${SHEET_NAME}" sheet. Use the download template button to get the correct format.`
        },
        { status: 400 }
      );
    }

    // ── Parse + Zod validate per row ─────────────────────────────────────
    const validRows: { row: number; data: ResourceRow }[] = [];
    const allErrors: ImportError[] = [];
    let totalRows = 0;

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // header row
      totalRows++;

      const { data, errors } = parseRow(row, rowNumber);
      if (errors.length > 0) {
        allErrors.push(...errors);
        return;
      }
      if (!data) {
        // Empty row — don't count toward totals.
        totalRows--;
        return;
      }

      const result = validateRow(data, rowNumber);
      if (!result.ok) {
        allErrors.push(...result.errors);
        return;
      }
      validRows.push({ row: rowNumber, data: result.data });
    });

    if (validRows.length === 0) {
      return NextResponse.json<ImportResult>(
        {
          success: false,
          successCount: 0,
          errorCount: allErrors.length,
          totalRows,
          errors: allErrors
        },
        { status: 400 }
      );
    }

    // ── Resolve institution / department / parent category / subcategory ──
    const uniqueInstitutionNames = [
      ...new Set(validRows.map((r) => r.data.institution_name))
    ];
    const uniqueDepartmentNames = [
      ...new Set(
        validRows.map((r) => r.data.department_name).filter(Boolean) as string[]
      )
    ];
    const uniqueParentCategoryNames = [
      ...new Set(validRows.map((r) => r.data.parent_category_name))
    ];
    const uniqueSubcategoryNames = [
      ...new Set(
        validRows.map((r) => r.data.subcategory_name).filter(Boolean) as string[]
      )
    ];

    const [
      { data: institutions, error: instErr },
      { data: departments, error: deptErr },
      { data: parents, error: parentErr },
      { data: subs, error: subErr }
    ] = await Promise.all([
      supabase
        .from('institutions')
        .select('id, name')
        .in('name', uniqueInstitutionNames),
      uniqueDepartmentNames.length
        ? supabase
            .from('departments')
            .select('id, department_name, institution_id')
            .in('department_name', uniqueDepartmentNames)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('resource_parent_categories')
        .select('id, name')
        .in('name', uniqueParentCategoryNames),
      uniqueSubcategoryNames.length
        ? supabase
            .from('resource_sub_categories')
            .select('id, name, parent_category_id')
            .in('name', uniqueSubcategoryNames)
        : Promise.resolve({ data: [], error: null })
    ]);

    if (instErr || deptErr || parentErr || subErr) {
      console.error('[resources/import] FK lookup failed:', {
        instErr,
        deptErr,
        parentErr,
        subErr
      });
      return NextResponse.json(
        {
          error: 'Failed to resolve foreign keys',
          message:
            instErr?.message ||
            deptErr?.message ||
            parentErr?.message ||
            subErr?.message
        },
        { status: 500 }
      );
    }

    const institutionByName = new Map(
      (institutions ?? []).map((i: any) => [i.name, i])
    );
    // Composite key: `${institution_id}::${department_name}` so we can enforce
    // that the named department actually belongs to the named institution.
    const departmentByCompositeKey = new Map(
      (departments ?? []).map((d: any) => [
        `${d.institution_id}::${d.department_name}`,
        d
      ])
    );
    const parentByName = new Map(
      (parents ?? []).map((p: any) => [p.name, p])
    );
    // Composite key: `${parent_category_id}::${subcategory_name}` so the
    // subcategory must belong to the named parent.
    const subByCompositeKey = new Map(
      (subs ?? []).map((s: any) => [
        `${s.parent_category_id}::${s.name}`,
        s
      ])
    );

    // ── Resolve FK references row-by-row ─────────────────────────────────
    type ResolvedRow = ResourceRow & {
      institution_id: string;
      department_id: string | null;
      parent_category_id: string;
      subcategory_id: string | null;
    };
    const resolvedRows: { row: number; data: ResolvedRow }[] = [];

    for (const { row, data } of validRows) {
      const institution = institutionByName.get(data.institution_name) as any;
      if (!institution) {
        allErrors.push({
          row,
          field: 'institution_name',
          message: `Row ${row}: Institution "${data.institution_name}" not found`
        });
        continue;
      }

      let departmentId: string | null = null;
      if (data.department_name) {
        const dept = departmentByCompositeKey.get(
          `${institution.id}::${data.department_name}`
        ) as any;
        if (!dept) {
          allErrors.push({
            row,
            field: 'department_name',
            message: `Row ${row}: Department "${data.department_name}" not found in institution "${data.institution_name}"`
          });
          continue;
        }
        departmentId = dept.id;
      }

      const parentCategory = parentByName.get(data.parent_category_name) as any;
      if (!parentCategory) {
        allErrors.push({
          row,
          field: 'parent_category_name',
          message: `Row ${row}: Parent category "${data.parent_category_name}" not found`
        });
        continue;
      }

      let subcategoryId: string | null = null;
      if (data.subcategory_name) {
        const sub = subByCompositeKey.get(
          `${parentCategory.id}::${data.subcategory_name}`
        ) as any;
        if (!sub) {
          allErrors.push({
            row,
            field: 'subcategory_name',
            message: `Row ${row}: Subcategory "${data.subcategory_name}" not found under parent "${data.parent_category_name}"`
          });
          continue;
        }
        subcategoryId = sub.id;
      }

      resolvedRows.push({
        row,
        data: {
          ...data,
          institution_id: institution.id,
          department_id: departmentId,
          parent_category_id: parentCategory.id,
          subcategory_id: subcategoryId
        }
      });
    }

    if (resolvedRows.length === 0) {
      return NextResponse.json<ImportResult>(
        {
          success: false,
          successCount: 0,
          errorCount: allErrors.length,
          totalRows,
          errors: allErrors
        },
        { status: 400 }
      );
    }

    // ── Generate resource_code per row + check for in-file duplicates ────
    //
    // resource_code is globally unique, and its `RES-<CAT>-<INST>-` prefix is
    // derived from a 3-char + 4-char alpha truncation of the names. Multiple
    // distinct institutions collapse to the same 4-char institution code (the
    // 11 JKKN-family colleges all compress to "JKKN"). So we must key the
    // counter on the resolved PREFIX string — not on (category_id, institution_id)
    // — and seed it from the MAX existing suffix across the whole prefix
    // family (handles cross-institution collisions AND gaps left by deletes).
    const parentIdToName = new Map(
      (parents ?? []).map((p: any) => [p.id, p.name])
    );
    const institutionIdToName = new Map(
      (institutions ?? []).map((i: any) => [i.id, i.name])
    );

    const buildPrefix = (parentId: string, instId: string): string => {
      const catName = parentIdToName.get(parentId) ?? '';
      const instName = institutionIdToName.get(instId) ?? '';
      const categoryCode = catName
        .replace(/[^a-zA-Z]/g, '')
        .substring(0, 3)
        .toUpperCase()
        .padEnd(3, 'X');
      const institutionCode = instName
        .replace(/[^a-zA-Z]/g, '')
        .substring(0, 4)
        .toUpperCase()
        .padEnd(4, 'X');
      return `RES-${categoryCode}-${institutionCode}-`;
    };

    // Counter keyed by the resolved RES-<CAT>-<INST>- prefix.
    const codeCounters = new Map<string, number>();
    const uniquePrefixes = new Set(
      resolvedRows.map((r) =>
        buildPrefix(r.data.parent_category_id, r.data.institution_id)
      )
    );

    // For each unique prefix, query the MAX existing numeric suffix.
    await Promise.all(
      [...uniquePrefixes].map(async (prefix) => {
        const { data: existing } = await (supabase as any)
          .from('resources')
          .select('resource_code')
          .like('resource_code', `${prefix}%`);
        let maxSuffix = 0;
        for (const row of (existing ?? []) as { resource_code: string }[]) {
          const suffixStr = row.resource_code.substring(prefix.length);
          const suffix = parseInt(suffixStr, 10);
          if (Number.isFinite(suffix) && suffix > maxSuffix) {
            maxSuffix = suffix;
          }
        }
        codeCounters.set(prefix, maxSuffix);
      })
    );

    const insertPayload = resolvedRows.map(({ data }) => {
      const prefix = buildPrefix(
        data.parent_category_id,
        data.institution_id
      );
      const current = codeCounters.get(prefix) ?? 0;
      codeCounters.set(prefix, current + 1);

      const resourceCode = generateResourceCode(
        parentIdToName.get(data.parent_category_id) ?? data.parent_category_name,
        institutionIdToName.get(data.institution_id) ?? data.institution_name,
        current
      );

      const initialStock = data.initial_stock_quantity ?? 1;

      return {
        name: data.name.trim(),
        description: data.description ?? null,
        resource_code: resourceCode,
        parent_category_id: data.parent_category_id,
        subcategory_id: data.subcategory_id,
        institution_id: data.institution_id,
        department_id: data.department_id,
        status: data.status,
        booking_type: data.booking_type,
        initial_stock_quantity: initialStock,
        current_stock_quantity: initialStock,
        building_number: data.building_number ?? null,
        block_number: data.block_number ?? null,
        floor_number: data.floor_number ?? null,
        room_number: data.room_number ?? null,
        location_notes: data.location_notes ?? null,
        vendor_name: data.vendor_name ?? null,
        vendor_email: data.vendor_email || null,
        vendor_mobile: data.vendor_mobile ?? null,
        vendor_address_line1: data.vendor_address_line1 ?? null,
        vendor_city: data.vendor_city ?? null,
        vendor_state: data.vendor_state ?? null,
        vendor_zip: data.vendor_zip ?? null,
        purchase_date: data.purchase_date || null,
        warranty_expiry_date: data.warranty_expiry_date || null,
        approval_config: {},
        booking_config: {},
        reminder_config: {},
        caretaker_user_ids: [],
        access_roles: [],
        custom_attributes: {},
        created_by: user.id,
        updated_by: user.id
      };
    });

    // ── Batch insert ─────────────────────────────────────────────────────
    const { data: inserted, error: insertError } = await supabase
      .from('resources')
      .insert(insertPayload)
      .select('id');

    if (insertError) {
      console.error('[resources/import] Insert failed:', insertError);
      return NextResponse.json(
        { error: 'Failed to insert resources', message: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json<ImportResult>(
      {
        success: true,
        successCount: inserted?.length ?? 0,
        errorCount: allErrors.length,
        totalRows,
        errors: allErrors
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('[resources/import] Unexpected error:', err);
    return NextResponse.json(
      {
        error: 'Failed to import resources',
        message: err instanceof Error ? err.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
