/**
 * The email a scheduled AI Assistant answer is delivered in, and the short
 * in-app text. Pure functions — no I/O — so the wording and the HTML safety are
 * unit-testable.
 *
 * SAFETY: the answer is model output and the question/title are user text, so
 * EVERYTHING is HTML-escaped first and only a small, fixed set of markdown
 * shapes (headings, bold, inline code, bullet / numbered lists, pipe tables) is
 * turned back into tags afterwards. No link, image or raw HTML from the answer
 * ever reaches the email. Charts are not embedded — they are named and linked
 * to MyJKKN, where the owner's own access decides what they can see.
 */

export interface ScheduleArtifactRef {
  type: string;
  title: string | null;
}

export interface ScheduleEmailInput {
  scheduleId: string;
  title: string;
  question: string;
  answer: string;
  artifacts: ScheduleArtifactRef[];
  /** Plain English, e.g. "every Monday at 9:00 am (IST)" */
  cadenceText: string;
  appUrl: string;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Inline markdown on ALREADY-ESCAPED text: **bold** and `code` only. */
function inline(escaped: string): string {
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:#f3f4f6;padding:1px 4px;border-radius:3px">$1</code>');
}

const CELL = 'padding:6px 10px;border:1px solid #e5e7eb;text-align:left;vertical-align:top';

function tableHtml(lines: string[]): string {
  const rows = lines
    .map((l) =>
      l
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim()),
    )
    .filter((cells) => !cells.every((c) => /^:?-{2,}:?$/.test(c)));
  if (rows.length === 0) return '';
  const [head, ...body] = rows;
  const th = head.map((c) => `<th style="${CELL};background:#f9fafb">${inline(escapeHtml(c))}</th>`).join('');
  const tr = body
    .map((r) => `<tr>${r.map((c) => `<td style="${CELL}">${inline(escapeHtml(c))}</td>`).join('')}</tr>`)
    .join('');
  return `<table style="border-collapse:collapse;margin:8px 0;font-size:14px"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

/** Markdown-ish answer → simple, safe HTML. */
export function answerToSimpleHtml(answer: string): string {
  const lines = answer.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let para: string[] = [];
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;
  let table: string[] = [];

  const flushPara = () => {
    if (para.length) out.push(`<p style="margin:8px 0">${para.map((p) => inline(escapeHtml(p))).join('<br>')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) {
      out.push(`<${list.tag} style="margin:8px 0;padding-left:20px">${list.items.map((i) => `<li>${inline(escapeHtml(i))}</li>`).join('')}</${list.tag}>`);
    }
    list = null;
  };
  const flushTable = () => {
    if (table.length) out.push(tableHtml(table));
    table = [];
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushTable();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\s*\|/.test(line)) {
      flushPara();
      flushList();
      table.push(line);
      continue;
    }
    flushTable();
    if (line.trim() === '') {
      flushPara();
      flushList();
      continue;
    }
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      flushAll();
      out.push(`<h3 style="margin:14px 0 6px;font-size:16px">${inline(escapeHtml(heading[1]))}</h3>`);
      continue;
    }
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushPara();
      const tag = bullet ? 'ul' : 'ol';
      if (!list || list.tag !== tag) {
        flushList();
        list = { tag, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushAll();
  return out.join('\n');
}

/** Link back into MyJKKN that opens the Scheduled tab on this schedule. */
export function scheduleLink(appUrl: string, scheduleId: string): string {
  return `${appUrl.replace(/\/+$/, '')}/ai-query?scheduled=${encodeURIComponent(scheduleId)}`;
}

export function buildScheduleEmail(input: ScheduleEmailInput): { subject: string; html: string } {
  const link = scheduleLink(input.appUrl, input.scheduleId);
  const charts = input.artifacts.length
    ? `<div style="margin:16px 0;padding:10px 12px;border:1px solid #e5e7eb;border-radius:6px;background:#f9fafb">
<p style="margin:0 0 6px;font-weight:600">This answer comes with ${input.artifacts.length === 1 ? 'a chart or file' : `${input.artifacts.length} charts or files`}. Open them in MyJKKN:</p>
<ul style="margin:0;padding-left:20px">${input.artifacts
        .map((a) => `<li><a href="${escapeHtml(link)}">${escapeHtml(a.title || `Untitled ${a.type}`)}</a></li>`)
        .join('')}</ul></div>`
    : '';
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111827;max-width:680px">
<h2 style="margin:0 0 4px;font-size:18px">${escapeHtml(input.title)}</h2>
<p style="margin:0 0 12px;color:#4b5563;font-size:13px">Your question: ${escapeHtml(input.question)}</p>
${answerToSimpleHtml(input.answer)}
${charts}
<p style="margin:20px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#0F7642;color:#ffffff;text-decoration:none;padding:8px 16px;border-radius:6px">Open in MyJKKN</a></p>
<p style="margin-top:24px;color:#6b7280;font-size:12px">You get this because you asked the MyJKKN AI Assistant to answer this question ${escapeHtml(input.cadenceText)}. The answer uses only what your own account can see. To pause or stop it, open the AI Assistant, then History, then Scheduled.</p>
</div>`;
  return { subject: input.title, html };
}

/** Short plain text for the in-app notification body (no markdown symbols). */
export function answerExcerpt(answer: string, max = 180): string {
  const plain = answer
    .replace(/^\s*\|?\s*:?-{2,}.*$/gm, '')
    .replace(/[#*`|>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= max) return plain;
  return `${plain.slice(0, max - 1).trimEnd()}…`;
}
