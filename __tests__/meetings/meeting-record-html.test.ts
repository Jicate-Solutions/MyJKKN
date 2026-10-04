// __tests__/meetings/meeting-record-html.test.ts
//
// The pure half of the meeting-record PDF: what buildMeetingRecordHtml prints.
// No Chromium here — the route prints this HTML with renderSyllabusPdf; only
// the HTML is under test.

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/utils/bos/pdf-fonts', () => ({
  pdfFontFaceCss: () => '/* fonts */',
  PDF_FONT_STACK: `'Tinos', 'Noto Sans Tamil', serif`,
}));

import {
  buildMeetingRecordHtml,
  meetingRecordFilename,
  meetingRecordFooterText,
  printableName,
  summaryToHtml,
} from '@/lib/pdf/meeting-record-pdf';
import type { MeetingRecord } from '@/lib/services/meetings/meeting-record';

const meta = { generatedAt: new Date('2026-09-26T04:30:00Z'), viewerName: 'Viewer One' };

function record(overrides: Partial<MeetingRecord> = {}): MeetingRecord {
  return {
    uid: 'abc123',
    meetingTypeTitle: 'Weekly review',
    startTime: '2026-09-25T05:30:00Z',
    endTime: '2026-09-25T06:00:00Z',
    status: 'completed',
    attendeeName: 'Kavya R',
    attendeeEmail: 'kavya@jkkn.ac.in',
    hostName: 'Host Person',
    hostEmail: 'host@jkkn.ac.in',
    note: {
      title: 'Weekly review',
      summary: '- **Decision:** move the review to Friday',
      durationMinutes: 28,
      occurredAt: '2026-09-25T05:30:00Z',
      participants: [],
    },
    followUps: [],
    ...overrides,
  };
}

/** The printed document without its <style> block (font CSS uses '@font-face'). */
function printed(html: string): string {
  return html.replace(/<style>[\s\S]*?<\/style>/, '');
}

describe('escaping', () => {
  it('escapes every field — a summary, a name and a follow-up cannot inject markup', () => {
    const html = buildMeetingRecordHtml(
      record({
        meetingTypeTitle: '<script>alert(1)</script>',
        attendeeName: '<img src=x onerror=alert(1)>',
        note: { ...record().note!, summary: '<b>raw</b> & "quoted"' },
        followUps: [
          { actionText: '<iframe>', decisionText: '<svg onload=1>', ownerLabel: '<u>o</u>', dueDate: null, status: 'open' },
        ],
      }),
      meta,
    );
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>raw</b>');
    expect(html).not.toContain('<iframe>');
    expect(html).not.toContain('<svg onload');
    expect(html).not.toContain('<u>o</u>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;raw&lt;/b&gt; &amp; &quot;quoted&quot;');
  });
});

describe('the Fireflies summary shape', () => {
  it('turns bullets, bold and headings into markup', () => {
    const out = summaryToHtml('# Overview\n- **Decision:** ship it\n* second point\n\nPlain line');
    expect(out).toContain('<h3>Overview</h3>');
    expect(out).toContain('<ul><li><strong>Decision:</strong> ship it</li><li>second point</li></ul>');
    expect(out).toContain('<p>Plain line</p>');
  });

  it('bold markers cannot reopen an escaped tag', () => {
    expect(summaryToHtml('**<b>x</b>**')).toBe('<p><strong>&lt;b&gt;x&lt;/b&gt;</strong></p>');
  });
});

describe('Tamil', () => {
  it('passes Tamil text through unchanged, in the summary and in names', () => {
    const tamil = 'கூட்டம் முடிந்தது';
    const html = buildMeetingRecordHtml(
      record({
        attendeeName: 'கவியா',
        note: { ...record().note!, summary: `- ${tamil}`, participants: [{ name: 'முருகன்', email: 'm@x.in' }] },
      }),
      meta,
    );
    expect(html).toContain(tamil);
    expect(html).toContain('கவியா');
    expect(html).toContain('முருகன்');
    expect(html).toContain("'Noto Sans Tamil'");
  });

  it('a Tamil-only name falls back to the email for the ASCII filename', () => {
    expect(meetingRecordFilename(record({ attendeeName: 'கவியா' }))).toBe('meeting-record-2026-09-25-kavya.pdf');
    expect(meetingRecordFilename(record())).toBe('meeting-record-2026-09-25-kavya-r.pdf');
  });

  it('keeps the running footer ASCII — it is drawn without the Tamil face', () => {
    expect(meetingRecordFooterText(record())).toBe('MyJKKN meeting record - booking abc123');
    expect(meetingRecordFooterText(record({ meetingTypeTitle: 'கூட்டம்' }))).toMatch(/^[\x20-\x7E]+$/);
  });
});

