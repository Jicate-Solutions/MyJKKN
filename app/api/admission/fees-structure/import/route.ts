export const dynamic = 'force-dynamic';
// app/api/admission/fees-structure/import/route.ts
import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import * as XLSX from 'xlsx';
import { FEE_STRUCTURE_SHEET_NAME, resolveRow } from '@/lib/utils/mappings/fee-structure-excel-mappings';
import { loadBulkResolveLookups } from '@/lib/services/admission/fee-structure-bulk-lookups';

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

    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    // Pick the data sheet BY NAME (not SheetNames[0] — Instructions may be first).
    const ws = wb.Sheets[FEE_STRUCTURE_SHEET_NAME];
    if (!ws) return NextResponse.json({ error: `Sheet "${FEE_STRUCTURE_SHEET_NAME}" not found` }, { status: 400 });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

    const lookups = await loadBulkResolveLookups(supabase);

    let created = 0, updated = 0;
    const failed: Array<{ row: number; name: string; error: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const excelRow = i + 2; // header = row 1
      const raw = rows[i];
      // Skip fully-blank rows.
      if (Object.values(raw).every((v) => String(v ?? '').trim() === '')) continue;
      const res = resolveRow(raw, excelRow, lookups);
      if (res.errors.length > 0) { failed.push({ row: excelRow, name: res.name, error: res.errors.join('; ') }); continue; }

      const isUpdate = !!res.payload!.structure_id;
      const { data, error } = await supabase.rpc('admission_bulk_upsert_fee_structure', { p_payload: res.payload });
      if (error) { failed.push({ row: excelRow, name: res.name, error: error.message }); continue; }
      const result = data as { ok: boolean; error?: string };
      if (!result?.ok) { failed.push({ row: excelRow, name: res.name, error: humanize(result?.error ?? 'Unknown error') }); continue; }
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
