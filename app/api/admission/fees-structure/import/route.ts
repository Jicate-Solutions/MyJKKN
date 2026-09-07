export const dynamic = 'force-dynamic';
// app/api/admission/fees-structure/import/route.ts
//
// Two-phase bulk endpoint shared by the Bulk Import / Export-for-Edit flow:
//   mode=validate (dry-run) — read the sheet, resolve + validate every row,
//     diff the update rows against what is stored, return all of it, write
//     NOTHING. Drives the dialog's Data → Changes → Validate steps.
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
  findSheetName,
  pickDataSheet,
  resolveRow,
  resolveScheduleSheet,
  resolveUnifiedSheet,
  type DataSheetPick,
  type RowResolution,
} from '@/lib/utils/mappings/fee-structure-excel-mappings';
import { loadBulkResolveLookups } from '@/lib/services/admission/fee-structure-bulk-lookups';
import {
  buildChangeSets,
  findDuplicateCreates,
  type StructureChange,
} from '@/lib/services/admission/fee-structure-bulk-diff';

type PreviewAction = 'create' | 'update' | 'error';

interface PreviewRow {
  row: number;
  name: string;
  action: PreviewAction;
  errors: string[];
}

/** How many sheet rows the dialog's Data step echoes back. */
const RAW_PREVIEW_LIMIT = 300;
/** How far down a sheet to look when reporting what a rejected workbook holds. */
const SHEET_SCAN_DEPTH = 12;

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

