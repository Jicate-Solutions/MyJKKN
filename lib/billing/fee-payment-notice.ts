// Pure display logic for the learner's 48-hour Transport Maintenance Fee
// countdown. The notice itself is created and fined by TMS (tms_fee_payment_notice,
// swept every 5 minutes); MyJKKN only shows it. Mirrors TMS-ADMIN's
// lib/fees/payment-notice/bar-state.ts so both portals agree to the second.
// The browser clock decides only what the banner SHOWS, never when a fee is raised.

export interface FeePaymentNotice {
  status: 'running' | 'fined';
  expires_at: string;
  amount: number;
  urgent_hours: number;
  /** Server clock at read time, to correct the countdown for a wrong device clock. */
  server_now: string;
}

export type FeeNoticeState = 'hidden' | 'running' | 'urgent' | 'processing' | 'fined';

export function feeNoticeState(notice: FeePaymentNotice | null | undefined, remaining: number): FeeNoticeState {
  if (!notice) return 'hidden';
  if (notice.status === 'fined') return 'fined';
  if (remaining <= 0) return 'processing';
  return remaining <= notice.urgent_hours * 3_600_000 ? 'urgent' : 'running';
}

/** server_now − client now, captured when the response arrives. */
export function clockOffset(serverNowIso: string, clientNowMs: number): number {
  const server = Date.parse(serverNowIso);
  return Number.isNaN(server) ? 0 : server - clientNowMs;
}

export function remainingMs(expiresAt: string, clientNowMs: number, offsetMs: number): number {
  return Date.parse(expiresAt) - (clientNowMs + offsetMs);
}

/** HH:MM:SS, hours not wrapped at 24 (a 48-hour window reads 47:59:59). */
export function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
