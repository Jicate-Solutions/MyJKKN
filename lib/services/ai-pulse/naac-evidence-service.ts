// ============================================================================
// AI PULSE NAAC EVIDENCE SERVICE — STUB.
//
// CONTEXT: Like anomaly-service.ts and cycles-service.ts in the same folder,
// this file was missing when PR #741 (NAAC Evidence Export) merged on
// 2026-05-07. Two API routes (app/api/ai-pulse/evidence/naac/{route,export/route}.ts)
// + two client components import a class, a hook, a function and 2 types
// from this module path; the file was never created.
//
// THIS STUB unblocks the build by exporting the named symbols with no-op
// runtime behavior:
//   - NaacEvidenceService.getEvidenceRows() → throws (API routes return 500)
//   - NaacEvidenceService.getCsvDownloadUrl() → returns the API route URL
//     (which itself returns 500). Browser navigates, sees error.
//   - useNaacEvidence → empty rows, no loading, no error (preview is empty)
//   - defaultLastQuarter → { from, to } spanning the prior 90 days
//
// REPLACE THIS STUB with the real implementation reading from
// event_submissions + event_registrations (and the AI-Pulse Gold Standard
// flag). Spec §7 locks the CSV column order. Permission gate at the page
// layer is `aiPulse:naac.evidence_export` OR super_admin OR IQAC role.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types — shape inferred from how the consumer files use them.
// ---------------------------------------------------------------------------

export interface NaacEvidenceFilters {
  from: Date;
  to: Date;
  institution_id?: string | null;
}

export interface NaacEvidenceRow {
  academic_year: string;
  institution_name: string;
  department_name: string | null;
  cycle_date: string;
  project_name: string;
  description: string | null;
  team_members: string | null;
  presenter_name: string | null;
  award: string | null;
  evidence_url: string | null;
}

export interface NaacEvidenceSummary {
  total_rows: number;
  total_gold_standard: number;
  date_range: { from: string; to: string };
}

// ---------------------------------------------------------------------------
// Default date range helper — returns the prior 90 days. Used by both client
// (initial form state) and server (default query when no filters supplied).
// ---------------------------------------------------------------------------

export function defaultLastQuarter(): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 90);
  return { from, to };
}

// ---------------------------------------------------------------------------
// Service class — invoked by API routes (server) AND naac-export-form (client
// for the CSV download URL helper).
// ---------------------------------------------------------------------------

const STUB_ERROR = new Error(
  '[naac-evidence-service stub] Real service not yet implemented. ' +
    'Replace lib/services/ai-pulse/naac-evidence-service.ts with the SQL ' +
    'reading event_submissions + event_registrations (Gold Standard rows).',
);

export class NaacEvidenceService {
  /**
   * STUB: throws. Real implementation reads from event_submissions filtered
   * by AI-Pulse + Gold Standard + date range + institution scope.
   * API route catches and returns HTTP 500 with an error message.
   */
  static async getEvidenceRows(
    _supabase: SupabaseClient,
    _filters: NaacEvidenceFilters,
  ): Promise<{ rows: NaacEvidenceRow[]; summary: NaacEvidenceSummary }> {
    throw STUB_ERROR;
  }

  /**
   * Returns the API route URL the browser should navigate to for CSV download.
   * Safe to call as a stub: navigation triggers the API route, which returns
   * 500 from the stubbed `getEvidenceRows`. IQAC sees an error, contacts owner.
   */
  static getCsvDownloadUrl(filters: NaacEvidenceFilters): string {
    const params = new URLSearchParams();
    params.set('from', filters.from.toISOString().slice(0, 10));
    params.set('to', filters.to.toISOString().slice(0, 10));
    if (filters.institution_id) {
      params.set('institution_id', filters.institution_id);
    }
    return `/api/ai-pulse/evidence/naac/export?${params.toString()}`;
  }
}

// ---------------------------------------------------------------------------
// Read hook — returns empty rows + zero summary so the preview table renders
// the empty state rather than crashing.
// ---------------------------------------------------------------------------

interface UseNaacEvidenceResult {
  data: { rows: NaacEvidenceRow[]; summary: NaacEvidenceSummary } | undefined;
  isLoading: boolean;
  error: unknown;
  refetch: () => Promise<void>;
}

export function useNaacEvidence(filters: NaacEvidenceFilters): UseNaacEvidenceResult {
  return {
    data: {
      rows: [],
      summary: {
        total_rows: 0,
        total_gold_standard: 0,
        date_range: {
          from: filters.from.toISOString().slice(0, 10),
          to: filters.to.toISOString().slice(0, 10),
        },
      },
    },
    isLoading: false,
    error: null,
    refetch: async () => {},
  };
}
