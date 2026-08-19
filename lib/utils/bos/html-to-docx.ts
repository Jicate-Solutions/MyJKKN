// lib/utils/bos/html-to-docx.ts
// ============================================================================
// Tiptap HTML → docx blocks.
//
// The BoS minutes narrative is authored in the rich-text editor and stored as
// HTML. The PDF hands that markup to Chromium, which renders it properly. The
// Word export used to run it through stripHtml() and emit one flat run of text
// per paragraph, so a document that reads as headings, a rates table and a
// bulleted list in the PDF arrived in Word as an undifferentiated wall of
// prose. This module closes that gap: it walks the markup and emits the docx
// equivalent — paragraphs with their alignment, headings, lists, tables with
// borders and column widths, images, and the character marks the ribbon can
// apply (bold, italic, underline, strike, sub/superscript, highlight, colour,
// font family, font size).
//
// PARSING. The Word download is produced in the browser (documents-tab.tsx and
// the bulk export both lazy-import the generator client-side), so DOMParser is
// the parser. Callers on the server get `null` from parseHtml and the minutes
// generator falls back to its old plain-text path rather than throwing — a
// degraded export beats a failed one.
//
// UNITS. Word measures character size in half-points and layout in twips
// (1/20 pt). CSS gives us px for anything the stylesheet sets and pt for
// anything the editor's size dropdown sets, hence the two converters below.

import {
  AlignmentType,
  BorderStyle,
  ImageRun,
  LineRuleType,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
  convertMillimetersToTwip,
} from 'docx';

export type DocxBlock = Paragraph | Table;

/** CSS pt → docx half-points. The editor's size dropdown writes `14pt`. */
const ptToHalfPt = (pt: number) => Math.max(2, Math.round(pt * 2));
/** CSS px → docx half-points (1px = 0.75pt). */
const pxToHalfPt = (px: number) => Math.max(2, Math.round(px * 1.5));
/** CSS px → twips (1px = 0.75pt = 15 twips). */
const pxToTwip = (px: number) => Math.round(px * 15);

const THIN_BORDER = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const ALL_BORDERS = {
  top: THIN_BORDER,
  bottom: THIN_BORDER,
  left: THIN_BORDER,
  right: THIN_BORDER,
};

/** Matches the PDF's `th { background: #d3d3d3 }`. */
const HEADER_SHADING = 'D3D3D3';

export interface HtmlToDocxOptions {
  /** Default font for text that carries no font-family of its own. */
  font: string;
  /** Default size in half-points, i.e. the stylesheet's base size. */
  size: number;
  /** Usable width between the margins, in twips — tables are scaled into it. */
  contentWidthDxa: number;
  /** Line spacing applied to running text, e.g. 360 for 1.5 lines. */
  line?: number;
}

/** Character-level formatting carried down the tree. */
interface RunStyle {
  font: string;
  size: number;
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  strike?: boolean;
  superScript?: boolean;
  subScript?: boolean;
  color?: string;
  highlight?: boolean;
}

// ── CSS helpers ──────────────────────────────────────────────────────────────

function parseStyle(el: Element): Record<string, string> {
  const raw = el.getAttribute('style');
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const decl of raw.split(';')) {
    const i = decl.indexOf(':');
    if (i === -1) continue;
    out[decl.slice(0, i).trim().toLowerCase()] = decl.slice(i + 1).trim();
  }
  return out;
}

/** '#1a7a3d' | '#abc' | 'rgb(26, 122, 61)' → '1A7A3D'. Anything else: null. */
function parseColor(value?: string): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const h = hex[1];
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return full.toUpperCase();
  }
  const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(v);
  if (rgb) {
    return [rgb[1], rgb[2], rgb[3]]
      .map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  }
  return undefined;
}

/** '14pt' | '18px' | '1.2em' → half-points, relative to the inherited size. */
function parseFontSize(value: string | undefined, inherited: number): number | undefined {
  if (!value) return undefined;
  const m = /^([\d.]+)\s*(pt|px|em|rem)?$/i.exec(value.trim());
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  switch ((m[2] ?? 'px').toLowerCase()) {
    case 'pt':
      return ptToHalfPt(n);
    case 'em':
    case 'rem':
      return Math.round(inherited * n);
    default:
      return pxToHalfPt(n);
  }
}

