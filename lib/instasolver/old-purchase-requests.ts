/**
 * The OLD InstaSolver site's purchase requests that were left at
 * 'Pending MD Approval' — shared by the Director screen
 * (app/(routes)/instasolver/old-purchase-requests) and its API route
 * (app/api/instasolver/old-purchase-requests).
 *
 * Director ruling, 30 Sep 2026: ONE screen where he approves or rejects each.
 * An approved one becomes a Procurement purchase request, raised through
 * ProcurementPurchaseRequestService.createPurchaseRequest — which lands it as
 * 'submitted', i.e. waiting for Procurement's own approval step. The old site
 * never recorded a quantity or a cost, so this screen does not skip that step.
 *
 * Pure: no database, no React. Tested in __tests__/instasolver/old-purchase-requests.test.ts.
 */

import type { CreatePurchaseRequestDto } from '@/types/procurement';

export const PENDING_MD_STATUS = 'Pending MD Approval';

/** The bulk bar rejects everything older than this. */
export const BULK_REJECT_OLDER_THAN_DAYS = 730;

/** A claim older than this is treated as abandoned (the tab was closed mid-approve). */
export const STALE_CLAIM_MINUTES = 10;

export const REASON_MIN = 3;
export const REASON_MAX = 300;

const DAY_MS = 86_400_000;

/**
 * Written into the Procurement request's notes. It is how the API proves a
 * purchase request really came from this old row, and how a half-finished
 * approve (request raised, decision not saved) is finished on the next tap
 * instead of raising a second request.
 */
export function oldRequestMarker(legacyId: number): string {
  return `[old-instasolver-req:${legacyId}]`;
}

export interface OldRequestForPr {
  legacy_id: number;
  institution_id: string | null;
  details: string | null;
  cause: string | null;
  clean_category: string | null;
  clean_site: string | null;
  clean_area: string | null;
  legacy_location: string | null;
  priority: string | null;
  requested_at: string | null;
}

function collapse(text: string | null | undefined): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

export function raisedOnLabel(iso: string | null): string {
  return iso ? iso.slice(0, 10) : 'an unknown date';
}

/** One line to name the thing asked for — used on the screen and in the bell. */
export function itemLabel(row: Pick<OldRequestForPr, 'details' | 'clean_category'>): string {
  const text = collapse(row.details) || collapse(row.clean_category) || 'Old purchase request';
  return text.length > 120 ? `${text.slice(0, 117).trimEnd()}...` : text;
}

export function ageInDays(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor((now.getTime() - ms) / DAY_MS) : null;
}

/**
 * The bulk bar's cutoff instant. The API route rejects rows with
 * requested_at < this, and the screen counts with the same instant, so the
 * "Yes, reject N" count and the number actually rejected cannot differ by a day.
 */
export function bulkRejectCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - BULK_REJECT_OLDER_THAN_DAYS * DAY_MS);
}

export function isOlderThanBulkCutoff(iso: string | null, now: Date = new Date()): boolean {
  if (!iso) return false;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) && ms < bulkRejectCutoff(now).getTime();
}

/**
 * The CreatePurchaseRequestDto for an approved old request: one NEW-ITEM line
 * (no catalogue item), quantity 1 because the old site never asked for one,
 * and the old details as the line's reason (createPurchaseRequest refuses a
 * new-item line without a reason).
 */
export function buildPurchaseRequestDto(row: OldRequestForPr): CreatePurchaseRequestDto {
  if (!row.institution_id) {
    throw new Error('This old request has no college, so a purchase request cannot be raised for it.');
  }
  const place = [row.clean_site, row.clean_area].filter((p) => p && p !== 'Unspecified').join(' — ');
  const reason =
    [collapse(row.details), row.cause ? `Why: ${collapse(row.cause)}` : '']
      .filter(Boolean)
      .join(' — ') || 'Raised on the old InstaSolver site.';
  return {
    institution_id: row.institution_id,
    notes: [
      `From old InstaSolver, raised ${raisedOnLabel(row.requested_at)}.`,
      row.priority ? `Old priority: ${row.priority}.` : '',
      'Quantity and cost were not recorded on the old site — please confirm them.',
      oldRequestMarker(row.legacy_id),
    ]
      .filter(Boolean)
      .join(' '),
    items: [
      {
        domain_item_id: null,
        item_name: itemLabel(row),
        item_spec: place || collapse(row.legacy_location) || null,
        required_quantity: 1,
        reason,
      },
    ],
  };
}

/** Rule #27: a refusal is explicit. Returns the error text, or null when the reason is fine. */
export function validateReason(reason: unknown): string | null {
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (text.length < REASON_MIN || text.length > REASON_MAX) {
    return `Give a one-line reason (${REASON_MIN}–${REASON_MAX} characters).`;
  }
  return null;
}

export function rejectionBell(itemName: string, reason: string, requestedAt: string | null) {
  return {
    title: `Your old purchase request ${itemName} was closed: ${reason}`.slice(0, 250),
    body: `You raised this on the old InstaSolver site on ${raisedOnLabel(requestedAt)}. It was closed with this reason: ${reason}. If you still need it, raise it again in MyJKKN.`,
  };
}