describe('empty sections', () => {
  it('says so plainly instead of leaving a blank', () => {
    const html = buildMeetingRecordHtml(record({ note: null, followUps: [] }), meta);
    expect(html).toContain('No summary was recorded.');
    expect(html.match(/None recorded\./g)).toHaveLength(2); // decisions + follow-ups
  });
});

describe('people — names only, never an email address', () => {
  it('lists host, booker and participants once each, by name, with no "@" anywhere', () => {
    const html = buildMeetingRecordHtml(
      record({
        note: {
          ...record().note!,
          participants: [
            { name: 'Kavya', email: 'kavya@jkkn.ac.in' }, // the booker again
            { name: 'Host again', email: 'host@jkkn.ac.in' }, // the host again
            { name: 'Third Person', email: 'third@jkkn.ac.in' },
          ],
        },
      }),
      meta,
    );
    const doc = printed(html);
    expect(doc).not.toContain('@');
    expect(doc).not.toMatch(/<th>Email<\/th>/);
    expect(doc).toContain('<td>Host Person</td>');
    expect(doc).toContain('<td>Kavya R</td>');
    expect(doc).toContain('<td>Third Person</td>');
    expect(doc).not.toContain('Host again'); // collapsed on the host's email
    expect(doc.match(/<td>Participant<\/td>/g)).toHaveLength(1); // only "Third Person"'s role cell
  });

  it('a missing name prints the part before "@", else "Participant"', () => {
    const html = buildMeetingRecordHtml(
      record({
        hostName: null,
        attendeeName: 'kavya@jkkn.ac.in', // a "name" that is really an address
        note: {
          ...record().note!,
          participants: [
            { name: null, email: 'third@jkkn.ac.in' },
            { name: 'fourth@jkkn.ac.in', email: null },
          ],
        },
      }),
      { ...meta, viewerName: 'viewer@jkkn.ac.in' },
    );
    const doc = printed(html);
    expect(doc).not.toContain('@');
    expect(doc).toContain('<td>host</td>');
    expect(doc).toContain('<td>kavya</td>');
    expect(doc).toContain('<td>third</td>');
    expect(doc).toContain('<td>fourth</td>');
    expect(doc).toContain('by viewer from MyJKKN');
    expect(printableName(null, null)).toBe('Participant');
    expect(printableName('  ', '')).toBe('Participant');
  });
});

describe('follow-ups', () => {
  it('prints decisions and follow-ups with owner, due date and status', () => {
    const html = buildMeetingRecordHtml(
      record({
        followUps: [
          { actionText: 'Send the rota', decisionText: 'Rota starts in October', ownerLabel: 'HOD', dueDate: '2026-10-03', status: 'open' },
          { actionText: 'Book the hall', decisionText: null, ownerLabel: null, dueDate: null, status: 'done' },
        ],
      }),
      meta,
    );
    expect(html).toContain('<li>Rota starts in October</li>');
    expect(html).toContain('Send the rota');
    expect(html).toContain('3 Oct 2026');
    expect(html).toContain('>Done<');
    expect(html).toContain('Viewer One');
  });
});

describe('links a forwarded PDF must never carry', () => {
  it('prints no transcript link and no recording, audio or video link', () => {
    const polluted = {
      ...record(),
      note: { ...record().note!, transcriptUrl: 'https://app.fireflies.ai/view/abc' },
      recording_url: 'https://signed.example/rec?token=secret',
      audio_url: 'https://signed.example/audio?token=secret',
      video_url: 'https://signed.example/video?token=secret',
    } as unknown as MeetingRecord;
    const html = buildMeetingRecordHtml(polluted, meta);
    expect(html).not.toContain('fireflies');
    expect(html).not.toContain('signed.example');
    expect(html).not.toContain('token=secret');
    expect(html).not.toContain('<a ');
    expect(html).not.toMatch(/transcript/i);
  });
});
