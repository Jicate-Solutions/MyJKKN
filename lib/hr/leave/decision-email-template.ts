/**
 * The email an applicant receives when their leave, short time off or comp-off
 * request is finally approved or rejected (2026-09-11).
 *
 * Pure: takes the facts, returns subject + HTML + plain text. Every value that
 * came from a person (names, leave type, rejection reason, place) is
 * HTML-escaped — a rejection reason is free text typed by an approver.
 *
 * Dates are bare Postgres `date`s, parsed as parts: new Date('2026-09-14') is
 * UTC midnight and renders a day early anywhere behind UTC.
 */

export type DecisionEmailKind = 'leave' | 'short_time_off' | 'comp_off';

export interface DecisionEmailDetails {
  kind: DecisionEmailKind;
  /**
   * 'revoked' is an APPROVAL TAKEN BACK, not a refusal (2026-09-12). The reader
   * was already told this request was granted and has planned around it, so the
   * mail has to name that — "Rejected: Casual Leave" for something they were
   * told was approved last week reads as a system error.
   */
  decision: 'approved' | 'rejected' | 'revoked';
  staffName: string;
  /** Leave type name ("Casual Leave"); ignored for comp-off. */
  typeName?: string | null;
  // Leave / short time off
  startDate?: string | null;
  endDate?: string | null;
  /** 'HH:MM[:SS]' — short time off only. */
  startTime?: string | null;
  endTime?: string | null;
  totalDays?: number | string | null;
  durationMinutes?: number | null;
  /** "First half (AM)" etc.; omitted for a full day. */
  durationLabel?: string | null;
  // Comp-off
  workedDate?: string | null;
  workLocation?: string | null;
  workPlace?: string | null;
  expiresOn?: string | null;
  creditDays?: number | string | null;
  // Both
  decidedBy?: string | null;
  rejectionReason?: string | null;
  /** Absolute link into MyJKKN; no button when null. */
  link?: string | null;
  /** Who took the approval back. Only read when decision is 'revoked'. */
  revokedBy?: string | null;
}

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parts(iso: string): [number, number, number] | null {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return y && m && d ? [y, m, d] : null;
}

/** "14 Sep 2026". */
export function formatEmailDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const p = parts(iso);
  return p ? `${p[2]} ${MONTHS[p[1] - 1]} ${p[0]}` : iso;
}

/** "14 Sep 2026", "14–15 Sep 2026", "30 Sep – 2 Oct 2026", "30 Dec 2026 – 2 Jan 2027". */
export function formatEmailDateRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start) return '';
  if (!end || end.slice(0, 10) === start.slice(0, 10)) return formatEmailDate(start);
  const a = parts(start);
  const b = parts(end);
  if (!a || !b) return `${start} – ${end}`;
  if (a[0] === b[0] && a[1] === b[1]) return `${a[2]}–${b[2]} ${MONTHS[b[1] - 1]} ${b[0]}`;
  if (a[0] === b[0]) return `${a[2]} ${MONTHS[a[1] - 1]} – ${b[2]} ${MONTHS[b[1] - 1]} ${b[0]}`;
  return `${formatEmailDate(start)} – ${formatEmailDate(end)}`;
}

const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '');

/** Round, then drop trailing zeros: 2 -> "2", 0.5 -> "0.5". */
function num(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : value;
  return n !== null && n !== undefined && Number.isFinite(n) ? String(Number(n.toFixed(2))) : '';
}

function hoursOf(d: DecisionEmailDetails): string {
  if (d.durationMinutes && d.durationMinutes > 0) return num(d.durationMinutes / 60);
  if (!d.startTime || !d.endTime) return '';
  const [sh, sm] = d.startTime.split(':').map(Number);
  const [eh, em] = d.endTime.split(':').map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  return mins > 0 ? num(mins / 60) : '';
}

const plural = (n: string, unit: string) => `${n} ${unit}${n === '1' ? '' : 's'}`;

interface Row { label: string; value: string }

function describe(d: DecisionEmailDetails): { what: string; when: string; rows: Row[]; approvedNote: string } {
  if (d.kind === 'comp_off') {
    const worked = formatEmailDate(d.workedDate);
    const credit = num(d.creditDays) || '1';
    const rows: Row[] = [
      { label: 'Worked on', value: worked },
      {
        label: 'Location',
        value: [d.workLocation, d.workPlace].filter(Boolean).join(' — '),
      },
    ];
    if (d.decision === 'approved') {
      rows.push({ label: 'Credit', value: plural(credit, 'day') });
      rows.push({ label: 'Use it by', value: formatEmailDate(d.expiresOn) });
    }
    return {
      what: 'compensatory off claim',
      when: worked,
      rows: rows.filter((r) => r.value),
      approvedNote: d.expiresOn
        ? `You have a comp-off credit of ${plural(credit, 'day')}, usable until ${formatEmailDate(d.expiresOn)}.`
        : '',
    };
  }

  const type = d.typeName?.trim() || (d.kind === 'short_time_off' ? 'Short time off' : 'Leave');
  if (d.kind === 'short_time_off') {
    const date = formatEmailDate(d.startDate);
    const time = d.startTime && d.endTime ? `${hhmm(d.startTime)}–${hhmm(d.endTime)}` : '';
    const hours = hoursOf(d);
    return {
      what: `${type} request`,
      when: [date, time].filter(Boolean).join(', '),
      rows: [
        { label: 'Type', value: type },
        { label: 'Date', value: date },
        { label: 'Time', value: time },
        { label: 'Duration', value: hours ? plural(hours, 'hour') : '' },
      ].filter((r) => r.value),
      approvedNote: '',
    };
  }

  const range = formatEmailDateRange(d.startDate, d.endDate);
  const days = num(d.totalDays);
  return {
    what: `${type} request`,
    when: range,
    rows: [
      { label: 'Leave type', value: type },
      { label: 'Dates', value: range },
      {
        label: 'Duration',
        value: [days ? plural(days, 'day') : '', d.durationLabel ?? ''].filter(Boolean).join(' · '),
      },
    ].filter((r) => r.value),
    approvedNote: '',
  };
}

