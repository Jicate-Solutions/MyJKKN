// lib/pdf/meeting-record-pdf.ts
//
// The downloadable record of a finished meeting: summary, decisions,
// follow-ups and the people who were there, as HTML for one A4 PDF.
//
// This file is PURE — it builds the HTML and the filename, nothing else. The
// route prints it with the shared renderer renderSyllabusPdf
// (lib/pdf/syllabus-pdf.ts, also used by /api/bos/po-pso/pdf), so there is one
// Chromium launcher to keep working, not two. Tested in
// __tests__/meetings/meeting-record-html.test.ts.
//
// Every value is HTML-escaped; the summary's Markdown is converted by a tiny
// line-based reader that understands only '#' headings, '- ' / '* ' bullets and
// **bold**. Nothing the summary contains is ever passed through as markup, so a
// summary cannot inject anything into the document.
//
// The fonts matter: @sparticuz/chromium ships Open Sans only, and Tamil appears
// in meeting summaries and names; without the embedded Noto Sans Tamil
// (pdfFontFaceCss) it prints as boxes on Vercel.
//
// A PDF gets forwarded, so it prints LESS than a screen would:
//   • people by NAME only — never an email address (a missing name falls back
//     to the part of the address before '@', else "Participant");
//   • no transcript link (it stays on the meeting page);
//   • no link that plays a recording.

import { pdfFontFaceCss, PDF_FONT_STACK } from '@/lib/utils/bos/pdf-fonts';
import type { MeetingRecord } from '@/lib/services/meetings/meeting-record';

export interface MeetingRecordMeta {
  generatedAt: Date;
  viewerName: string | null;
}

// ============================================================================
// ESCAPING + TINY MARKDOWN
// ============================================================================

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape first, then turn **x** into <strong>x</strong>. Escaping never
 *  produces an asterisk, so the bold pass cannot reopen an escaped tag. */
function inline(value: string): string {
  return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

/**
 * The Fireflies summary shape, and nothing more: '#' headings, '- ' or '* '
 * bullets, **bold**, and plain lines. Blank lines separate paragraphs.
 */
export function summaryToHtml(markdown: string): string {
  const out: string[] = [];
  let bullets: string[] = [];
  let para: string[] = [];

  const flushBullets = () => {
    if (bullets.length) out.push(`<ul>${bullets.map((b) => `<li>${b}</li>`).join('')}</ul>`);
    bullets = [];
  };
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.join('<br>')}</p>`);
    para = [];
  };

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '') {
      flushBullets();
      flushPara();
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      flushBullets();
      flushPara();
      out.push(`<h3>${inline(heading[1])}</h3>`);
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      flushPara();
      bullets.push(inline(bullet[1]));
      continue;
    }
    flushBullets();
    para.push(inline(line));
  }
  flushBullets();
  flushPara();
  return out.join('\n');
}

// ============================================================================
// FORMATTING
// ============================================================================

const IST = 'Asia/Kolkata';

function formatDateTimeIst(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: IST,
  }).format(new Date(iso)) + ' IST';
}

/** 'YYYY-MM-DD' due dates are calendar days, not instants — read them as UTC
 *  so no timezone can move them a day. */
function formatDueDate(value: string): string {
  const d = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

const STATUS_LABEL: Record<string, string> = {
  completed: 'Held',
  no_show: 'No-show',
  cancelled: 'Cancelled',
  confirmed: 'Scheduled — outcome not recorded',
};

function minutesBetween(start: string, end: string): number {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000));
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

interface Person {
  role: string;
  name: string;
}

/** A name for print. Never an address: a missing name — or a "name" that is
 *  itself an address, which providers sometimes store — falls back to the part
 *  before '@', and with neither the row reads "Participant". */
export function printableName(name: string | null, email: string | null): string {
  const n = name?.trim() ?? '';
  if (n && !n.includes('@')) return n;
  const local = (n || email || '').split('@')[0].trim();
  return local ? local : 'Participant';
}

/** Host, booked attendee, then everyone on the call — one row per person
 *  (collapsed on email, which is used only for that and never printed). */
function peopleOf(record: MeetingRecord): Person[] {
  const seen = new Set<string>();
  const people: Person[] = [];
  const add = (role: string, name: string | null, email: string | null) => {
    const key = email ? `e:${email.toLowerCase()}` : name ? `n:${name.toLowerCase()}` : null;
    if (!key || seen.has(key)) return;
    seen.add(key);
    people.push({ role, name: printableName(name, email) });
  };
  add('Host', record.hostName, record.hostEmail);
  add('Booked by', record.attendeeName, record.attendeeEmail);
  for (const p of record.note?.participants ?? []) add('Participant', p.name, p.email);
  return people;
}

// ============================================================================
// HTML
// ============================================================================

export function buildMeetingRecordHtml(record: MeetingRecord, meta: MeetingRecordMeta): string {
  const title = record.meetingTypeTitle ?? 'Meeting';
  const scheduled = minutesBetween(record.startTime, record.endTime);
  const recorded = record.note?.durationMinutes ?? null;
  const durationText =
    plural(scheduled, 'minute') + ' scheduled' + (recorded ? ` · ${plural(recorded, 'minute')} recorded` : '');
  const statusText = STATUS_LABEL[record.status] ?? record.status;

  const people = peopleOf(record);
  const peopleHtml = people.length
    ? `<table><thead><tr><th>Role</th><th>Name</th></tr></thead><tbody>${people
        .map((p) => `<tr><td>${escapeHtml(p.role)}</td><td>${escapeHtml(p.name)}</td></tr>`)
        .join('')}</tbody></table>`
    : '<p class="empty">No people were recorded.</p>';

  const summaryHtml = record.note?.summary
    ? `<div class="summary">${summaryToHtml(record.note.summary)}</div>`
    : '<p class="empty">No summary was recorded.</p>';

  const decisions = record.followUps.filter((f) => f.decisionText);
  const decisionsHtml = decisions.length
    ? `<ul>${decisions.map((d) => `<li>${inline(d.decisionText as string)}</li>`).join('')}</ul>`
    : '<p class="empty">None recorded.</p>';

  const followUpsHtml = record.followUps.length
    ? `<table><thead><tr><th>Follow-up</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead><tbody>${record.followUps
        .map(
          (f) =>
            `<tr><td>${inline(f.actionText)}</td><td>${f.ownerLabel ? escapeHtml(f.ownerLabel) : '—'}</td><td>${
              f.dueDate ? escapeHtml(formatDueDate(f.dueDate)) : '—'
            }</td><td>${f.status === 'done' ? 'Done' : 'Open'}</td></tr>`,
        )
        .join('')}</tbody></table>`
    : '<p class="empty">None recorded.</p>';

  const generated = formatDateTimeIst(meta.generatedAt.toISOString());
  const viewer = meta.viewerName ? printableName(meta.viewerName, null) : null;
  const footer = `Generated ${escapeHtml(generated)}${
    viewer ? ` by ${escapeHtml(viewer)}` : ''
  } from MyJKKN · booking ${escapeHtml(record.uid)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)} — meeting record</title>
