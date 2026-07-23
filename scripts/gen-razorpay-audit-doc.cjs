/* Generates the consolidated Razorpay CollectNow security-audit submission
   document (Ticket #19383043) as a .docx. Real transaction data + verification
   logs are embedded; screenshots and a few merchant-only fields are left as
   clearly-labelled placeholders for the operator to complete before sending. */
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
  VerticalAlign, Footer, PageNumber, PageBreak,
} = require('docx');

const OUT = 'C:/Users/Admin/Downloads/JKKN-Razorpay-Audit-Submission.docx';

const BORDER = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const CELL = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const DASH = { style: BorderStyle.DASHED, size: 1, color: '999999' };
const DASHED = { top: DASH, bottom: DASH, left: DASH, right: DASH };

const runs = (c, base = {}) =>
  Array.isArray(c) ? c : [new TextRun({ text: String(c), ...base })];

const p = (c, o = {}) =>
  new Paragraph({
    spacing: { after: 120, ...(o.spacing || {}) },
    alignment: o.alignment,
    children: runs(c, o.run || {}),
  });

const FILL = (t) => new TextRun({ text: t, highlight: 'yellow', bold: true, size: 20 });

function codeBlock(obj) {
  const lines = JSON.stringify(obj, null, 2).split('\n');
  return new Table({
    columnWidths: [9360],
    width: { size: 9360, type: WidthType.DXA },
    rows: [new TableRow({ children: [new TableCell({
      borders: CELL,
      width: { size: 9360, type: WidthType.DXA },
      shading: { fill: 'F4F4F4', type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: lines.map((l) => new Paragraph({
        spacing: { after: 0 },
        children: [new TextRun({ text: l.length ? l : ' ', font: 'Courier New', size: 16, color: '1A1A1A' })],
      })),
    })] })],
  });
}

function shot(label) {
  return new Table({
    columnWidths: [9360],
    width: { size: 9360, type: WidthType.DXA },
    rows: [new TableRow({ children: [new TableCell({
      borders: DASHED,
      width: { size: 9360, type: WidthType.DXA },
      shading: { fill: 'FAFAFA', type: ShadingType.CLEAR },
      margins: { top: 300, bottom: 300, left: 180, right: 180 },
      verticalAlign: VerticalAlign.CENTER,
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: label, bold: true, color: '555555', size: 22 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '[ Paste screenshot here ]', italics: true, color: '999999', size: 20 })] }),
      ],
    })] })],
  });
}

function kv(rows, widths = [3120, 6240]) {
  return new Table({
    columnWidths: widths,
    width: { size: 9360, type: WidthType.DXA },
    margins: { top: 80, bottom: 80, left: 140, right: 140 },
    rows: rows.map((r) => new TableRow({ children: [
      new TableCell({ borders: CELL, width: { size: widths[0], type: WidthType.DXA }, shading: { fill: 'F0F4F8', type: ShadingType.CLEAR }, children: [new Paragraph({ children: runs(r[0], { bold: true, size: 20 }) })] }),
      new TableCell({ borders: CELL, width: { size: widths[1], type: WidthType.DXA }, children: [new Paragraph({ children: runs(r[1], { size: 20 }) })] }),
    ] })),
  });
}

function headerRow(labels, widths, fill = 'D5E8F0') {
  return new TableRow({ tableHeader: true, children: labels.map((t, i) => new TableCell({
    borders: CELL, width: { size: widths[i], type: WidthType.DXA }, shading: { fill, type: ShadingType.CLEAR },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: t, bold: true, size: 20 })] })],
  })) });
}