/** '"Times New Roman", serif' → 'Times New Roman'. */
function parseFontFamily(value?: string): string | undefined {
  if (!value) return undefined;
  const first = value.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '');
  return first || undefined;
}

function parseAlign(value?: string): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
  switch (value?.trim().toLowerCase()) {
    case 'center':
      return AlignmentType.CENTER;
    case 'right':
      return AlignmentType.RIGHT;
    case 'justify':
      return AlignmentType.JUSTIFIED;
    case 'left':
      return AlignmentType.LEFT;
    default:
      return undefined;
  }
}

/** Fold an element's tag and inline style into the inherited character style. */
function extendRunStyle(el: Element, inherited: RunStyle): RunStyle {
  const tag = el.tagName.toLowerCase();
  const css = parseStyle(el);
  const next: RunStyle = { ...inherited };

  switch (tag) {
    case 'strong':
    case 'b':
      next.bold = true;
      break;
    case 'em':
    case 'i':
      next.italics = true;
      break;
    case 'u':
      next.underline = true;
      break;
    case 's':
    case 'strike':
    case 'del':
      next.strike = true;
      break;
    case 'sup':
      next.superScript = true;
      break;
    case 'sub':
      next.subScript = true;
      break;
    case 'mark':
      next.highlight = true;
      break;
    case 'code':
    case 'pre':
      next.font = 'Courier New';
      break;
    default:
      break;
  }

  const weight = css['font-weight'];
  if (weight) next.bold = weight === 'bold' || Number(weight) >= 600;
  if (css['font-style'] === 'italic') next.italics = true;
  const decoration = css['text-decoration'] ?? css['text-decoration-line'];
  if (decoration?.includes('underline')) next.underline = true;
  if (decoration?.includes('line-through')) next.strike = true;

  const family = parseFontFamily(css['font-family']);
  if (family) next.font = family;
  const size = parseFontSize(css['font-size'], inherited.size);
  if (size) next.size = size;
  const color = parseColor(css['color']);
  if (color) next.color = color;
  if (css['background-color'] && css['background-color'] !== 'transparent') next.highlight = true;

  return next;
}

// ── Images ───────────────────────────────────────────────────────────────────

type ImageType = 'png' | 'jpg' | 'gif' | 'bmp';

function decodeDataUrl(src: string): { bytes: Uint8Array; type: ImageType } | null {
  const m = /^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/i.exec(src.trim());
  if (!m) return null;
  const kind = m[1].toLowerCase();
  const type: ImageType = kind === 'png' ? 'png' : kind === 'gif' ? 'gif' : kind === 'bmp' ? 'bmp' : 'jpg';
  try {
    const b64 = m[2];
    let bytes: Uint8Array;
    if (typeof atob === 'function') {
      const bin = atob(b64);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      bytes = new Uint8Array(Buffer.from(b64, 'base64'));
    }
    return { bytes, type };
  } catch {
    return null;
  }
}

/**
 * Word needs explicit pixel dimensions, so read them out of the file itself
 * rather than guessing a ratio and stretching the picture. PNG carries them in
 * the IHDR chunk; JPEG in the first SOFn marker. Anything unreadable falls back
 * to a square, which is wrong but visible — better than a zero-sized image.
 */
function imageSize(bytes: Uint8Array, type: ImageType): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (type === 'png' && bytes.length > 24) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (type === 'jpg') {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = bytes[offset + 1];
      // SOF0..SOF15, excluding the non-frame markers DHT (c4), JPG (c8), DAC (cc).
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
      }
      offset += 2 + view.getUint16(offset + 2);
    }
  }
  return { width: 300, height: 300 };
}

function imageRun(el: Element, maxWidthPx: number): ImageRun | null {
  const decoded = decodeDataUrl(el.getAttribute('src') ?? '');
  if (!decoded) return null;

  const natural = imageSize(decoded.bytes, decoded.type);
  const attrW = Number(el.getAttribute('width'));
  const cssW = parseFloat(parseStyle(el)['width'] ?? '');
  const wanted = Number.isFinite(attrW) && attrW > 0 ? attrW : Number.isFinite(cssW) && cssW > 0 ? cssW : natural.width;
  const scale = Math.min(1, maxWidthPx / Math.max(1, wanted)) * (wanted / Math.max(1, natural.width));

  return new ImageRun({
    type: decoded.type,
    data: decoded.bytes,
    transformation: {
      width: Math.max(1, Math.round(natural.width * scale)),
      height: Math.max(1, Math.round(natural.height * scale)),
    },
  });
}

