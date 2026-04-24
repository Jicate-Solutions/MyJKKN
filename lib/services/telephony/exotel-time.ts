// lib/services/telephony/exotel-time.ts
//
// Normalise Exotel-emitted wall-clock timestamps into ISO strings with the
// +05:30 IST offset so Postgres stores the correct instant.
//
// Why this exists:
//   Exotel's REST API (Calls.json) and in-flow Passthru applets emit
//   timestamps like `2026-04-23 21:47:20` with NO timezone suffix. Their
//   convention is IST wall-clock. Postgres's `timestamp with time zone`
//   columns interpret unqualified strings as the session TimeZone (UTC on
//   Vercel) and silently shift every stored value +5h30m into the future.
//
//   Example:
//     Exotel sends:  "2026-04-23 21:47:20"  (meaning 21:47 IST)
//     We stored:     2026-04-23 21:47:20+00 (= 03:17 IST Apr 24 — WRONG)
//     We want:       2026-04-23 21:47:20+05:30 (= 21:47 IST Apr 23 — right)
//
// Placeholder: Exotel sends `1970-01-01 05:30:00` (= the UTC epoch rendered
// as IST) when a call hasn't ended yet (e.g., mid-flow Passthru events
// before the Connect completes). We map that back to null rather than
// storing a garbage sentinel.

/**
 * Convert an Exotel wall-clock timestamp string into an ISO-8601 string with
 * the +05:30 IST offset.
 *
 * Returns null when:
 *   - Input is null/undefined/empty
 *   - Input is the "1970-01-01" sentinel Exotel uses for "no value"
 *   - Input doesn't match the expected `YYYY-MM-DD[T ]HH:MM:SS` shape
 *
 * Tolerates both the space separator (`2026-04-23 21:47:20`) that the
 * REST API and Passthru payloads use, and the ISO `T` separator.
 */
export function exotelTimeToIso(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  // Epoch-in-IST placeholder Exotel uses for "not applicable yet"
  if (y === '1970' && mo === '01' && d === '01') return null;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}+05:30`;
}
