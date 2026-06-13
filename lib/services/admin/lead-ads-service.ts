/**
 * Lead Ads Admin Service
 *
 * Thin client-side wrapper around the admin API routes under
 * `/api/admin/social/lead-ads/*`. Used by the /admin/social/lead-ads page
 * (Received Leads section) to keep fetch logic out of the React component.
 *
 * All endpoints under /api/admin/social/lead-ads/* require super_admin or
 * administrator. Errors are surfaced as thrown Errors so TanStack Query
 * can move into the `error` state cleanly.
 */

export type LeadAdsSubmissionStatus =
  | 'pending'
  | 'imported'
  | 'merged'
  | 'failed'
  | 'skipped';

export interface LeadAdsSubmission {
  /** meta_leadgen_events.id — primary key for this submission row. */
  event_id: string;
  fb_leadgen_id: string;
  fb_form_id: string | null;
  fb_page_id: string | null;
  /** meta_lead_forms.id (internal). NULL if the form wasn't synced before the event landed. */
  form_id: string | null;
  /** meta_lead_forms.name — friendly form label. */
  form_name: string | null;
  status: LeadAdsSubmissionStatus;
  /** ISO timestamp — when Meta posted the webhook to us. */
  submitted_at: string;
  /** ISO timestamp — when the importer finished. NULL while pending. */
  processed_at: string | null;
  attempt_count: number;
  error_message: string | null;
  // Decoded from hydrated_payload.field_data (best effort)
  full_name: string | null;
  email: string | null;
  phone: string | null;
  // Joined from admission_leads (NULL when status != imported/merged)
  lead_id: string | null;
  lead_full_name: string | null;
  lead_funnel_stage: string | null;
}

export interface ListLeadAdsSubmissionsParams {
  limit?: number;
  /** meta_lead_forms.id */
  form_id?: string;
  status?: LeadAdsSubmissionStatus;
  /** If true, narrow to status IN ('imported','merged'). */
  only_imported?: boolean;
}

export class LeadAdsService {
  /**
   * GET /api/admin/social/lead-ads/leads — received Lead Ads submissions
   * with hydrated field data + linked admission_leads row (when present).
   */
  static async listSubmissions(
    params: ListLeadAdsSubmissionsParams = {}
  ): Promise<LeadAdsSubmission[]> {
    const search = new URLSearchParams();
    if (params.limit !== undefined) search.set('limit', String(params.limit));
    if (params.form_id) search.set('form_id', params.form_id);
    if (params.status) search.set('status', params.status);
    if (params.only_imported) search.set('only_imported', 'true');

    const qs = search.toString();
    const url = `/api/admin/social/lead-ads/leads${qs ? `?${qs}` : ''}`;

    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(
        body.error ?? `Failed to load lead submissions (HTTP ${res.status})`
      );
    }
    const json = (await res.json()) as { data: LeadAdsSubmission[] };
    return json.data ?? [];
  }
}
