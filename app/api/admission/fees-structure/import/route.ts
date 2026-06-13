export const dynamic = 'force-dynamic';
// app/api/admission/fees-structure/import/route.ts
//
// Two-phase bulk endpoint shared by the Bulk Import / Export-for-Edit flow:
//   mode=validate (dry-run) — resolve + validate every row, return a per-row
//     preview, write NOTHING. Drives the dialog's Preview step.
//   mode=apply               — re-resolve every row; if ANY row has a
//     spreadsheet-level error the whole batch is REJECTED (422) and nothing is
//     written ("block until all clear"). Only when all rows are clean do we
//     commit; RPC-level failures (e.g. duplicate dimension combos) are still
//     reported per-row.
import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import * as XLSX from 'xlsx';
import {
  FEE_STRUCTURE_SHEET_NAME,
  resolveRow,
  type RowResolution,
} from '@/lib/utils/mappings/fee-structure-excel-mappings';
import { loadBulkResolveLookups } from '@/lib/services/admission/fee-structure-bulk-lookups';

type PreviewAction = 'create' | 'update' | 'error';

interface PreviewRow {
  row: number;
  name: string;
  action: PreviewAction;
  errors: string[];
}

function buildPreview(resolutions: RowResolution[]) {
  const rows: PreviewRow[] = resolutions.map((r) => ({
    row: r.rowNumber,
    name: r.name,
    action: r.errors.length > 0 ? 'error' : r.payload!.structure_id ? 'update' : 'create',
    errors: r.errors,
  }));
  const errorRows = rows.filter((r) => r.action === 'error').length;
  const toCreate = rows.filter((r) => r.action === 'create').length;
  const toUpdate = rows.filter((r) => r.action === 'update').length;
  return {
    summary: { total: rows.length, toCreate, toUpdate, errorRows, valid: rows.length - errorRows },
    rows,
    canApply: rows.length > 0 && errorRows === 0,
  };
}

export async function POST(req: NextRequest) {
  await connection();
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (n: string) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    const mode = String(form.get('mode') ?? 'apply') === 'validate' ? 'validate' : 'apply';

    // cellDates:true → Excel date cells arrive as JS Date objects instead of
    // numeric serials. Without it, any date the user (or Excel) saved as a real
    // date came through as e.g. 46184 and every row failed the date check.
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    // Pick the data sheet BY NAME (not SheetNames[0] — Instructions may be first).
    const ws = wb.Sheets[FEE_STRUCTURE_SHEET_NAME];
    if (!ws) return NextResponse.json({ error: `Sheet "${FEE_STRUCTURE_SHEET_NAME}" not found` }, { status: 400 });
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

    const lookups = await loadBulkResolveLookups(supabase);

    // Resolve every non-blank row up front (no DB writes yet).
    const resolutions: RowResolution[] = [];
    for (let i = 0; i < rawRows.length; i++) {
      const raw = rawRows[i];
      if (Object.values(raw).every((v) => String(v ?? '').trim() === '')) continue; // skip blank rows
      resolutions.push(resolveRow(raw, i + 2, lookups)); // header = row 1
    }

    if (resolutions.length === 0) {
      return NextResponse.json({ error: 'No data rows found in the sheet' }, { status: 400 });
    }

    const preview = buildPreview(resolutions);

    // ---- Validate (dry-run): return the preview, write nothing. ----
    if (mode === 'validate') {
      return NextResponse.json({ mode: 'validate', ...preview });
    }

    // ---- Apply: block-until-all-clear. Refuse the whole batch on any error. ----
    if (!preview.canApply) {
      return NextResponse.json(
        {
          mode: 'apply-blocked',
          error: `${preview.summary.errorRows} row(s) still have errors. Fix them and re-upload — nothing was changed.`,
          ...preview,
        },
        { status: 422 },
      );
    }

    let created = 0, updated = 0;
    const failed: Array<{ row: number; name: string; error: string }> = [];
    for (const res of resolutions) {
      const isUpdate = !!res.payload!.structure_id;
      const { data, error } = await supabase.rpc('admission_bulk_upsert_fee_structure', { p_payload: res.payload });
      if (error) { failed.push({ row: res.rowNumber, name: res.name, error: error.message }); continue; }
      const result = data as { ok: boolean; error?: string };
      if (!result?.ok) { failed.push({ row: res.rowNumber, name: res.name, error: humanize(result?.error ?? 'Unknown error') }); continue; }
      if (isUpdate) updated++; else created++;
    }

    return NextResponse.json({ created, updated, failed });
  } catch (e: any) {
    console.error('[fees-structure/import] error:', e);
    return NextResponse.json({ error: e?.message ?? 'Import failed' }, { status: 500 });
  }
}

// Mirror of fees-structure-form.tsx humanizeFeeStructureCreateError, for the
// community-overlap trigger message.
function humanize(raw: string): string {
  if (/already covers community/i.test(raw) || /7-dim combination/i.test(raw) || /dimension combination/i.test(raw)) {
    return 'A fee structure already exists for this exact dimension + community combination. Archive the existing one or change a dimension/community.';
  }
  if (/dimension_mismatch/i.test(raw)) return 'The 6 dimensions are read-only on edit and no longer match this Fee Structure ID — fix them or clear the ID to create new.';
  if (/permission_denied/i.test(raw)) return 'You do not have permission to manage fee structures for this institution.';
  return raw;
}
