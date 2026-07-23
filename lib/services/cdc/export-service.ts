// CDC Export Service — agent ζ Sprint 7b
// Handles server-side export generation (CSV / XLSX) and audit storage.

import { createClient } from '@/lib/supabase/server';
import * as XLSX from 'xlsx';
import {
  NaacRow,
  AicteRow,
  FlexExportRequest,
  FlexTable,
  FLEX_TABLE_COLUMNS,
  ExportFormat,
} from '@/types/cdc/exports';

// ------------------------------------------------------------------
// CSV helper (no external dep beyond stdlib)
// ------------------------------------------------------------------
function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const v = r[h];
          if (v === null || v === undefined) return '';
          const s = String(v);
          return s.includes(',') || s.includes('"') || s.includes('\n')
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        })
        .join(',')
    ),
  ];
  return lines.join('\r\n');
}

// ------------------------------------------------------------------
// XLSX helper — returns Buffer
// ------------------------------------------------------------------
function toXlsx(rows: Record<string, unknown>[]): Buffer {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Export');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// ------------------------------------------------------------------
// Store export artifact in cdc-docs bucket
// ------------------------------------------------------------------
async function storeAuditCopy(
  supabase: Awaited<ReturnType<typeof createClient>>,
  filename: string,
  content: Buffer | string
): Promise<void> {
  const year = new Date().getFullYear();
  const path = `exports/${year}/${filename}`;
  const body =
    typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
  const { error } = await supabase.storage
    .from('cdc-docs')
    .upload(path, body, { upsert: true });
  if (error) {
    // Non-fatal — log but don't break the download
    console.error('[cdc/export-service] audit copy upload failed', error.message);
  }
}

// ------------------------------------------------------------------
// NAAC 8.2 (Graduate Progression, Binary framework) export
// — formerly Criterion 5.2.1; the RPC/policy/type identifiers below keep
//   the legacy `naac_5_2_1` name (grants and DB objects reference them).
// ------------------------------------------------------------------
// The full NAAC placement template (21 columns) is declared in the
// platform_policies row `cdc.naac_export_column_mapping`. The RPC below
// currently returns the subset of columns that are derivable from
// cdc_placements + learners_profiles (~12 columns). Columns flagged
// `source: 'manual'` in the policy (district, state, year_of_admission,
// year_of_passing, cgpa, sector, package_currency, is_higher_studies,
// higher_studies_institute, higher_studies_program) are not yet populated
// by the RPC — the Director adds them manually before submission, or a
// later sprint extends `fn_naac_5_2_1_export` + `cdc_naac_5_2_1_row` to
// derive them. The policy is the source of intent; the RPC is the source
// of output. If NAAC publishes a new template, update the JSONB at
// /cdc/admin/policies — zero deploys.
// ------------------------------------------------------------------
export async function generateNaacExport(
  cycle: string,
  format: ExportFormat
): Promise<{ data: Buffer | string; filename: string; mime: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('fn_naac_5_2_1_export', {
    p_cycle: cycle,
  });

  if (error) throw new Error(`NAAC export RPC failed: ${error.message}`);

  const rows: NaacRow[] = data ?? [];
  const cycleSafe = cycle.replace(/[^a-zA-Z0-9-]/g, '_');
  const ts = new Date().toISOString().slice(0, 10);
  const filename = `naac_8_2_${cycleSafe}_${ts}.${format}`;

  if (format === 'csv') {
    const csv = toCsv(rows as unknown as Record<string, unknown>[]);
    await storeAuditCopy(supabase, filename, csv);
    return { data: csv, filename, mime: 'text/csv' };
  } else {
    const buf = toXlsx(rows as unknown as Record<string, unknown>[]);
    await storeAuditCopy(supabase, filename, buf);
    return {
      data: buf,
      filename,
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }
}

// ------------------------------------------------------------------
// AICTE Annual export
// ------------------------------------------------------------------
// The full AICTE Annual Return 2025-26 placement template (15 columns)
// is declared in the platform_policies row `cdc.aicte_export_column_mapping`.
// The RPC below currently returns ~9 columns. Columns flagged
// `source: 'manual'` in the policy (branch, year_of_admission,
// year_of_passing, sector) are not yet populated by the RPC — Director
// fills them before AICTE submission. If AICTE publishes a new template,
// update the JSONB at /cdc/admin/policies — zero deploys.
// ------------------------------------------------------------------
export async function generateAicteExport(
  year: number,
  format: ExportFormat
): Promise<{ data: Buffer | string; filename: string; mime: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('fn_aicte_annual_export', {
    p_year: year,
  });

  if (error) throw new Error(`AICTE export RPC failed: ${error.message}`);

  const rows: AicteRow[] = data ?? [];
  const ts = new Date().toISOString().slice(0, 10);
  const filename = `aicte_annual_${year}_${ts}.${format}`;

  if (format === 'csv') {
    const csv = toCsv(rows as unknown as Record<string, unknown>[]);
    await storeAuditCopy(supabase, filename, csv);
    return { data: csv, filename, mime: 'text/csv' };
  } else {
    const buf = toXlsx(rows as unknown as Record<string, unknown>[]);
    await storeAuditCopy(supabase, filename, buf);
    return {
      data: buf,
      filename,
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }
}

// ------------------------------------------------------------------
// Flex generator export
// Allowed tables are constrained server-side to prevent arbitrary queries.
// ------------------------------------------------------------------

const FLEX_QUERIES: Record<
  FlexTable,
  (
    supabase: Awaited<ReturnType<typeof createClient>>,
    from: string,
    to: string
  ) => Promise<Record<string, unknown>[]>
> = {
  cdc_placements: async (supabase, from, to) => {
    const { data, error } = await (supabase as any)
      .from('cdc_placements')
      .select(
        `
        id,
        status,
        package_lpa,
        package_inr_total,
        job_role,
        job_location,
        is_walk_in,
        offered_at,
        accepted_at,
        learner:learners_profiles(first_name, last_name, roll_number),
        recruiter:cdc_recruiters(name)
      `
      )
      .gte('offered_at', from)
      .lte('offered_at', to)
      .order('offered_at', { ascending: false });

    if (error) throw new Error(error.message);

    return (data ?? []).map((r: any) => ({
      learner_name: r.learner
        ? `${r.learner.first_name} ${r.learner.last_name}`
        : '',
      roll_number: r.learner?.roll_number ?? '',
      company_name: r.recruiter?.name ?? '',
      job_role: r.job_role,
      job_location: r.job_location,
      package_lpa: r.package_lpa,
      package_inr_total: r.package_inr_total,
      status: r.status,
      is_walk_in: r.is_walk_in,
      offered_at: r.offered_at,
      accepted_at: r.accepted_at,
    }));
  },

  cdc_drives: async (supabase, from, to) => {
    const { data, error } = await (supabase as any)
      .from('cdc_drives')
      .select(
        `
        id, drive_name, status, drive_date, venue,
        package_lpa_min, package_lpa_max,
        recruiter:cdc_recruiters(name)
      `
      )
      .gte('drive_date', from)
      .lte('drive_date', to)
      .order('drive_date', { ascending: false });

    if (error) throw new Error(error.message);

    return (data ?? []).map((r: any) => ({
      drive_name: r.drive_name,
      company_name: r.recruiter?.name ?? '',
      drive_date: r.drive_date,
      status: r.status,
      venue: r.venue,
      package_lpa_min: r.package_lpa_min,
      package_lpa_max: r.package_lpa_max,
    }));
  },

  cdc_training_enrollments: async (supabase, from, to) => {
    const { data, error } = await (supabase as any)
      .from('cdc_training_enrollments')
      .select(
        `
        id, status, enrolled_at, completed_at, score, certificate_url,
        learner:learners_profiles(first_name, last_name),
        programme:cdc_training_programmes(name)
      `
      )
      .gte('enrolled_at', from)
      .lte('enrolled_at', to)
      .order('enrolled_at', { ascending: false });

    if (error) throw new Error(error.message);

    return (data ?? []).map((r: any) => ({
      learner_name: r.learner
        ? `${r.learner.first_name} ${r.learner.last_name}`
        : '',
      programme_name: r.programme?.name ?? '',
      status: r.status,
      enrolled_at: r.enrolled_at,
      completed_at: r.completed_at,
      score: r.score,
      certificate_url: r.certificate_url,
    }));
  },
};

// ------------------------------------------------------------------
// Proof bundle — supporting offer-letter documents for NAAC 8.2 (Graduate
// Progression) / AICTE (BUG-004082)
// ------------------------------------------------------------------
// Returns the list of offer-letter documents for the SAME placement set the
// NAAC 8.2 export covers (cdc_placements where status = 'accepted'). The
// caller (a CDC-staff-gated API route) hands this manifest to the browser,
// which fetches each public cdc-docs URL and bundles them into a ZIP via
// jszip. We return only { url, filename } — no PII beyond what the offer
// letter itself contains — and let the client do the heavy file fetching so
// the server never has to buffer N PDFs into memory.
//
// `offer_letter_url` is a public cdc-docs URL (uploaded via getPublicUrl on
// the placements/internships forms). Placements with a null offer letter are
// skipped here — the caller toasts "no proofs found" when this list is empty.
//
// RLS: this read runs under the regular server client (session-scoped). The
// cdc_placements_read policy returns all rows to is_cdc_staff() and only the
// learner's own row otherwise — so the API route MUST keep its app-layer
// CDC-staff role gate (mirrors the NAAC route) to prevent a learner from
// pulling the institution-wide set.
// ------------------------------------------------------------------
export interface PlacementProof {
  url: string;
  filename: string;
}

function sanitizeSegment(value: string | null | undefined, fallback: string): string {
  const s = (value ?? '').trim();
  if (!s) return fallback;
  return s.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
}

function extensionFromUrl(url: string, fallback = 'pdf'): string {
  // Strip query string, take the last path segment's extension.
  const clean = url.split('?')[0].split('#')[0];
  const m = clean.match(/\.([a-zA-Z0-9]{1,5})$/);
  return m ? m[1].toLowerCase() : fallback;
}

export async function listPlacementProofs(): Promise<PlacementProof[]> {
  const supabase = await createClient();

  const { data, error } = await (supabase as any)
    .from('cdc_placements')
    .select(
      `
      id,
      offer_letter_url,
      learner:learners_profiles(register_number, first_name, last_name),
      recruiter:cdc_recruiters(name)
    `
    )
    .eq('status', 'accepted')
    .not('offer_letter_url', 'is', null)
    .order('accepted_at', { ascending: false });

  if (error) throw new Error(`Proof listing failed: ${error.message}`);

  // Build a unique, human-readable filename per proof. Collisions (same
  // register number + recruiter) get a short id suffix so nothing is silently
  // overwritten inside the ZIP.
  const seen = new Map<string, number>();
  const proofs: PlacementProof[] = [];

  for (const r of (data ?? []) as Array<{
    id: string;
    offer_letter_url: string | null;
    learner: { register_number: string | null; first_name: string | null; last_name: string | null } | null;
    recruiter: { name: string | null } | null;
  }>) {
    const url = r.offer_letter_url;
    if (!url) continue; // defensive — query already filters nulls

    const reg = sanitizeSegment(r.learner?.register_number, 'unknown');
    const recruiter = sanitizeSegment(r.recruiter?.name, 'recruiter');
    const ext = extensionFromUrl(url);

    let base = `${reg}-${recruiter}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    if (count > 0) base = `${base}-${r.id.slice(0, 8)}`;

    proofs.push({ url, filename: `${base}.${ext}` });
  }

  return proofs;
}

export async function generateFlexExport(
  req: FlexExportRequest
): Promise<{ data: Buffer | string; filename: string; mime: string }> {
  const supabase = await createClient();

  // Server-side safe-list check
  const allowedTables: FlexTable[] = [
    'cdc_placements',
    'cdc_drives',
    'cdc_training_enrollments',
  ];
  if (!allowedTables.includes(req.table)) {
    throw new Error(`Table '${req.table}' is not allowed in flex export`);
  }

  // Validate requested columns against safe list
  const allowedCols = FLEX_TABLE_COLUMNS[req.table].map((c) => c.name);
  const invalidCols = req.columns.filter((c) => !allowedCols.includes(c));
  if (invalidCols.length > 0) {
    throw new Error(`Invalid columns: ${invalidCols.join(', ')}`);
  }

  const queryFn = FLEX_QUERIES[req.table];
  const allRows = await queryFn(supabase, req.dateFrom, req.dateTo);

  // Filter columns
  const filtered = allRows.map((r) => {
    const out: Record<string, unknown> = {};
    req.columns.forEach((col) => {
      if (col in r) out[col] = r[col];
    });
    return out;
  });

  const ts = new Date().toISOString().slice(0, 10);
  const filename = `flex_${req.table}_${ts}.${req.format}`;

  if (req.format === 'csv') {
    const csv = toCsv(filtered);
    await storeAuditCopy(supabase, filename, csv);
    return { data: csv, filename, mime: 'text/csv' };
  } else {
    const buf = toXlsx(filtered);
    await storeAuditCopy(supabase, filename, buf);
    return {
      data: buf,
      filename,
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }
}
