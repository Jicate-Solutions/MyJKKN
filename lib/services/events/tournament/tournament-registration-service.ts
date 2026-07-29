// lib/services/events/tournament/tournament-registration-service.ts
// Client service for tournament registration (Sports Tournament PR2).
// Thin fetch wrappers over the /api/events/tournament/[eventId]/entries routes.
// Registration writes are server-side (service-role + eligibility + permission),
// so this service does NOT touch Supabase directly.
// Created: 2026-06-22 (Sports Tournament PR2).

import type { TournamentEntry, UpdateEntryDto } from '@/types/tournament';

async function asJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 207) {
    throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  }
  return body as T;
}

export class TournamentRegistrationService {
  /** List all entries for a tournament (organizer view, payment + roster joined). */
  static async listEntries(eventId: string): Promise<TournamentEntry[]> {
    const res = await fetch(`/api/events/tournament/${eventId}/entries`, { cache: 'no-store' });
    const data = await asJson<{ entries: TournamentEntry[] }>(res);
    return data.entries ?? [];
  }

  /** Update an entry (seed/status/name/notes). */
  static async updateEntry(
    eventId: string,
    entryId: string,
    dto: UpdateEntryDto
  ): Promise<TournamentEntry> {
    const res = await fetch(`/api/events/tournament/${eventId}/entries/${entryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
    const data = await asJson<{ entry: TournamentEntry }>(res);
    return data.entry;
  }

  /** Mark an entry's payment as collected offline (cash/UPI). */
  static async markPaid(eventId: string, entryId: string, reference?: string): Promise<void> {
    const res = await fetch(`/api/events/tournament/${eventId}/entries/${entryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_paid', payment_reference: reference }),
    });
    await asJson<{ ok: boolean }>(res);
  }

  /** Withdraw an entry; server applies the refund-window rule. */
  static async withdraw(
    eventId: string,
    entryId: string
  ): Promise<{ refund: 'processed' | 'pending' | 'failed' | 'manual' | 'none' | 'not_applicable'; reason?: string }> {
    const res = await fetch(`/api/events/tournament/${eventId}/entries/${entryId}`, {
      method: 'DELETE',
    });
    const data = await asJson<{ refund: 'processed' | 'pending' | 'failed' | 'manual' | 'none' | 'not_applicable'; reason?: string }>(res);
    return { refund: data.refund, reason: data.reason };
  }

  /** Generate (or re-generate) a Razorpay payment order for an unpaid entry. */
  static async generatePaymentLink(
    eventId: string,
    entryId: string
  ): Promise<{
    transaction_id: string | null;
    razorpay_order_id: string | null;
    razorpay_key_id: string | null;
    amount_paise: number | null;
    customer: { name?: string; email?: string; phone?: string } | null;
  }> {
    const res = await fetch(`/api/events/tournament/${eventId}/entries/${entryId}/pay`, {
      method: 'POST',
    });
    return asJson(res);
  }
}
