// lib/sop/render.ts
// Server- and client-safe renderers that walk a Tiptap JSON document tree and
// produce HTML, Markdown, or plain text. Used by the export endpoint and by
// the print / preview screens.
//
// Why custom walkers (not @tiptap/html generateHTML)?
//   - generateHTML pulls in the prosemirror-model runtime + every extension
//     schema, which is heavy on the server and doesn't always survive Next.js
//     edge runtime boundaries.
//   - Our content shape is well-defined; a small recursive walker covers all
//     nodes the editor produces (paragraph, heading, list, table, image,
//     codeBlock, blockquote, hardBreak) with zero dependencies.

import type { SopNode, SopPageSettings } from '@/types/bos-sop';

// ── HTML escape ────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

// ── Marks → opening / closing tags ─────────────────────────────────────────

function openMark(mark: { type: string; attrs?: Record<string, unknown> }): string {
  switch (mark.type) {
    case 'bold':
      return '<strong>';
    case 'italic':
      return '<em>';
    case 'underline':
      return '<u>';
    case 'strike':
      return '<s>';
    case 'code':
      return '<code>';
    case 'subscript':
      return '<sub>';
    case 'superscript':
      return '<sup>';
    case 'highlight': {
      const color = (mark.attrs?.color as string) || '#fff59d';
      return `<mark style="background-color:${escapeAttr(color)}">`;
    }
    case 'textStyle': {
      const styles: string[] = [];
      const a = mark.attrs ?? {};
      if (a.color) styles.push(`color:${escapeAttr(String(a.color))}`);
      if (a.fontFamily) styles.push(`font-family:${escapeAttr(String(a.fontFamily))}`);
      if (a.fontSize) styles.push(`font-size:${escapeAttr(String(a.fontSize))}`);
      return styles.length ? `<span style="${styles.join(';')}">` : '<span>';
    }
    case 'link': {
      const href = (mark.attrs?.href as string) ?? '#';
      return `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">`;
    }
    default:
      return '';
  }
}

function closeMark(mark: { type: string }): string {
  switch (mark.type) {
    case 'bold':
      return '</strong>';
    case 'italic':
      return '</em>';
    case 'underline':
      return '</u>';
    case 'strike':
      return '</s>';
    case 'code':
      return '</code>';
    case 'subscript':
      return '</sub>';
    case 'superscript':
      return '</sup>';
    case 'highlight':
      return '</mark>';
    case 'textStyle':
      return '</span>';
    case 'link':
      return '</a>';
    default:
      return '';
  }
}

// ── HTML renderer ──────────────────────────────────────────────────────────

