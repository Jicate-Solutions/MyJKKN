// lib/calendar/ics.ts
// RFC 5545-compliant ICS builder for the MyJKKN calendar feed.
// No external dependencies — uses plain Date UTC methods only.

import type { CalendarItem } from '@/types/calendar';

// ---------------------------------------------------------------------------
// RFC 5545 text escaping: backslash, comma, semicolon → backslash-prefixed;
// newlines → literal \n (two characters, not a line break).
// ---------------------------------------------------------------------------
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\r?\n/g, '\\n');
}

// ---------------------------------------------------------------------------
// Date helpers — all output UTC to avoid TZ ambiguity.
// ---------------------------------------------------------------------------

/** Format a UTC datetime as yyyymmddThhmmssZ (for timed DTSTART / DTEND). */
function formatUtcDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    String(d.getUTCFullYear()) +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

/** Format a date as yyyymmdd (for all-day VALUE=DATE). */
function formatDateOnly(iso: string): string {
  // iso may be 'YYYY-MM-DD' or a full ISO timestamp; we only need the date part.
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return String(d.getUTCFullYear()) + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate());
}

/**
 * Add one calendar day to a date string and return it as yyyymmdd.
 * iCal all-day DTEND is exclusive, so the last day must be +1.
 */
function formatAllDayEndExclusive(iso: string): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return String(d.getUTCFullYear()) + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate());
}

// ---------------------------------------------------------------------------
// Public builder
// ---------------------------------------------------------------------------

/**
 * Build a VCALENDAR string from an array of CalendarItem rows.
 * Uses CRLF line endings throughout, as required by RFC 5545 §3.1.
 */
export function buildIcs(items: CalendarItem[], calName: string): string {
  const CRLF = '\r\n';
  const now = formatUtcDateTime(new Date().toISOString());

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MyJKKN//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calName)}`,
  ];

  for (const it of items) {
    const summary = it.institution_name
      ? `${escapeText(it.title)} (${escapeText(it.institution_name)})`
      : escapeText(it.title);

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${it.item_id}@myjkkn`);
    lines.push(`DTSTAMP:${now}`);

    if (it.all_day) {
      lines.push(`DTSTART;VALUE=DATE:${formatDateOnly(it.start_at)}`);
      lines.push(`DTEND;VALUE=DATE:${formatAllDayEndExclusive(it.end_at)}`);
    } else {
      lines.push(`DTSTART:${formatUtcDateTime(it.start_at)}`);
      lines.push(`DTEND:${formatUtcDateTime(it.end_at)}`);
    }

    lines.push(`SUMMARY:${summary}`);
    lines.push(`DESCRIPTION:${escapeText(it.category ?? '')}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  return lines.join(CRLF) + CRLF;
}
