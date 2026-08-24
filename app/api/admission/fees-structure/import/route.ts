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
  FEE_SCHEDULE_SHEET_NAME,
  detectSheetLayout,
  resolveRow,
  resolveScheduleSheet,
  resolveUnifiedSheet,
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

    // WHICH LAYOUT. Decided from the header row, never the tab name — both
    // layouts call the sheet "Fee Structures", and reading one as the other
    // would not fail loudly, it would import a coherent-looking wrong answer.
    // Read from row 1 directly so a sheet with headers but no data rows is
    // still classified correctly.
    const headerRow =
      XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false })[0] ?? [];
    const layout = detectSheetLayout(headerRow);

    const lookups = await loadBulkResolveLookups(supabase);

    let resolutions: RowResolution[] = [];
    let scheduleSummary: { structures: number; items: number } | null = null;
    // Sheet-level problems that belong to no single structure row.
    let sheetErrors: string[] = [];

    if (layout === 'unified') {
      // ── One tab: structures, fees and instalments in one grain ──────────
      const unified = resolveUnifiedSheet(rawRows, lookups);
      resolutions = unified.resolutions;
      scheduleSummary = {
        structures: resolutions.filter((r) => r.payload).length,
        items: unified.itemCount,
      };
    } else {
      // ── LEGACY two-tab workbook, still in circulation ────────────────────
      // A workbook WITHOUT the schedules tab is not an error: it is an older
      // export, and the RPC preserves every schedule when the payload omits the
      // key. Only a present-but-broken tab stops the import.
      const schedWs = wb.Sheets[FEE_SCHEDULE_SHEET_NAME];
      const schedules = schedWs
        ? resolveScheduleSheet(
            XLSX.utils.sheet_to_json<Record<string, unknown>>(schedWs, { defval: '' }),
            lookups,
          )
        : null;

      for (let i = 0; i < rawRows.length; i++) {
        const raw = rawRows[i];
        if (Object.values(raw).every((v) => String(v ?? '').trim() === '')) continue; // skip blank rows
        const res = resolveRow(raw, i + 2, lookups); // header = row 1

        // Attach this structure's schedules, if the sheet carried any. The key
        // is set ONLY when the tab exists — its absence is what tells the RPC to
        // preserve what is already configured rather than clear it.
        if (schedules && res.payload) {
          const forStructure = res.payload.structure_id
            ? schedules.byStructure.get(res.payload.structure_id)
            : undefined;
          if (forStructure) res.payload.item_schedules = forStructure;
        }

        resolutions.push(res);
      }

      if (schedules) {
        sheetErrors = schedules.errors;
        scheduleSummary = {
          structures: schedules.byStructure.size,
          items: [...schedules.byStructure.values()].reduce((n, list) => n + list.length, 0),
        };
      }
    }

    if (resolutions.length === 0) {
      return NextResponse.json({ error: 'No data rows found in the sheet' }, { status: 400 });
    }

    const preview = buildPreview(resolutions);

    // Sheet-level problems block the batch exactly like row problems do. They
    // are reported as their own entries rather than folded into a structure
    // row: they already name their own row number, and attributing them to the
    // wrong structure is worse than an extra line in the list.
    if (sheetErrors.length > 0) {
      preview.rows.push(
        ...sheetErrors.map((message) => ({
          row: 0,
          name: FEE_SCHEDULE_SHEET_NAME,
          action: 'error' as const,
          errors: [message],
        })),
      );
      preview.summary.errorRows += sheetErrors.length;
      preview.summary.total += sheetErrors.length;
      preview.canApply = false;
    }

    // ---- Validate (dry-run): return the preview, write nothing. ----
    if (mode === 'validate') {
      return NextResponse.json({ mode: 'validate', layout, ...preview, scheduleSummary });
    }

    // ---- Apply: block-until-all-clear. Refuse the whole batch on any error. ----
    if (!preview.canApply) {
      return NextResponse.json(
        {
          mode: 'apply-blocked',
          error: `${preview.summary.errorRows} row(s) still have errors. Fix them and re-upload — nothing was changed.`,
          layout,
          ...preview,
          scheduleSummary,
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