export function sopJsonToHtml(node: SopNode | undefined | null): string {
  if (!node) return '';
  const type = node.type;

  // Text leaf — wrap in marks (innermost-first close order).
  if (type === 'text') {
    let out = escapeHtml(node.text ?? '');
    const marks = node.marks ?? [];
    for (const m of marks) out = openMark(m) + out + closeMark(m);
    return out;
  }

  const children = (node.content ?? []).map((c) => sopJsonToHtml(c)).join('');

  switch (type) {
    case 'doc':
      return children;
    case 'paragraph': {
      const align = (node.attrs?.textAlign as string) || '';
      const style = align ? ` style="text-align:${escapeAttr(align)}"` : '';
      return `<p${style}>${children}</p>`;
    }
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 2));
      const align = (node.attrs?.textAlign as string) || '';
      const style = align ? ` style="text-align:${escapeAttr(align)}"` : '';
      return `<h${level}${style}>${children}</h${level}>`;
    }
    case 'bulletList':
      return `<ul>${children}</ul>`;
    case 'orderedList': {
      const start = node.attrs?.start ? ` start="${escapeAttr(String(node.attrs.start))}"` : '';
      return `<ol${start}>${children}</ol>`;
    }
    case 'listItem':
      return `<li>${children}</li>`;
    case 'taskList':
      return `<ul class="task-list">${children}</ul>`;
    case 'taskItem': {
      const checked = node.attrs?.checked ? 'checked' : '';
      return `<li class="task-item"><input type="checkbox" ${checked} disabled />${children}</li>`;
    }
    case 'blockquote':
      return `<blockquote>${children}</blockquote>`;
    case 'codeBlock': {
      const lang = (node.attrs?.language as string) || '';
      return `<pre><code${lang ? ` class="language-${escapeAttr(lang)}"` : ''}>${children}</code></pre>`;
    }
    case 'horizontalRule':
      return '<hr />';
    case 'hardBreak':
      return '<br />';
    case 'image': {
      const src = (node.attrs?.src as string) ?? '';
      const alt = (node.attrs?.alt as string) ?? '';
      const title = (node.attrs?.title as string) ?? '';
      const width = node.attrs?.width ? ` width="${escapeAttr(String(node.attrs.width))}"` : '';
      return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" title="${escapeAttr(title)}"${width} />`;
    }
    case 'table':
      return `<table border="1" cellspacing="0" cellpadding="6">${children}</table>`;
    case 'tableRow':
      return `<tr>${children}</tr>`;
    case 'tableHeader': {
      const colspan = node.attrs?.colspan ? ` colspan="${escapeAttr(String(node.attrs.colspan))}"` : '';
      const rowspan = node.attrs?.rowspan ? ` rowspan="${escapeAttr(String(node.attrs.rowspan))}"` : '';
      return `<th${colspan}${rowspan}>${children}</th>`;
    }
    case 'tableCell': {
      const colspan = node.attrs?.colspan ? ` colspan="${escapeAttr(String(node.attrs.colspan))}"` : '';
      const rowspan = node.attrs?.rowspan ? ` rowspan="${escapeAttr(String(node.attrs.rowspan))}"` : '';
      return `<td${colspan}${rowspan}>${children}</td>`;
    }
    default:
      // Unknown nodes: render their children rather than dropping content.
      return children;
  }
}

// ── Markdown renderer ──────────────────────────────────────────────────────
// Subset coverage: headings, paragraphs, lists, links, bold/italic/code,
// blockquotes, code blocks, hr, hard-break, images, tables (pipe form).

export function sopJsonToMarkdown(node: SopNode | undefined | null): string {
  if (!node) return '';
  const type = node.type;

  if (type === 'text') {
    let out = node.text ?? '';
    const marks = node.marks ?? [];
    for (const m of marks) {
      switch (m.type) {
        case 'bold':
          out = `**${out}**`;
          break;
        case 'italic':
          out = `*${out}*`;
          break;
        case 'code':
          out = `\`${out}\``;
          break;
        case 'strike':
          out = `~~${out}~~`;
          break;
        case 'link': {
          const href = (m.attrs?.href as string) ?? '';
          out = `[${out}](${href})`;
          break;
        }
        default:
          break;
      }
    }
    return out;
  }

  const children = (node.content ?? []).map((c) => sopJsonToMarkdown(c)).join('');

  switch (type) {
    case 'doc':
      return children;
    case 'paragraph':
      return `${children}\n\n`;
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 2));
      return `${'#'.repeat(level)} ${children}\n\n`;
    }
    case 'bulletList':
      return (
        (node.content ?? [])
          .map((li) => `- ${sopJsonToMarkdown(li).replace(/\n+$/, '')}\n`)
          .join('') + '\n'
      );
    case 'orderedList':
      return (
        (node.content ?? [])
          .map((li, i) => `${i + 1}. ${sopJsonToMarkdown(li).replace(/\n+$/, '')}\n`)
          .join('') + '\n'
      );
    case 'listItem':
      return children;
    case 'blockquote':
      return (
        children
          .split('\n')
          .map((line) => (line ? `> ${line}` : ''))
          .join('\n') + '\n'
      );
    case 'codeBlock': {
      const lang = (node.attrs?.language as string) || '';
      return `\`\`\`${lang}\n${children}\n\`\`\`\n\n`;
    }
    case 'horizontalRule':
      return '\n---\n\n';
    case 'hardBreak':
      return '  \n';
    case 'image': {
      const src = (node.attrs?.src as string) ?? '';
      const alt = (node.attrs?.alt as string) ?? '';
      return `![${alt}](${src})\n\n`;
    }
    case 'table': {
      // Render header row then body rows in pipe-table form.
      const rows = node.content ?? [];
      if (rows.length === 0) return '';
      const renderRow = (row: SopNode) =>
        '| ' +
        (row.content ?? [])
          .map((cell) => sopJsonToMarkdown(cell).replace(/\n/g, ' ').trim())
          .join(' | ') +
        ' |';
      const head = renderRow(rows[0]);
      const sep =
        '| ' +
        ((rows[0].content ?? []).map(() => '---').join(' | ')) +
        ' |';
      const body = rows.slice(1).map(renderRow).join('\n');
      return `${head}\n${sep}\n${body}\n\n`;
    }
    case 'tableRow':
    case 'tableHeader':
    case 'tableCell':
      return children;
    default:
      return children;
  }
}