// ── Conversion ───────────────────────────────────────────────────────────────

const BLOCK_TAGS = new Set([
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'table', 'blockquote', 'hr', 'pre',
]);

/** Heading sizes mirror the PDF's `.narrative h1..h6` rules, in px. */
const HEADING_PX: Record<string, number> = { h1: 15, h2: 13, h3: 12, h4: 11, h5: 11, h6: 11 };

class Converter {
  private readonly opts: Required<HtmlToDocxOptions>;

  constructor(opts: HtmlToDocxOptions) {
    this.opts = { line: 360, ...opts };
  }

  private get baseStyle(): RunStyle {
    return { font: this.opts.font, size: this.opts.size };
  }

  /** Inline children → docx runs, recursing through nested marks. */
  private runs(node: Node, style: RunStyle, maxWidthPx: number): (TextRun | ImageRun)[] {
    const out: (TextRun | ImageRun)[] = [];

    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3 /* text */) {
        // Collapse whitespace the way HTML does; markup is pretty-printed and
        // the newlines between tags are not content.
        const text = (child.textContent ?? '').replace(/\s+/g, ' ');
        if (!text) continue;
        out.push(
          new TextRun({
            text,
            font: style.font,
            size: style.size,
            bold: style.bold,
            italics: style.italics,
            underline: style.underline ? {} : undefined,
            strike: style.strike,
            superScript: style.superScript,
            subScript: style.subScript,
            color: style.color,
            highlight: style.highlight ? 'yellow' : undefined,
          }),
        );
        continue;
      }
      if (child.nodeType !== 1 /* element */) continue;

      const el = child as Element;
      const tag = el.tagName.toLowerCase();