<style>
${pdfFontFaceCss()}
body { font-family: ${PDF_FONT_STACK}; font-size: 11pt; color: #111; line-height: 1.45; margin: 0; }
h1 { font-size: 18pt; margin: 0 0 4px; }
h2 { font-size: 12.5pt; margin: 18px 0 6px; padding-bottom: 3px; border-bottom: 1px solid #999; }
h3 { font-size: 11pt; margin: 10px 0 4px; }
.meta { color: #333; margin: 0; }
.empty { color: #666; font-style: italic; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; vertical-align: top; padding: 4px 6px; border-bottom: 1px solid #ddd; }
th { font-size: 9.5pt; text-transform: uppercase; letter-spacing: 0.03em; color: #444; }
ul { margin: 4px 0; padding-left: 18px; }
li { margin: 2px 0; }
footer { margin-top: 24px; padding-top: 6px; border-top: 1px solid #ccc; font-size: 8.5pt; color: #555; }
</style>
</head>
<body>
<header>
<h1>${escapeHtml(title)}</h1>
<p class="meta">${escapeHtml(formatDateTimeIst(record.startTime))}</p>
<p class="meta">${escapeHtml(durationText)} · ${escapeHtml(statusText)}</p>
</header>
<section><h2>People</h2>${peopleHtml}</section>
<section><h2>Summary</h2>${summaryHtml}</section>
<section><h2>Decisions</h2>${decisionsHtml}</section>
<section><h2>Follow-ups</h2>${followUpsHtml}</section>
<footer>${footer}</footer>
</body>
</html>`;
}

/**
 * The running footer renderSyllabusPdf prints on every page (page numbers are
 * added on the right). ASCII only: that footer is drawn outside the document,
 * without the embedded Tamil face, so a Tamil title there would print as boxes.
 */
export function meetingRecordFooterText(record: MeetingRecord): string {
  const uid = record.uid.replace(/[^\x20-\x7E]/g, '');
  return `MyJKKN meeting record - booking ${uid}`;
}

/**
 * meeting-record-YYYY-MM-DD-<attendee>.pdf — ASCII only, so the
 * Content-Disposition header never needs RFC 5987 encoding. A Tamil-only name
 * leaves nothing ASCII behind and falls back to the email's local part.
 */
export function meetingRecordFilename(record: MeetingRecord): string {
  const date = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: IST,
  }).format(new Date(record.startTime));
  const slug = (value: string | null) =>
    (value ?? '')
      .normalize('NFKD')
      .replace(/[^\x00-\x7F]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/g, '');
  const who = slug(record.attendeeName) || slug(record.attendeeEmail?.split('@')[0] ?? null) || 'meeting';
  return `meeting-record-${date}-${who}.pdf`;
}