/** A cell as the Data step should show it — dates as yyyy-mm-dd, never a serial. */
function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    return isNaN(v.getTime())
      ? ''
      : `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  return String(v);
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
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    } catch {
      return NextResponse.json(
        { error: 'That file could not be read as a spreadsheet. Upload the .xlsx you downloaded from Download Template or Export for Edit.' },
        { status: 400 },
      );
    }

    // WHICH TAB. By COLUMNS, not by tab name.
    //
    // This used to be `wb.Sheets['Fee Structures']` with a 400 when that exact
    // key was missing, and it dead-ended on every ordinary thing an operator
    // does to a workbook: Excel's "Move or Copy" naming the duplicate
    // "Fee Structures (2)", a renamed tab, a pasted-into-a-fresh-tab sheet, a
    // round-trip through CSV (which leaves one tab called "Sheet1"). The layout
    // was ALREADY sniffed from the header row for exactly these reasons; sheet
    // selection now works the same way. The tab name is only a tie-breaker.
    const candidates = wb.SheetNames.map((name) => ({
      name,
      // blankrows MUST stay true: the index of the header row inside this array
      // is fed straight back to sheet_to_json as `range`, so it has to be the
      // real sheet row. Dropping blank rows here would shift the read up by
      // however many empty lines sat above the headers.
      rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
        header: 1,
        blankrows: true,
        range: 0,
      }).slice(0, SHEET_SCAN_DEPTH),
    }));
    const pick: DataSheetPick | null = pickDataSheet(candidates);

    if (!pick) {
      // Name what the workbook DOES hold. "Sheet Fee Structures not found" told
      // the operator nothing about the file in front of them.
      const found = wb.SheetNames.map((n) => `"${n}"`).join(', ') || 'none';
      const firstHeaders = (candidates[0]?.rows[0] ?? [])
        .map((h) => String(h ?? '').trim())
        .filter(Boolean)
        .slice(0, 8);
      return NextResponse.json(
        {
          error:
            `No fee-structure sheet in this workbook. Tabs found: ${found}.` +
            (firstHeaders.length
              ? ` The first tab's columns start with: ${firstHeaders.join(', ')}.`
              : '') +
            ` A fee-structure sheet is recognised by its columns (Institution, Degree, Programme, Name, Fee Category…), whatever the tab is called — so this file is missing them. Download a fresh template or Export for Edit.`,
          sheetNames: wb.SheetNames,
        },
        { status: 400 },
      );
    }

    const ws = wb.Sheets[pick.name];
    const layout = pick.layout;
    // range: the header row's own index, so a title line inserted above the
    // headers shifts the read instead of silently re-keying every column to
    // whatever that title row happened to contain.
    // blankrows MUST be true: a row's number is `firstRowNumber + index`, and
    // without it sheet_to_json drops every empty row on the way in, so from
    // the first blank line onward every reported row number pointed one row
    // ABOVE the cell it described — an empty row 110 made the app say
    // "Row 110" for what was physically row 111. Both resolvers already skip
    // blank rows themselves; here the blanks only hold the numbering in place.
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      defval: '',
      range: pick.headerRowIndex,
      blankrows: true,
    });
    const firstRowNumber = pick.headerRowIndex + 2;
    const isBlankRow = (raw: Record<string, unknown>) =>
      Object.values(raw).every((v) => String(v ?? '').trim() === '');
    /** The rows that carry anything, each with its real sheet row number. */
    const dataRows = rawRows
      .map((raw, i) => ({ raw, row: firstRowNumber + i }))
      .filter(({ raw }) => !isBlankRow(raw));

    const lookups = await loadBulkResolveLookups(supabase);

    let resolutions: RowResolution[] = [];
    let scheduleSummary: { structures: number; items: number } | null = null;
    // Sheet-level problems that belong to no single structure row.
    let sheetErrors: string[] = [];

    if (layout === 'unified') {
      // ── One tab: structures, fees and instalments in one grain ──────────
      const unified = resolveUnifiedSheet(rawRows, lookups, firstRowNumber);
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
      const schedName = findSheetName(wb.SheetNames, FEE_SCHEDULE_SHEET_NAME);
      const schedWs = schedName ? wb.Sheets[schedName] : null;
      const schedules = schedWs
        ? resolveScheduleSheet(
            XLSX.utils.sheet_to_json<Record<string, unknown>>(schedWs, { defval: '' }),
            lookups,
          )
        : null;

      for (let i = 0; i < rawRows.length; i++) {
        const raw = rawRows[i];
        if (isBlankRow(raw)) continue;
        const res = resolveRow(raw, firstRowNumber + i, lookups);

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
      return NextResponse.json(
        {
          error:
            `Tab "${pick.name}" has headers but no data rows` +
            (pick.headerRowIndex > 0 ? ` below row ${pick.headerRowIndex + 1}` : '') +
            '. Fill in at least one row, or check you uploaded the edited copy.',
        },
        { status: 400 },
      );
    }

    // A structure_id the database does not have (deleted, or not visible to this
    // user) used to sail through validation and fail at commit, halfway into a
    // batch. Catching it here keeps the "nothing is written until every row is
    // clear" promise honest.
    let changes: StructureChange[] = [];
    let changesError: string | null = null;
    if (mode === 'validate') {
      // The diff is an enhancement; validation is the job. A failure to read the
      // current state must not cost the operator their error list too — it is
      // reported on the Changes step and the rest of the preview stands.
      try {
        changes = await buildChangeSets(supabase, resolutions, lookups);
        const missing = new Set(
          changes.filter((c) => c.missing).map((c) => c.structureId as string),
        );
        if (missing.size > 0) {
          for (const res of resolutions) {
            if (res.payload?.structure_id && missing.has(res.payload.structure_id)) {
              res.errors.push(
                `Fee Structure ID "${res.payload.structure_id}" does not exist (or you cannot access it). Clear the ID to create a new structure instead.`,
              );
            }
          }
        }

        // The mirror image: a CREATE row (blank ID) describing a structure that
        // already exists. The database's overlap trigger refused these at Apply,
        // one row at a time, with advice to "change a dimension" — which sent an
        // operator hunting for a quota problem when the real story was that the
        // previous import of the same file had already created all 18. Say so
        // here, with the existing structure's name and ID, before anything runs.
        const duplicates = await findDuplicateCreates(supabase, resolutions);
        for (const res of resolutions) {
          const dupe = duplicates.get(res.rowNumber);
          if (!dupe) continue;
          res.errors.push(
            `A fee structure with these exact dimensions and communities already exists: "${dupe.name}"` +
              (dupe.created_at ? ` (created ${dupe.created_at.slice(0, 10)})` : '') +
              `. This row would create a duplicate and the database would refuse it. To update that structure, put its ID ${dupe.id} in the Fee Structure ID column — or start again from Export for Edit, which fills the IDs in for you.`,
          );
        }
      } catch (e: any) {
        // Supabase errors are plain objects, never Error instances — reading
        // .message off them directly is the only thing that surfaces the code.
        console.error('[fees-structure/import] change-set build failed:', e);
        changesError = e?.message ?? 'Could not read the current fee structures to compare against.';
      }
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

    // What the rows amount to at the grain the operator thinks in. On the
    // unified tab several rows are ONE structure (one per instalment of each
    // fee), so "216 rows" on its own says nothing about how many structures
    // are about to be created or updated. Counted over every structure the
    // sheet holds, valid or not — this is a description of the file, and the
    // Validate step is where the valid/error split is shown.
    const structureCount = resolutions.length;
    // Existing vs new, from the sheet itself: a row with a Fee Structure ID
    // updates that structure, a blank one creates. Read off `source` (the
    // operator's own cells) rather than the payload, which a row with errors
    // does not have — the split has to add up on a file that is not yet clean,
    // which is exactly when the operator is looking at this step.
    const existingCount = resolutions.filter(
      (r) => Boolean(r.source?.['Fee Structure ID']?.trim() || r.payload?.structure_id),
    ).length;
    const feeCount =
      layout === 'unified'
        ? (scheduleSummary?.items ?? 0)
        : resolutions.reduce((n, r) => n + (r.payload?.items.length ?? 0), 0);

    // ---- Validate (dry-run): return the preview, write nothing. ----
    if (mode === 'validate') {
      const headers = pick.header.map((h) => String(h ?? '').trim()).filter(Boolean);
      return NextResponse.json({
        mode: 'validate',
        layout,
        sheet: {
          name: pick.name,
          nameMatched: pick.nameMatched,
          expectedName: FEE_STRUCTURE_SHEET_NAME,
          headerRow: pick.headerRowIndex + 1,
          sheetNames: wb.SheetNames,
          headers,
          totalRows: dataRows.length,
          structures: structureCount,
          existing: existingCount,
          new: structureCount - existingCount,
          fees: feeCount,
        },
        rawPreview: {
          headers,
          rows: dataRows.slice(0, RAW_PREVIEW_LIMIT).map(({ raw, row }) => ({
            row,
            cells: headers.map((h) => cellText(raw[h])),
          })),
          truncated: dataRows.length > RAW_PREVIEW_LIMIT,
        },
        changes,
        changesError,
        ...preview,
        scheduleSummary,
      });
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
    // Validation now names the existing structure before Apply; this is the
    // fallback for one created between the two steps. "Change a dimension" was
    // the wrong first suggestion — the usual story is a re-import of a file
    // whose CREATE rows were already created last time.
    return 'A fee structure with these exact dimensions and communities already exists. If you meant to update it, put its Fee Structure ID on the row (Export for Edit fills these in); only change a dimension or community if you really mean a different structure.';
  }
  if (/dimension_mismatch/i.test(raw)) return 'The 6 dimensions are read-only on edit and no longer match this Fee Structure ID — fix them or clear the ID to create new.';
  if (/permission_denied/i.test(raw)) return 'You do not have permission to manage fee structures for this institution.';
  return raw;
}