export function buildDecisionEmail(d: DecisionEmailDetails): BuiltEmail {
  const approved = d.decision === 'approved';
  const revoked = d.decision === 'revoked';
  const verb = approved ? 'approved' : revoked ? 'approved and has now been revoked' : 'rejected';
  const { what, when, rows, approvedNote } = describe(d);

  const subjectWhat =
    d.kind === 'comp_off'
      ? `Comp-off claim for ${when}`
      : `${d.typeName?.trim() || (d.kind === 'short_time_off' ? 'Short time off' : 'Leave')}${
          when ? `${d.kind === 'short_time_off' ? ' on' : ','} ${when}` : ''
        }`;
  const subject = `${approved ? 'Approved' : revoked ? 'Approval revoked' : 'Rejected'}: ${subjectWhat}`;

  const allRows: Row[] = [
    ...rows,
    ...(revoked && d.revokedBy
      ? [{ label: 'Revoked by', value: d.revokedBy }]
      : d.decidedBy
        ? [{ label: 'Decided by', value: d.decidedBy }]
        : []),
    ...(!approved ? [{ label: 'Reason', value: d.rejectionReason?.trim() || 'No reason given' }] : []),
  ];

  const lead = `Your ${what}${when && d.kind !== 'comp_off' ? ` for ${when}` : ''}${
    d.kind === 'comp_off' && when ? ` for working on ${when}` : ''
  } has been ${verb}.`;
  const after = approved
    ? approvedNote
    : revoked
      ? 'This request no longer counts as approved: the leave balance has been returned and the day is recorded as it was before. Please speak to your approver or the HR office before taking the time off.'
      : 'If you have questions about this decision, please speak to your approver or the HR office.';

  const esc = escapeHtml;
  // Approved wears the JKKN brand green (#0b6d41) rather than a generic
  // green — it is the same primary used across MyJKKN, and white on it
  // clears WCAG AA (6.4:1) where the old #16a34a did not (3.1:1).
  // Revoked / rejected stay semantic amber and red.
  const banner = approved ? '#0b6d41' : revoked ? '#d97706' : '#dc2626';
  const rowsHtml = allRows
    .map(
      (r) => `
          <tr>
            <td style="padding:5px 0;color:#6b7280;font-size:13px;width:120px;vertical-align:top;">${esc(r.label)}</td>
            <td style="padding:5px 0;color:#111827;font-size:13px;font-weight:600;">${esc(r.value)}</td>
          </tr>`
    )
    .join('');
  const button = d.link
    ? `
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;">
        <tr><td align="center">
          <a href="${esc(d.link)}" style="display:inline-block;background-color:#18181b;color:#ffffff;text-decoration:none;padding:11px 26px;border-radius:6px;font-size:14px;font-weight:500;">View in MyJKKN &#8594;</a>
        </td></tr>
      </table>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f4f6f8;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);max-width:560px;">
        <tr><td style="background-color:#18181b;padding:24px 36px;text-align:center;">
          <p style="margin:0;color:#a1a1aa;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;font-weight:600;">JKKN HR</p>
          <h1 style="margin:8px 0 0;color:#ffffff;font-size:19px;font-weight:600;">Time Off</h1>
        </td></tr>
        <tr><td style="background-color:${banner};padding:12px 36px;text-align:center;">
          <p style="margin:0;color:#ffffff;font-size:14px;font-weight:500;">Your ${esc(what)} has been ${verb}</p>
        </td></tr>
        <tr><td style="padding:32px 36px 12px;">
          <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">Hi ${esc(d.staffName || 'there')},</p>
          <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">${esc(lead)}</p>
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin:0 0 20px;">
            <tr><td style="padding:16px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">${rowsHtml}
              </table>
            </td></tr>
          </table>
          ${after ? `<p style="margin:0 0 24px;color:#374151;font-size:14px;line-height:1.6;">${esc(after)}</p>` : ''}
          ${button}
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 36px;text-align:center;">
          <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">This is an automated message from MyJKKN HR. Please do not reply to this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `Hi ${d.staffName || 'there'},`,
    '',
    lead,
    '',
    ...allRows.map((r) => `${r.label}: ${r.value}`),
    ...(after ? ['', after] : []),
    ...(d.link ? ['', `View in MyJKKN: ${d.link}`] : []),
    '',
    'This is an automated message from MyJKKN HR. Please do not reply to this email.',
  ].join('\n');

  return { subject, html, text };
}