function dataRow(cells, widths, opts = {}) {
  return new TableRow({ children: cells.map((c, i) => new TableCell({
    borders: CELL, width: { size: widths[i], type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
    shading: i === 0 && opts.firstCol ? { fill: 'F0F4F8', type: ShadingType.CLEAR } : undefined,
    children: [new Paragraph({ alignment: opts.center && i > 0 ? AlignmentType.CENTER : AlignmentType.LEFT, children: runs(c, { size: 20, bold: i === 0 && opts.boldFirst }) })],
  })) });
}

// ---- Real data -------------------------------------------------------------
const paymentInquiry = {
  id: 'pay_SzbYePz4WwJKfX', entity: 'payment', amount: 1000000, currency: 'INR',
  status: 'captured', order_id: 'order_SzbYQVTlHod5Ky', method: 'netbanking',
  bank: 'BARB_R', captured: true, email: 'boobalan@gmail.com', contact: '+919876541302',
  fee: 0, tax: 0, description: 'Bill payment for 1 bill',
  acquirer_data: { bank_transaction_id: '7755164' },
  error_code: null, error_description: null,
  notes: { transaction_ref: 'P20260609165024F1XGK', transaction_id: 'd16be79a-b8ce-478e-9af1-7602e3d8865c' },
  created_at: 1781023838,
};
const webhook = {
  event: 'payment.captured', entity: 'event', account_id: 'acc_SnzjAmEWfFjEpG', contains: ['payment'],
  payload: { payment: { entity: {
    id: 'pay_SzbYePz4WwJKfX', order_id: 'order_SzbYQVTlHod5Ky', amount: 1000000, currency: 'INR',
    status: 'captured', method: 'netbanking', captured: true, email: 'boobalan@gmail.com', contact: '+919876541302',
  } } },
  created_at: 1781023842,
};
const failedResponse = {
  error_code: 'BAD_REQUEST_ERROR', error_step: 'payment_authorization', error_reason: 'payment_failed',
  error_source: 'bank',
  error_description: "Your payment didn't go through as it was declined by the bank. Try another payment method or contact your bank.",
};

const txWidths = [2280, 2360, 2360, 2360];
const checklist = [
  ['MERCHANT NAME', [FILL('«FILL: registered Razorpay merchant name»')]],
  ['TID / ACCOUNT ID', [FILL('«FILL: Razorpay MID from the test-credential email»')]],
  ['URL', 'https://www.jkkn.ai/auth/audit-login'],
  ['TRANSACTION URL is publicly accessible', 'Yes — reachable over the public internet; payment initiation requires login (test credentials below).'],
  ['LOGIN ID', [FILL('«FILL: test.admin@jkkn.ac.in — confirm active»')]],
  ['LOGIN PWD', [FILL('«FILL: audit password»')]],
  ['RESPONSE URL', 'Success: https://www.jkkn.ai/billing/payment/success  |  Failure: https://www.jkkn.ai/billing/payment/failed'],
  ['DEVELOPER CONTACT NO', [FILL('«FILL: developer phone number»')]],
  ['DEVELOPER EMAIL ID', 'aidental@jkkn.ac.in'],
  ['TYPE', 'VAS'],
  ['Programming Language', 'TypeScript / Node.js (Next.js 16 App Router, React 19); Supabase (PostgreSQL) backend'],
  ['Seamless / Non-Seamless Integration', 'Non-Seamless — Razorpay Hosted Checkout (server-rendered form POST to api.razorpay.com/v1/checkout/embedded; customer redirected to the Razorpay-hosted page)'],
  ['Plugin Name and version (If Any)', 'No third-party plugin — custom integration. Razorpay Hosted Checkout (/v1/checkout/embedded) + Razorpay REST API (/v1/orders, /v1/payments)'],
  ['Web / Mobile / Both', 'Web (responsive web application; also installable PWA). App/Domain: https://www.jkkn.ai'],
  ['Transaction Flow verified', 'Yes'],
  ['Multiple Amount Values', '₹10,000.00 (success) and ₹40,000.00 (failed attempt)'],
  ['Transactions response stored (including Failed)', 'Yes — both a successful (P20260609165024F1XGK) and a failed (P20260609172737MMU6L) transaction are stored with their full gateway responses.'],
];

const confirmations = [
  ['1', 'Maintain database to store the transaction details / status', 'YES'],
  ['2', 'Services / payment confirmation provided on the basis of database status', 'YES'],
  ['3', '7–8 transactions performed during the audit; amounts / options / links / records prepared', 'YES'],
  ['4', 'Login credentials available till audit completion', 'YES'],
  ['5', 'Database records will not be cleared till audit completion', 'YES'],
  ['6', 'UAT setup is identical to the production setup', 'YES'],
  ['7', 'Implementation of dual inquiry, i.e. "Status API", in response (Mandatory)', 'YES'],
  ['8', 'Audit checklist implemented for integration and security-audit process', 'YES'],
];
const confWidths = [600, 6960, 1800];

const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });

const children = [
  new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun('Razorpay Security Audit Submission')] }),
  p([new TextRun({ text: 'JKKN — MyJKKN Platform', bold: true, size: 24 })], { alignment: AlignmentType.CENTER, spacing: { after: 40 } }),
  p([new TextRun({ text: 'CollectNow Security Audit · Ticket #19383043', size: 22, color: '555555' })], { alignment: AlignmentType.CENTER, spacing: { after: 240 } }),

  // Operator checklist callout
  new Table({ columnWidths: [9360], width: { size: 9360, type: WidthType.DXA }, rows: [new TableRow({ children: [new TableCell({
    borders: CELL, width: { size: 9360, type: WidthType.DXA }, shading: { fill: 'FFF8E1', type: ShadingType.CLEAR }, margins: { top: 140, bottom: 140, left: 180, right: 180 },
    children: [
      p([new TextRun({ text: 'Before sending — complete the highlighted items:', bold: true, size: 22 })], { spacing: { after: 80 } }),
      p([new TextRun({ text: '1) Paste each screenshot into the labelled boxes in Section 1.  2) Fill the yellow «FILL» fields in Section 5 (MID, merchant name, login, developer phone).  3) Export this file to PDF (File → Save As → PDF) and attach it to your reply on Ticket #19383043 to collectnow-integrations@razorpay.com.', size: 20 })], { spacing: { after: 0 } }),
    ],
  })] })] }),

  p('', { spacing: { after: 120 } }),
  p('Dear Razorpay CollectNow Team,'),
  p('Thank you for the detailed feedback on Ticket #19383043.'),
  p([
    new TextRun({ text: 'On the checkout type: ', bold: true }),
    new TextRun('We have migrated our integration from Standard Checkout to Hosted Checkout as required under the CollectNow program. Our application now redirects the customer to Razorpay’s hosted payment page (https://api.razorpay.com/v1/checkout/embedded) via a server-rendered Pay form (order_id + callback_url + cancel_url); the customer completes payment on the Razorpay-hosted page rather than an on-page modal.'),
  ]),
  p('Below are the required details, the Yes/No confirmations, and the completed audit checklist. The transaction-flow screenshots and verification request/response logs are included in this single document.'),

  // Section 1 — screenshots
  new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun('1. Transaction-flow screenshots')] }),
  p('The response page shows, in real time: Order number, Amount, and the Success message. Both a successful and a failed transaction are included below.'),
  H2('1a. Successful payment flow'),
  shot('1. Bill selection — “Select Bills to Pay Online”'),
  p('', { spacing: { after: 60 } }),
  shot('2. Razorpay HOSTED payment page (URL bar shows api.razorpay.com)'),
  p('', { spacing: { after: 60 } }),
  shot('3. Payment success page — Order number, Amount (₹), “Payment Successful!”'),
  p('', { spacing: { after: 60 } }),
  shot('4. Receipt page (View Receipt)'),
  H2('1b. Failed payment flow'),
  shot('5. Razorpay hosted page showing the payment failure / decline'),
  p('', { spacing: { after: 60 } }),
  shot('6. Payment failed page (server-verified failure)'),

  // Section 2 — sample transactions
  new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun('2. Sample transactions (Hosted Checkout)')] }),
  p('All transactions below were completed through the hosted checkout on the JKKN Testing Institution (customer: BOOBAL A, Roll No 87596328). Ensure the order/payment IDs match the IDs visible in your screenshots.'),
  new Table({ columnWidths: txWidths, width: { size: 9360, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, rows: [
    headerRow(['Field', 'A — Success', 'B — Success', 'C — Failed'], txWidths),
    dataRow(['Amount', '₹10,000.00', '₹10,000.00', '₹40,000.00'], txWidths, { firstCol: true, boldFirst: true, center: true }),
    dataRow(['Status', 'Success (captured)', 'Success (captured)', 'Failed (declined by bank)'], txWidths, { firstCol: true, boldFirst: true, center: true }),
    dataRow(['Payment method', 'Net Banking', 'Net Banking', 'Net Banking'], txWidths, { firstCol: true, boldFirst: true, center: true }),
    dataRow(['Razorpay Order ID', 'order_SzbYQVTlHod5Ky', 'order_Szb5iN604GYw8R', 'order_SzcBjzwltgoEBf'], txWidths, { firstCol: true, boldFirst: true }),
    dataRow(['Razorpay Payment ID', 'pay_SzbYePz4WwJKfX', 'pay_Szb6fu0RqQzUQJ', 'pay_SzcBxkdWrGVJha'], txWidths, { firstCol: true, boldFirst: true }),
    dataRow(['Our Transaction Ref', 'P20260609165024F1XGK', 'P20260609162313M7LQL', 'P20260609172737MMU6L'], txWidths, { firstCol: true, boldFirst: true }),
    dataRow(['Date (IST)', '09-Jun-2026 10:20 PM', '09-Jun-2026 09:54 PM', '09-Jun-2026 10:57 PM'], txWidths, { firstCol: true, boldFirst: true, center: true }),
  ] }),

  // Section 3 — verification logs
  new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun('3. Verification request & response logs')] }),
  p('All payment confirmation is performed server-side. On Razorpay’s callback to our callback_url, the server validates the HMAC razorpay_signature, then performs the mandatory dual inquiry — it independently calls BOTH GET /v1/orders/{order_id} (returns status “paid”) AND GET /v1/payments/{payment_id} — verifies the amount matches to the paise, and writes the verified status to the database. The success/failure shown to the user is sourced from that verified database status, never from client/redirect parameters.'),
  H2('3a. Payment Status API — GET /v1/payments/pay_SzbYePz4WwJKfX (success)'),
  codeBlock(paymentInquiry),
  H2('3b. Webhook event received & HMAC-verified — payment.captured'),
  codeBlock(webhook),
  H2('3c. Failed transaction — stored gateway error response (P20260609172737MMU6L)'),
  p('Failed responses are persisted too (Order ID order_SzcBjzwltgoEBf). The stored gateway error:'),
  codeBlock(failedResponse),

  // Section 4 — confirmations
  new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun('4. Pre-audit confirmations')] }),
  new Table({ columnWidths: confWidths, width: { size: 9360, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 140, right: 140 }, rows: [
    headerRow(['#', 'Requirement', 'Confirmation'], confWidths),
    ...confirmations.map((r) => dataRow(r, confWidths, { center: true })),
  ] }),
  p([
    new TextRun({ text: 'On point 7 (dual inquiry / Status API): ', bold: true }),
    new TextRun('On every payment callback our server independently calls both Razorpay endpoints — GET /v1/orders/{order_id} and GET /v1/payments/{payment_id} — after validating the HMAC signature, and confirms the amount matches to the paise before marking the transaction successful. The response page additionally re-reads the verified status from our database before showing a success result.'),
  ], { spacing: { before: 160 } }),

  // Section 5 — checklist
  new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun('5. Audit checklist')] }),
  p([new TextRun({ text: 'Highlighted ', size: 20 }), new TextRun({ text: '«FILL»', highlight: 'yellow', bold: true, size: 20 }), new TextRun({ text: ' fields must be completed before sending.', size: 20 })]),
  kv(checklist),

  // Section 6 — flow summary
  H1('6. Transaction flow summary'),
  ...[
    'The student selects the bill(s) to pay and initiates payment.',
    'Our server creates a Razorpay Order (POST /v1/orders) and stores an “initiated” transaction record (Order ID + amount in paise) in our database.',
    'We render a Hosted Checkout Pay form that POSTs order_id, callback_url and cancel_url to https://api.razorpay.com/v1/checkout/embedded — the browser is fully redirected to Razorpay’s hosted payment page (Non-Seamless).',
    'On payment, Razorpay POSTs razorpay_order_id, razorpay_payment_id, razorpay_signature to our callback_url.',
    'The server verifies the HMAC signature, performs the dual inquiry (GET /orders + GET /payments), verifies the amount to the paise, and writes the verified status to the database — successes and failures are persisted.',
    'The customer is redirected to the response page, which displays the Order number, Amount, and Success/Failure message sourced from the verified database status.',
    'Razorpay webhooks are received at a signed endpoint, signature-verified, logged, and reconciled against the stored transaction.',
  ].map((t, i) => new Paragraph({ numbering: { reference: 'flow', level: 0 }, spacing: { after: 100 }, children: [new TextRun({ text: t, size: 22 })] })),
  p('', { spacing: { before: 160 } }),
  p('We have kept the UAT environment identical to production and will retain all transaction records and login credentials until the audit is complete. Please let us know if any additional information or access is required.'),
  p([new TextRun({ text: 'Thank you,', size: 22 })], { spacing: { before: 160, after: 40 } }),
  p([FILL('«FILL: your name / designation»')], { spacing: { after: 0 } }),
  p([new TextRun({ text: 'JKKN — MyJKKN Platform', size: 22 })], { spacing: { after: 0 } }),
  p([new TextRun({ text: 'aidental@jkkn.ac.in · ', size: 22 }), FILL('«FILL: phone»')], { spacing: { after: 0 } }),
];

const doc = new Document({
  styles: {
    default: { document: { run: { font: 'Arial', size: 22 } } },
    paragraphStyles: [
      { id: 'Title', name: 'Title', basedOn: 'Normal', run: { size: 48, bold: true, color: '0F766E', font: 'Arial' }, paragraph: { spacing: { after: 80 }, alignment: AlignmentType.CENTER } },
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 30, bold: true, color: '0F766E', font: 'Arial' }, paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 24, bold: true, color: '222222', font: 'Arial' }, paragraph: { spacing: { before: 180, after: 120 }, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [{ reference: 'flow', levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 620, hanging: 320 } } } }] }] },
  sections: [{
    properties: { page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: 'JKKN MyJKKN — Razorpay Audit · Ticket #19383043 · Page ', size: 16, color: '888888' }),
      new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '888888' }),
      new TextRun({ text: ' of ', size: 16, color: '888888' }),
      new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '888888' }),
    ] })] }) },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log('WROTE ' + OUT + ' (' + buf.length + ' bytes)');
});