// ── Plain-text renderer ────────────────────────────────────────────────────

export function sopJsonToPlainText(node: SopNode | undefined | null): string {
  if (!node) return '';
  if (node.type === 'text') return node.text ?? '';
  const children = (node.content ?? []).map((c) => sopJsonToPlainText(c)).join('');
  switch (node.type) {
    case 'paragraph':
    case 'heading':
    case 'listItem':
    case 'blockquote':
    case 'codeBlock':
      return children + '\n';
    case 'hardBreak':
      return '\n';
    case 'horizontalRule':
      return '\n---\n';
    default:
      return children;
  }
}

// ── HTML document wrapper ──────────────────────────────────────────────────
// Wraps the body HTML in a printable document with margins, fonts, and a
// watermark layer. Used by the export endpoint for HTML/PDF/DOCX outputs.

export function buildSopHtmlDocument(opts: {
  title: string;
  bodyHtml: string;
  pageSettings: SopPageSettings;
}): string {
  const ps = opts.pageSettings ?? {};
  const margins = ps.margins ?? { top: 25, right: 25, bottom: 25, left: 25 };
  const pageSize = ps.pageSize ?? 'A4';
  const orientation = ps.orientation ?? 'portrait';
  const fontFamily = ps.fontFamily ?? "'Inter', 'Noto Sans Tamil', sans-serif";
  const fontSize = `${ps.fontSizePt ?? 11}pt`;
  const lineHeight = String(ps.lineHeight ?? 1.5);
  const watermark = ps.watermark;

  const watermarkLayer = watermark
    ? `<div style="
         position:fixed;
         inset:0;
         display:flex;
         align-items:center;
         justify-content:center;
         pointer-events:none;
         z-index:0;
       ">
         <div style="
           font-size:120pt;
           color:rgba(0,0,0,${watermark.opacity ?? 0.07});
           transform:rotate(${watermark.angle ?? -30}deg);
           font-weight:700;
         ">${escapeHtml(watermark.text)}</div>
       </div>`
    : '';

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(opts.title)}</title>
<style>
  @page { size: ${pageSize} ${orientation}; margin: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm; }
  body { font-family: ${fontFamily}; font-size: ${fontSize}; line-height: ${lineHeight}; color: #111; margin: 0; }
  .sop-content { position: relative; z-index: 1; padding: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm; }
  h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin-top: 1.2em; }
  p { margin: 0 0 0.6em 0; }
  blockquote { border-left: 3px solid #ccc; padding-left: 12px; color: #555; margin: 0 0 0.6em 0; }
  pre { background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #999; padding: 6px 8px; vertical-align: top; }
  th { background: #f5f5f5; font-weight: 600; }
  img { max-width: 100%; height: auto; }
  hr { border: none; border-top: 1px solid #ddd; margin: 1em 0; }
  ul.task-list { list-style: none; padding-left: 0; }
  ul.task-list li { padding-left: 1.5em; position: relative; }
  ul.task-list li input { position: absolute; left: 0; top: 0.3em; }
</style>
</head>
<body>
  ${watermarkLayer}
  <main class="sop-content">${opts.bodyHtml}</main>
</body>
</html>`;
}