      if (tag === 'br') {
        out.push(new TextRun({ text: '', break: 1, font: style.font, size: style.size }));
        continue;
      }
      if (tag === 'img') {
        const run = imageRun(el, maxWidthPx);
        if (run) out.push(run);
        continue;
      }
      out.push(...this.runs(el, extendRunStyle(el, style), maxWidthPx));
    }

    return out;
  }

  private paragraph(
    el: Element,
    style: RunStyle,
    opts: { indentTwip?: number; prefix?: string; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; widthDxa?: number },
  ): Paragraph {
    const widthDxa = opts.widthDxa ?? this.opts.contentWidthDxa;
    const maxWidthPx = Math.round((widthDxa - (opts.indentTwip ?? 0)) / 15);
    const runs = this.runs(el, style, maxWidthPx);
    if (opts.prefix) {
      runs.unshift(new TextRun({ text: opts.prefix, font: style.font, size: style.size, bold: style.bold }));
    }
    // An empty <p> is the editor's blank line; Word drops a run-less paragraph's
    // height, so give it one empty run to keep the author's spacing.
    if (runs.length === 0) {
      runs.push(new TextRun({ text: '', font: style.font, size: style.size }));
    }

    return new Paragraph({
      alignment: opts.align ?? parseAlign(parseStyle(el)['text-align']) ?? AlignmentType.LEFT,
      indent: opts.indentTwip ? { left: opts.indentTwip } : undefined,
      spacing: { after: 80, line: this.opts.line, lineRule: LineRuleType.AUTO },
      children: runs,
    });
  }

  /**
   * Column widths for a Tiptap table. The editor stores what the user dragged
   * as pixel widths on <col>; those are sized for the on-screen canvas, which
   * is wider than the page, so they are treated as proportions and scaled into
   * the available width. A table with no colgroup gets equal columns.
   */
  private columnWidths(table: Element, columns: number, availableDxa: number): number[] {
    const cols = Array.from(table.querySelectorAll('colgroup > col'));
    const declared = cols.map((c) => {
      const w = parseFloat(parseStyle(c)['width'] ?? c.getAttribute('width') ?? '');
      return Number.isFinite(w) && w > 0 ? w : 0;
    });

    const usable = declared.length === columns && declared.every((w) => w > 0) ? declared : null;
    if (!usable) {
      const even = Math.floor(availableDxa / columns);
      return Array.from({ length: columns }, () => even);
    }

    const total = usable.reduce((a, b) => a + b, 0);
    const scaled = usable.map((w) => Math.floor((w / total) * availableDxa));
    // Hand the rounding remainder to the last column so the row's widths sum to
    // exactly the table width; a short row makes Word re-autofit the whole grid.
    scaled[scaled.length - 1] += availableDxa - scaled.reduce((a, b) => a + b, 0);
    return scaled;
  }

  private table(el: Element, style: RunStyle, availableDxa: number): Table | null {
    const rowEls = Array.from(el.querySelectorAll('tr'));
    if (rowEls.length === 0) return null;

    const columns = Math.max(
      ...rowEls.map((tr) =>
        Array.from(tr.children).reduce(
          (n, cell) => n + Math.max(1, Number(cell.getAttribute('colspan') ?? 1)),
          0,
        ),
      ),
    );
    const widths = this.columnWidths(el, columns, availableDxa);

    const rows = rowEls.map((tr) => {
      let column = 0;
      const cells = Array.from(tr.children)
        .filter((c) => /^t[hd]$/i.test(c.tagName))
        .map((cellEl) => {
          const colSpan = Math.max(1, Number(cellEl.getAttribute('colspan') ?? 1));
          const rowSpan = Math.max(1, Number(cellEl.getAttribute('rowspan') ?? 1));
          const width = widths.slice(column, column + colSpan).reduce((a, b) => a + b, 0);
          column += colSpan;

          const isHeader = cellEl.tagName.toLowerCase() === 'th';
          const cellStyle = extendRunStyle(cellEl, { ...style, bold: style.bold || isHeader });
          const shading = parseColor(parseStyle(cellEl)['background-color']) ?? (isHeader ? HEADER_SHADING : undefined);

          return new TableCell({
            width: { size: width, type: WidthType.DXA },
            columnSpan: colSpan > 1 ? colSpan : undefined,
            rowSpan: rowSpan > 1 ? rowSpan : undefined,
            borders: ALL_BORDERS,
            shading: shading ? { fill: shading, type: 'clear', color: 'auto' } : undefined,
            children: this.blocks(cellEl, cellStyle, width, { inTableCell: true }),
          });
        });

      return new TableRow({ children: cells });
    });

    return new Table({
      width: { size: availableDxa, type: WidthType.DXA },
      columnWidths: widths,
      layout: TableLayoutType.FIXED,
      rows,
    });
  }

  /** Walk a container's children, emitting one block per block-level element. */
  blocks(
    root: Node,
    style: RunStyle,
    availableDxa: number,
    ctx: { indentTwip?: number; inTableCell?: boolean } = {},
  ): DocxBlock[] {
    const out: DocxBlock[] = [];
    const indentTwip = ctx.indentTwip ?? 0;
    /** Inline content sitting directly in a container gets its own paragraph. */
    let looseInline: Node[] = [];

    const flushLoose = () => {
      if (looseInline.length === 0) return;
      const holder = root.ownerDocument!.createElement('p');
      for (const n of looseInline) holder.appendChild(n.cloneNode(true));
      out.push(this.paragraph(holder, style, { indentTwip, widthDxa: availableDxa }));
      looseInline = [];
    };

    for (const child of Array.from(root.childNodes)) {
      if (child.nodeType === 3) {
        if ((child.textContent ?? '').trim()) looseInline.push(child);
        continue;
      }
      if (child.nodeType !== 1) continue;

      const el = child as Element;
      const tag = el.tagName.toLowerCase();

      if (!BLOCK_TAGS.has(tag)) {
        looseInline.push(el);
        continue;
      }
      flushLoose();

      switch (tag) {
        case 'table': {
          const table = this.table(el, style, availableDxa - indentTwip);
          if (table) {
            out.push(table);
            // Word glues consecutive tables together and to the text that
            // follows; a spacer paragraph keeps the PDF's 6px gap visible.
            out.push(new Paragraph({ spacing: { after: 0, before: 0 }, children: [new TextRun({ text: '', size: 8 })] }));
          }
          break;
        }
        case 'ul':
        case 'ol': {
          out.push(...this.list(el, style, availableDxa, indentTwip, tag === 'ol'));
          break;
        }
        case 'blockquote': {
          out.push(
            ...this.blocks(el, { ...style, color: style.color ?? '333333' }, availableDxa, {
              ...ctx,
              indentTwip: indentTwip + convertMillimetersToTwip(6),
            }),
          );
          break;
        }
        case 'hr': {
          out.push(
            new Paragraph({
              spacing: { before: 80, after: 80 },
              border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999', space: 1 } },
              children: [new TextRun({ text: '' })],
            }),
          );
          break;
        }
        case 'div': {
          // A bare div is a wrapper, not a paragraph — descend into it so its
          // children keep their own block identity.
          out.push(...this.blocks(el, extendRunStyle(el, style), availableDxa, ctx));
          break;
        }
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6': {
          const headingStyle = extendRunStyle(el, {
            ...style,
            bold: true,
            size: pxToHalfPt(HEADING_PX[tag]),
          });
          out.push(this.paragraph(el, headingStyle, { indentTwip, widthDxa: availableDxa }));
          break;
        }
        default: {
          out.push(this.paragraph(el, extendRunStyle(el, style), { indentTwip, widthDxa: availableDxa }));
        }
      }
    }

    flushLoose();

    // A table cell whose content produced nothing still needs a paragraph, or
    // Word treats the document as malformed and refuses to open it.
    if (ctx.inTableCell && out.length === 0) {
      out.push(new Paragraph({ children: [new TextRun({ text: '', font: style.font, size: style.size })] }));
    }
    return out;
  }

  /**
   * Lists are emitted as indented paragraphs with a literal marker rather than
   * a Word numbering definition. The marker is what the PDF draws, numbering
   * definitions have to be declared on the Document and restarting them per
   * list is fiddly, and this keeps a nested list rendering the same in both
   * exports.
   */
  private list(
    el: Element,
    style: RunStyle,
    availableDxa: number,
    indentTwip: number,
    ordered: boolean,
    depth = 0,
  ): DocxBlock[] {
    const out: DocxBlock[] = [];
    const items = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'li');
    const start = Number(el.getAttribute('start') ?? 1);
    const itemIndent = indentTwip + convertMillimetersToTwip(6) * (depth + 1);

    items.forEach((li, i) => {
      const marker = ordered ? `${start + i}. ` : depth % 2 === 0 ? '• ' : '◦ ';
      const liStyle = extendRunStyle(li, style);

      // An <li> holds either inline content or a <p> wrapper (Tiptap writes the
      // latter); either way the first line carries the marker and any nested
      // list is emitted after it.
      const nested = Array.from(li.children).filter((c) => /^[ou]l$/i.test(c.tagName));
      const holder = li.ownerDocument!.createElement('p');
      for (const n of Array.from(li.childNodes)) {
        if (n.nodeType === 1 && /^[ou]l$/i.test((n as Element).tagName)) continue;
        holder.appendChild(n.cloneNode(true));
      }

      out.push(
        this.paragraph(holder, liStyle, {
          indentTwip: itemIndent,
          prefix: marker,
          widthDxa: availableDxa,
        }),
      );

      for (const sub of nested) {
        out.push(
          ...this.list(sub, liStyle, availableDxa, indentTwip, sub.tagName.toLowerCase() === 'ol', depth + 1),
        );
      }
    });

    return out;
  }
}

/**
 * Parse a fragment of editor HTML. Returns null where no DOM is available (a
 * server render), letting the caller keep its plain-text fallback.
 */
function parseHtml(html: string): HTMLElement | null {
  if (typeof DOMParser === 'undefined') return null;
  try {
    const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html');
    return doc.getElementById('root');
  } catch {
    return null;
  }
}

/**
 * Convert stored editor HTML into docx blocks. Returns null when the markup
 * cannot be parsed in this environment, and an empty array when it parses to
 * nothing.
 */
export function htmlToDocxBlocks(html: string, opts: HtmlToDocxOptions): DocxBlock[] | null {
  const root = parseHtml(html);
  if (!root) return null;
  const converter = new Converter(opts);
  return converter.blocks(root, { font: opts.font, size: opts.size }, opts.contentWidthDxa);
}

export { pxToHalfPt, pxToTwip, ALL_BORDERS as DOCX_THIN_BORDERS, HEADER_SHADING as DOCX_HEADER_SHADING };
