/**
 * School fee receipt PDF — one A4 page carrying TWO A5 copies.
 *
 *   top half    (y 0 → 148.5mm)  Student Copy
 *   bottom half (y 148.5 → 297)  Institution Copy
 *
 * Deliberately separate from lib/utils/billing/receipt-pdf.ts rather than an
 * option on it: that renderer produces the college receipt, a financial
 * document already in daily use, and a shared "twoCopies" flag would put every
 * future school tweak one bug away from changing it.
 *
 * PRINTED BLACK AND WHITE on an office printer. There is no colour anywhere in
 * this document by design — no accent fills, no coloured text. Anything that
 * needs emphasis uses weight, rule thickness or a black fill, all of which
 * survive a mono printer and a photocopier. Do not reintroduce a brand colour.
 *
 * Two constraints inherited from jsPDF, both load-bearing:
 *   * The document is set in TIMES ('times' is one of jsPDF's built-in
 *     families, so Times New Roman needs no font embedding and adds nothing
 *     to the bundle).
 *   * Money is formatted "Rs. 1,234", never "₹1,234". The built-in families
 *     are WinAnsi / CP1252 only, so U+20B9 renders as garbage. Do not "fix"
 *     this by switching back to Intl's ₹ glyph.
 *
 * Browser-only: doc.save() needs `document`, so this cannot run in a server
 * action. The institution logo must be handed in as a data URL — jsPDF cannot
 * fetch a remote image synchronously (see fetchLogoDataUrl below).
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── A4 geometry, in mm ──────────────────────────────────────────────────────
const PAGE_W = 210;
const HALF_H = 148.5;
const MARGIN_X = 12;
/** Outer frame inset. Sits just outside MARGIN_X so content never touches it. */
const FRAME_X = 7;

/** Every text run in the document. See the header note on font embedding. */
const FONT = 'times';

/**
 * Letterhead mark used when institutions.logo_url is empty. Served from
 * /public, so it is same-origin and always fetchable.
 */
const FALLBACK_LOGO_URL = '/jkkn_logo.png';

export interface SchoolReceiptBranding {
  /** institutions.name */
  name: string;
  /** institutions.address_line1..3, blanks already dropped. */
  addressLines: string[];
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  /**
   * Pre-fetched data: URL for institutions.logo_url. Pass null to render the
   * receipt without a logo — never a remote URL, which jsPDF cannot resolve.
   */
  logoDataUrl?: string | null;
}

export interface SchoolReceiptLearner {
  name: string;
  rollNumber?: string | null;
  registerNumber?: string | null;
  className?: string | null;
  sectionName?: string | null;
  fatherName?: string | null;
  mobile?: string | null;
}

export interface SchoolReceiptLine {
  category: string;
  termLabel?: string | null;
  /** Short handle for the bill row. */
  billReference?: string | null;
  dueDate?: string | null;
  amount: number;
}

export interface SchoolReceiptPayload {
  receiptNumber: string;
  /** Date the receipt was raised. Date only — the counter does not print a time. */
  receiptDate: string;
  academicYearName: string;
  /** Display label — "Cash" / "DD" / "NEFT" / "Online". */
  paymentModeLabel: string;
  referenceNumber?: string | null;
  /** When the payer says the money left their hands. */
  transactionDate?: string | null;
  /** When it credited to the institution account. Non-cash only. */
  dateOfCredit?: string | null;
  ddBankName?: string | null;
  ddBranch?: string | null;
  remitterName?: string | null;
  amountPaid: number;
  /** Who handed the money over. Printed as "Received from". */
  payerName?: string | null;
  /**
   * What this learner still owes for the year AFTER this payment. Optional
   * because a reprint cannot reconstruct it — balances have moved on since.
   */
  balanceAfter?: number | null;
  collectedBy?: string | null;
  remarks?: string | null;
  learner: SchoolReceiptLearner;
  lines: SchoolReceiptLine[];
  branding: SchoolReceiptBranding;
  /** Stamped on a re-issued copy so it cannot pass as a fresh receipt. */
  isReprint?: boolean;
}

// ── formatting ──────────────────────────────────────────────────────────────

function formatINR(amount: number | null | undefined): string {
  const value = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);
  return `Rs. ${value}`;
}

// Fixed 3-letter months. Intl's en-IN 'short' gives "Sept" for September but
// "Aug"/"Jun" for the rest, so a column of dates came out ragged.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(date?: string | null): string {
  if (!date) return '-';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return TENS[t] + (o ? ' ' + ONES[o] : '');
}

/**
 * Indian numbering system: crore / lakh / thousand / hundred.
 *
 * Written here rather than pulled from a package because the only existing
 * in-repo helper (internal-marks-pdf numberToWords) spells digits out one by
 * one — "ONE TWO THREE" — which is meaningless on a money receipt.
 */
export function amountInWords(amount: number): string {
  const rupees = Math.floor(Math.abs(Number(amount) || 0));
  const paise = Math.round((Math.abs(Number(amount) || 0) - rupees) * 100);

  if (rupees === 0 && paise === 0) return 'Rupees Zero Only';

  const parts: string[] = [];
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const hundred = Math.floor((rupees % 1000) / 100);
  const rest = rupees % 100;

  if (crore) parts.push(`${twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest) parts.push(twoDigits(rest));

  let words = `Rupees ${parts.join(' ').trim()}`;
  if (paise > 0) words += ` and ${twoDigits(paise)} Paise`;
  return `${words} Only`;
}

/**
 * jsPDF needs the image FORMAT and guesses nothing. Hardcoding 'PNG' silently
 * failed for JPEG logos, which is how a correctly configured logo could still
 * come out blank. Read the format back off the data: URL instead.
 */
function imageFormatOf(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' {
  const mime = /^data:image\/([a-z0-9.+-]+)/i.exec(dataUrl)?.[1]?.toLowerCase();
  if (mime === 'jpeg' || mime === 'jpg') return 'JPEG';
  if (mime === 'webp') return 'WEBP';
  return 'PNG';
}

// ── fitting ─────────────────────────────────────────────────────────────────

/**
 * One rung of the type ladder.
 *
 * Every vertical dimension in a copy derives from these five numbers, so the
 * whole layout scales coherently instead of individual bits being nudged.
 */
interface Scale {
  body: number;
  table: number;
  infoPad: number;
  tablePad: number;
  lineGap: number;
}

/**
 * Largest first. The receipt is set at the biggest rung that still clears the
 * signature strip.
 */
const SCALES: Scale[] = [
  { body: 10, table: 10, infoPad: 1.25, tablePad: 2.2, lineGap: 4.8 },
  { body: 9.5, table: 9.5, infoPad: 1.1, tablePad: 1.9, lineGap: 4.5 },
  { body: 9, table: 9, infoPad: 1.0, tablePad: 1.7, lineGap: 4.2 },
  { body: 8.5, table: 8.5, infoPad: 0.9, tablePad: 1.5, lineGap: 4.0 },
  { body: 8, table: 8, infoPad: 0.8, tablePad: 1.3, lineGap: 3.8 },
  { body: 7.5, table: 7.5, infoPad: 0.7, tablePad: 1.1, lineGap: 3.5 },
  { body: 7, table: 7, infoPad: 0.6, tablePad: 0.9, lineGap: 3.2 },
  { body: 6.5, table: 6.5, infoPad: 0.5, tablePad: 0.8, lineGap: 3.0 },
];

/** Body must end above this, or it runs into the signature strip. */
const BODY_LIMIT = HALF_H - 13.5;

/**
 * Choose the largest type scale whose body actually fits.
 *
 * Measured, not estimated. Row heights depend on wrapping, which depends on
 * the learner's name length, the guardian's name, how many optional rows are
 * populated and how many fee heads were paid — a lookup table keyed on counts
 * got this wrong by 15mm in testing and printed "Received from" on top of
 * "Collected by". Drawing onto a scratch document and reading the real finalY
 * is the only way to know.
 *
 * Costs one throwaway jsPDF per rung tried. These documents are a few KB and
 * build in single-digit milliseconds, so this is not worth optimising.
 */
export function fitScale(payload: SchoolReceiptPayload): Scale {
  for (const scale of SCALES) {
    const scratch = new jsPDF({ unit: 'mm', format: 'a4' });
    scratch.setFont(FONT, 'normal');
    const endY = drawCopy(scratch, payload, 0, 'STUDENT COPY', scale);
    if (endY <= BODY_LIMIT) return scale;
  }
  // Nothing fit. Returns the smallest rung and lets the copy run long rather
  // than dropping fee heads — a receipt that is cramped is recoverable, one
  // that silently omits a line the payer was charged for is not. In practice
  // this needs roughly 15+ fee heads on a single receipt.
  return SCALES[SCALES.length - 1];
}

// ── one A5 copy ─────────────────────────────────────────────────────────────

/**
 * Draw one copy into the half-page starting at `top`.
 *
 * Everything is positioned relative to `top` so the same routine paints the
 * student half and the institution half — the copies are identical apart from
 * the label, which is what makes them a matched pair.
 */
function drawCopy(
  doc: jsPDF,
  payload: SchoolReceiptPayload,
  top: number,
  copyLabel: string,
  scale: Scale,
): number {
  const { branding, learner } = payload;
  const bodySize = scale.body;
  const tableSize = scale.table;

  let y = top + 10;

  // ─── Frame ───────────────────────────────────────────────────────────────
  // A short receipt leaves the bottom of its half-page empty no matter what.
  // The frame turns that into a deliberate margin instead of an unfinished
  // page, and gives whoever cuts the sheet an edge to align to.
  doc.setDrawColor(120);
  doc.setLineWidth(0.4);
  doc.roundedRect(FRAME_X, top + 4, PAGE_W - FRAME_X * 2, HALF_H - 9, 2, 2, 'S');

  // ─── Letterhead ──────────────────────────────────────────────────────────
  const logo = branding.logoDataUrl;
  if (logo) {
    try {
      // Fit inside a box, preserving the source aspect ratio. The old fixed
      // 19x19 squashed every non-square logo — jkkn_logo.png is 208x132, so it
      // was rendering visibly stretched.
      const boxW = 26;
      const boxH = 17;
      const props = doc.getImageProperties(logo);
      const ratio = Math.min(boxW / props.width, boxH / props.height);
      const drawW = props.width * ratio;
      const drawH = props.height * ratio;
      doc.addImage(
        logo,
        imageFormatOf(logo),
        MARGIN_X,
        top + 6 + (boxH - drawH) / 2,
        drawW,
        drawH,
      );
    } catch {
      // A malformed data URL must not cost the counter its receipt.
    }
  }

  doc.setTextColor(0);
  doc.setFont(FONT, 'bold');
  doc.setFontSize(16);
  doc.text(branding.name || 'School', PAGE_W / 2, y, { align: 'center' });
  y += 5.2;

  doc.setFont(FONT, 'normal');
  doc.setFontSize(9.5);

  // institutions.address_line1 frequently repeats the institution name, which
  // printed the school's name twice, stacked. Drop any line that IS the name,
  // then set the rest on ONE line — three stacked fragments spent vertical
  // space the bill table needs.
  const normalise = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');
  const nameKey = normalise(branding.name || '');
  const address = branding.addressLines
    .map((line) => line.trim().replace(/[,.]\s*$/, ''))
    .filter((line) => line && normalise(line) !== nameKey)
    .join('. ');

  if (address) {
    doc.text(address, PAGE_W / 2, y, { align: 'center' });
    y += 4.2;
  }

  const contact = [branding.phone, branding.email, branding.website].filter(Boolean).join(' | ');
  if (contact) {
    doc.text(contact, PAGE_W / 2, y, { align: 'center' });
    y += 4.2;
  }

  y += 0.8;
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
  y += 5.2;

  // ─── Title + copy label ──────────────────────────────────────────────────
  doc.setFont(FONT, 'bold');
  doc.setFontSize(12.5);
  doc.text('FEE PAYMENT RECEIPT', PAGE_W / 2, y, { align: 'center' });

  // Outlined chip on white, matching the DUPLICATE stamp opposite it. Black
  // text on white survives a fax, a fading toner cartridge and a third-
  // generation photocopy; reversed-out white text on a solid block is the
  // first thing to fill in and turn illegible.
  doc.setFontSize(8.5);
  doc.setTextColor(0);
  // Three channels, not setFillColor(255): jsPDF's single-argument overload is
  // typed as a CSS colour STRING, so the shorthand does not compile.
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  const labelW = doc.getTextWidth(copyLabel) + 7;
  // 'FD' = fill then draw. The white fill is not decorative: it keeps the rule
  // running under the header from showing through the chip.
  doc.roundedRect(PAGE_W - MARGIN_X - labelW, y - 4.4, labelW, 6.2, 1, 1, 'FD');
  doc.text(copyLabel, PAGE_W - MARGIN_X - labelW / 2, y - 0.1, { align: 'center' });

  if (payload.isReprint) {
    // Outlined rather than coloured — red would photocopy to indistinct grey.
    doc.setFont(FONT, 'bold');
    doc.setFontSize(8.5);
    const dupW = doc.getTextWidth('DUPLICATE') + 5;
    doc.setDrawColor(0);
    doc.setLineWidth(0.4);
    doc.roundedRect(MARGIN_X, y - 4.4, dupW, 6.2, 1, 1, 'S');
    doc.text('DUPLICATE', MARGIN_X + dupW / 2, y - 0.1, { align: 'center' });
    doc.setFont(FONT, 'normal');
  }
  y += 5.4;

  // ─── Learner (left) + payment (right) ────────────────────────────────────
  // Two plain autoTables side by side. A single 4-column table would let a
  // long school name in one cell push the payment column off the half-page.
  const classLine = [learner.className, learner.sectionName].filter(Boolean).join(' - ') || '-';

  // Only rows that SAY something. Printing "Roll No  -" and "Register No  -"
  // together spends two lines telling the reader nothing, on a half-page where
  // vertical space is the scarce resource.
  const learnerRows: Array<[string, string]> = [['Student', learner.name || '-']];
  if (learner.rollNumber) learnerRows.push(['Roll No', learner.rollNumber]);
  if (learner.registerNumber) learnerRows.push(['Register No', learner.registerNumber]);
  learnerRows.push(['Class', classLine]);
  learnerRows.push(['Academic Year', payload.academicYearName || '-']);
  if (learner.fatherName) learnerRows.push(['Parent/Guardian', learner.fatherName]);
  if (learner.mobile) learnerRows.push(['Mobile', learner.mobile]);

  const paymentRows: Array<[string, string]> = [
    ['Receipt No', payload.receiptNumber],
    ['Receipt Date', formatDate(payload.receiptDate)],
    ['Payment Mode', payload.paymentModeLabel],
  ];
  if (payload.referenceNumber) paymentRows.push(['Reference No', payload.referenceNumber]);
  if (payload.transactionDate) paymentRows.push(['Txn Date', formatDate(payload.transactionDate)]);
  // The whole reason date_of_credit exists as its own column — finance
  // reconciles on this, not on the transaction date.
  if (payload.dateOfCredit) paymentRows.push(['Date of Credit', formatDate(payload.dateOfCredit)]);
  if (payload.ddBankName) paymentRows.push(['Bank', payload.ddBankName]);
  if (payload.ddBranch) paymentRows.push(['Branch', payload.ddBranch]);
  if (payload.remitterName) paymentRows.push(['Remitter', payload.remitterName]);

  const halfW = (PAGE_W - MARGIN_X * 2) / 2;
  const infoStyles = {
    font: FONT,
    fontSize: bodySize,
    cellPadding: scale.infoPad,
    textColor: 0,
  } as const;

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN_X },
    tableWidth: halfW - 4,
    theme: 'plain',
    styles: infoStyles,
    // 32mm, not 27: "Parent/Guardian" wrapped onto a second line at 10pt
    // Times, which broke the row rhythm and pushed the footer into the body.
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 32 }, 1: { cellWidth: 'auto' } },
    body: learnerRows,
  });
  const leftEnd = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN_X + halfW + 4 },
    tableWidth: halfW - 4,
    theme: 'plain',
    styles: infoStyles,
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 32 }, 1: { cellWidth: 'auto' } },
    body: paymentRows,
  });
  const rightEnd = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  y = Math.max(leftEnd, rightEnd) + 4;

  // ─── Bill lines ──────────────────────────────────────────────────────────
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN_X, right: MARGIN_X },
    theme: 'grid',
    head: [['#', 'Fee Head', 'Term', 'Bill Ref', 'Due Date', 'Amount']],
    // Light fill with black text, not a solid black band. A heavy black header
    // costs toner on every receipt, bleeds on cheap paper, and is the first
    // thing to smear on a photocopy — the rule beneath it carries the
    // separation just as well.
    headStyles: {
      fillColor: [238, 238, 238],
      textColor: 0,
      fontStyle: 'bold',
      font: FONT,
      fontSize: tableSize,
      lineColor: [90, 90, 90],
      lineWidth: 0.25,
    },
    styles: {
      font: FONT,
      fontSize: tableSize,
      cellPadding: scale.tablePad,
      textColor: 0,
      lineColor: [130, 130, 130],
      lineWidth: 0.15,
    },
    columnStyles: {
      0: { cellWidth: 9, halign: 'center' },
      2: { cellWidth: 20 },
      3: { cellWidth: 26 },
      4: { cellWidth: 28 },
      5: { cellWidth: 30, halign: 'right' },
    },
    body: payload.lines.map((line, i) => [
      String(i + 1),
      line.category,
      line.termLabel || '-',
      line.billReference || '-',
      formatDate(line.dueDate),
      formatINR(line.amount),
    ]),
    foot: [['', '', '', '', 'Total Paid', formatINR(payload.amountPaid)]],
    footStyles: {
      fillColor: [232, 232, 232],
      textColor: 0,
      fontStyle: 'bold',
      font: FONT,
      halign: 'right',
      fontSize: tableSize,
    },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;

  // ─── Amount in words + payer context ─────────────────────────────────────
  const labelCol = 34;
  const lineGap = scale.lineGap;

  doc.setTextColor(0);
  doc.setFont(FONT, 'bold');
  doc.setFontSize(bodySize);
  doc.text('Amount in words:', MARGIN_X, y);
  doc.setFont(FONT, 'normal');
  const wordLines = doc.splitTextToSize(
    amountInWords(payload.amountPaid),
    PAGE_W - MARGIN_X * 2 - labelCol,
  );
  doc.text(wordLines, MARGIN_X + labelCol, y);
  y += wordLines.length * lineGap;

  // "Received from" and "Balance" share ONE line. Both are short, and on a
  // half-page every reclaimed line is another fee head that can be set at a
  // readable size instead of shrinking the whole receipt.
  const payer = payload.payerName;
  const balance =
    payload.balanceAfter == null
      ? null
      : payload.balanceAfter > 0
        ? `${formatINR(payload.balanceAfter)} still outstanding`
        : 'Nil - fully paid for the year';

  if (payer || balance) {
    // A fee receipt is proof for the PAYER, so naming them matters more here
    // than it would on an internal ledger print.
    if (payer) {
      doc.setFont(FONT, 'bold');
      doc.text('Received from:', MARGIN_X, y);
      doc.setFont(FONT, 'normal');
      doc.text(payer, MARGIN_X + labelCol, y);
    }
    // The question every parent asks next: "so what's still due?"
    if (balance) {
      // Offset MEASURED from the rendered label, not a guessed constant. The
      // fixed 30mm was narrower than "Balance for the year:" at 10pt Times, so
      // the value printed hard against the colon: "...the year:Rs. 27,100".
      // getTextWidth tracks whatever size fitScale() settled on.
      const rightLabelX = PAGE_W / 2 + 8;
      const rightLabel = 'Balance for the year:';
      doc.setFont(FONT, 'bold');
      doc.text(rightLabel, rightLabelX, y);
      const gap = doc.getTextWidth(rightLabel) + 2;
      doc.setFont(FONT, 'normal');
      doc.text(balance, rightLabelX + gap, y);
    }
    y += lineGap;
  }

  if (payload.remarks) {
    doc.setFont(FONT, 'bold');
    doc.text('Remarks:', MARGIN_X, y);
    doc.setFont(FONT, 'normal');
    const remarkLines = doc.splitTextToSize(
      payload.remarks,
      PAGE_W - MARGIN_X * 2 - labelCol,
    );
    doc.text(remarkLines.slice(0, 2), MARGIN_X + labelCol, y);
    y += Math.min(remarkLines.length, 2) * lineGap;
  }

  // Where the body actually ended. fitScale() reads this back to decide
  // whether this type scale fits.
  const bodyEnd = y;

  // ─── Signature strip ─────────────────────────────────────────────────────
  // Pinned to the bottom of the half so both copies line up. fitScale() has
  // already guaranteed the body clears it, so this is a fixed anchor rather
  // than a negotiation with the content above.
  //
  // The boilerplate note shares the "Collected by" baseline instead of taking
  // a third line of its own — it is the least important text on the page and
  // was costing the fee table a whole row.
  const footY = top + HALF_H - 12;
  doc.setFont(FONT, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.text(`Collected by: ${payload.collectedBy || '-'}`, MARGIN_X, footY);
  doc.text('Authorised Signatory', PAGE_W - MARGIN_X, footY, { align: 'right' });
  doc.setDrawColor(90);
  doc.setLineWidth(0.3);
  doc.line(PAGE_W - MARGIN_X - 48, footY + 5, PAGE_W - MARGIN_X, footY + 5);

  doc.setFontSize(7.5);
  doc.setTextColor(90);
  doc.text('This is a computer-generated receipt.', MARGIN_X, footY + 5);
  doc.setTextColor(0);

  return bodyEnd;
}

/**
 * Build (but do not save) the two-copy receipt.
 * Exported separately so print and download share one layout.
 */
export function generateSchoolReceiptPdf(payload: SchoolReceiptPayload): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFont(FONT, 'normal');

  // Fitted ONCE and shared by both halves. Measuring each copy separately
  // could set the student copy a rung larger than the institution copy, and a
  // matched pair that does not match is worse than a slightly smaller one.
  const scale = fitScale(payload);

  drawCopy(doc, payload, 0, 'STUDENT COPY', scale);

  // Tear line. Dashed so it reads as "cut here" rather than as a table border.
  doc.setDrawColor(120);
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([2, 1.5], 0);
  doc.line(0, HALF_H, PAGE_W, HALF_H);
  doc.setLineDashPattern([], 0);

  doc.setFont(FONT, 'normal');
  doc.setFontSize(7);
  doc.setTextColor(120);
  doc.text('- - - cut here - - -', PAGE_W / 2, HALF_H - 1.4, { align: 'center' });
  doc.setTextColor(0);

  drawCopy(doc, payload, HALF_H, 'INSTITUTION COPY', scale);

  return doc;
}

/**
 * Filename for the downloaded receipt.
 *
 * "JASHMIKA S R & Standard 2 - A & 2026-2027.pdf"
 *
 * Named for a human scanning a downloads folder, not for a machine: a clerk
 * taking thirty payments a day cannot tell one "fee-receipt-RCP-2026-006283"
 * from the next, but they can find a learner by name and class.
 *
 * NOTE: this deliberately carries no receipt number, so two payments by the
 * same learner in the same year produce the same name and the browser
 * de-duplicates with "(1)", "(2)". Add payload.receiptNumber to `parts` if
 * that becomes a problem.
 */
export function schoolReceiptFileName(payload: SchoolReceiptPayload): string {
  const classLine = [payload.learner.className, payload.learner.sectionName]
    .filter(Boolean)
    .join(' - ');

  const parts = [payload.learner.name, classLine, payload.academicYearName]
    .map((part) => (part || '').trim())
    .filter(Boolean);

  // Strip what Windows and macOS refuse in a filename, plus control
  // characters, then collapse the whitespace that removing them leaves
  // behind. A nicer name is never worth a failed save.
  const safe = parts
    .join(' & ')
    .replace(/[\/:*?"<>| -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return `${safe || `fee-receipt-${payload.receiptNumber}`}.pdf`;
}

/** Generate and trigger a browser download. */
export function downloadSchoolReceiptPdf(payload: SchoolReceiptPayload): void {
  generateSchoolReceiptPdf(payload).save(schoolReceiptFileName(payload));
}

/** Generate and open the browser print dialog, without downloading a file. */
export function printSchoolReceiptPdf(payload: SchoolReceiptPayload): void {
  const doc = generateSchoolReceiptPdf(payload);
  doc.autoPrint();
  const url = doc.output('bloburl');
  window.open(url as unknown as string, '_blank');
}

/**
 * Turn institutions.logo_url into a data URL for embedding.
 *
 * jsPDF's addImage cannot fetch a remote URL, so the caller must resolve it
 * first. Resolves to null on any failure — a missing logo degrades the receipt
 * to a text letterhead, which is far better than failing the payment flow at
 * the last step.
 */
export async function fetchLogoDataUrl(logoUrl?: string | null): Promise<string | null> {
  // Falls back to the bundled group mark when the institution has no logo_url
  // configured. Same-origin, so unlike a remote logo_url it needs no CORS
  // header and cannot fail on someone else's server.
  const url = logoUrl || FALLBACK_LOGO_URL;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
