export const dynamic = 'force-dynamic';
// app/api/admission/fees-structure/template/route.ts
//
// The blank workbook for CREATING fee structures in bulk. One data tab in the
// same layout "Export for Edit" produces — one row per instalment of one fee of
// one structure — so an operator learns the shape once and both downloads read
// identically.
import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import {
  FEE_STRUCTURE_SHEET_NAME,
  UNIFIED_HEADERS,
  DUE_ANCHOR_LABELS,
  APPLIES_TO_LABELS,
  REQUIRED_PROMOTIONS,
  DATE_HEADERS,
  headerColumn,
} from '@/lib/utils/mappings/fee-structure-excel-mappings';
import { loadActiveFeeCategories } from '@/lib/services/admission/fee-structure-bulk-lookups';

function serverClient(cookieStore: any) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n: string) => cookieStore.get(n)?.value,
        set: (n: string, v: string, o: any) => cookieStore.set(n, v, o),
        remove: (n: string, o: any) => cookieStore.set(n, '', { ...o, maxAge: 0 }),
      },
    },
  );
}

export async function GET(_req: NextRequest) {
  await connection();
  try {
    const supabase = serverClient(await cookies());
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [cats, insts, quotas, accs, comms, rooms, messes, statuses] = await Promise.all([
      loadActiveFeeCategories(supabase),
      supabase.from('institutions').select('name').order('name'),
      supabase.from('quotas').select('name').order('name'),
      supabase.from('accommodation_types').select('name').eq('is_active', true).order('sort_order'),
      supabase.from('community_categories').select('name').order('name'),
      // Gender-partitioned: de-duplicate by name, since a fee structure names
      // the tier and each learner resolves to their own gender's variant.
      supabase.from('hostel_categories').select('name, sort_order').eq('is_active', true).order('sort_order'),
      supabase.from('mess_categories').select('name, sort_order').eq('is_active', true).order('sort_order'),
      // Promotion targets for the "Promotes To" dropdown. The gates_login
      // filter is the SAME one loadBulkResolveLookups applies — offering a
      // status in a dropdown that the importer then rejects would be worse
      // than offering no dropdown at all.
      supabase
        .from('admission_statuses')
        .select('label')
        .eq('scope', 'learner')
        .eq('is_active', true)
        .eq('gates_login', false)
        .order('label'),
    ]);
    const categoryNames = cats.map((c) => c.category_name);

    const wb = new ExcelJS.Workbook();

    // ---- Sheet 1: Fee Structures (the only data tab) ----
    const sheet = wb.addWorksheet(FEE_STRUCTURE_SHEET_NAME);
    // Date columns get a real yyyy-mm-dd format. The template writes them as
    // text, but the moment an operator types over one Excel turns it into a
    // date serial formatted to THEIR locale — dd/mm/yyyy here, mm/dd/yyyy on a
    // US machine — and the sheet stops agreeing with itself about what a date
    // looks like. Stamping the format on the column keeps every date, typed or
    // written, displaying the one way the instructions document.
    sheet.columns = UNIFIED_HEADERS.map((h) => ({
      header: h,
      key: h,
      width: Math.max(16, h.length + 2),
      ...(DATE_HEADERS.has(h) ? { style: { numFmt: 'yyyy-mm-dd' } } : {}),
    }));
    sheet.getRow(1).font = { bold: true, size: 11, name: 'Arial', color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.views = [{ state: 'frozen', xSplit: 4, ySplit: 1 }];

    // ---- Sample rows (yellow) ----
    // FIVE rows, not one, because one row cannot show the thing people get
    // wrong: that a structure OWNS several rows, and that a split fee owns
    // several more. The repeated identity columns in rows 2-6 are the lesson.
    const sampleStructure: Record<string, string | number> = {
      // Blank = create. Filled = update an existing structure.
      'Fee Structure ID': '',
      Institution: insts.data?.[0]?.name ?? 'JKKN College',
      Degree: 'Undergraduate', Department: 'Sample Department', Programme: 'Sample Programme',
      'Admission Year': '2026 - 2027', Quota: quotas.data?.[0]?.name ?? 'Management Quota',
      Gender: '', Accommodation: '',
      'Room Category': '', 'Mess Category': '',
      Communities: comms.data?.slice(0, 2).map((c) => c.name).join(', ') ?? 'BC, MBC',
      Name: 'BE CSE — General — 2026', Status: 'draft',
      'Effective From': '', 'Effective To': '', Notes: '',
      'Default Due (Days)': 30,
      'Package Type': '',
    };
    const tuition = categoryNames[0] ?? '1 Year Tuition Fee';
    const otherFee = categoryNames[1] ?? 'Uniform Fee';
    const statusLabels = (statuses.data ?? []).map((r: any) => r.label as string);
    // The two rungs every structure must promote to, named explicitly. The
    // samples used to take statusLabels[0] and [1], which the alphabetical
    // order above made "Account" and "Admitted" — a shape the importer now
    // rejects (no Reserved). The samples must be something it accepts.
    const [reservedLabel, admittedLabel] = REQUIRED_PROMOTIONS.map(
      (p) => statusLabels.find((l) => l.toLowerCase() === p.label.toLowerCase()) ?? p.label,
    );

    // A SECOND structure, so the sheet shows where one ends and the next
    // begins — and so the date-driven example below has somewhere to live.
    const sampleStructureB: Record<string, string | number> = {
      ...sampleStructure,
      Quota: quotas.data?.[1]?.name ?? 'Government Quota',
      Name: 'BE CSE — Government — 2026',
    };

    // BOTH ways of dating an instalment are shown, because they are a real
    // choice and the sheet cannot hint at it: an OFFSET ("+15 days", which
    // lands on a different calendar date for every learner) or a hard DATE
    // (the same day for everyone). Earlier drafts of this template only ever
    // demonstrated offsets, and operators reasonably concluded the Due Date
    // column was not usable for instalments.
    const samples: Array<Record<string, string | number>> = [
      // ── Structure A ── a fee split 30 / 40 / 30, promoting twice.
      // Instalments 1 and 2 are OFFSETS; instalment 3 is a hard DATE. Mixing
      // the two down one fee is allowed, and this is what it looks like.
      { ...sampleStructure, 'Fee Category': tuition, Amount: 100000, 'Applies To': APPLIES_TO_LABELS.every_year, 'Instalment #': 1, 'Share %': 30, 'Due Anchor': DUE_ANCHOR_LABELS.generation_date, 'Due After (Days)': 15, 'Promotes To': reservedLabel },
      { ...sampleStructure, 'Fee Category': tuition, Amount: 100000, 'Applies To': APPLIES_TO_LABELS.every_year, 'Instalment #': 2, 'Share %': 40, 'Due Anchor': DUE_ANCHOR_LABELS.generation_date, 'Due After (Days)': 90, 'Promotes To': admittedLabel },
      { ...sampleStructure, 'Fee Category': tuition, Amount: 100000, 'Applies To': APPLIES_TO_LABELS.every_year, 'Instalment #': 3, 'Share %': 30, 'Due Anchor': DUE_ANCHOR_LABELS.generation_date, 'Due Date': '2027-06-30' },
      // A second fee of the SAME structure, paid in one go on a hard date --
      // and charged ONCE, at admission, not again in years 2, 3 and 4.
      { ...sampleStructure, 'Fee Category': otherFee, Amount: 5000, 'Applies To': APPLIES_TO_LABELS.first_year_only, 'Instalment #': '', 'Due Anchor': DUE_ANCHOR_LABELS.fixed_date, 'Due Date': '2027-01-31' },

      // ── Structure B ── the same fee split 50 / 50 on two FIXED DATES.
      // Every instalment dated, no offsets anywhere. Note the anchor still
      // reads Generation Date: on a split it only governs rows that use
      // "Due After (Days)", and these rows do not.
      { ...sampleStructureB, 'Fee Category': tuition, Amount: 90000, 'Applies To': APPLIES_TO_LABELS.every_year, 'Instalment #': 1, 'Share %': 50, 'Due Anchor': DUE_ANCHOR_LABELS.generation_date, 'Due Date': '2026-08-31', 'Promotes To': reservedLabel },
      { ...sampleStructureB, 'Fee Category': tuition, Amount: 90000, 'Applies To': APPLIES_TO_LABELS.every_year, 'Instalment #': 2, 'Share %': 50, 'Due Anchor': DUE_ANCHOR_LABELS.generation_date, 'Due Date': '2027-01-31', 'Promotes To': admittedLabel },
      // A fee billed in ONE nominated year -- the pair of cells that go together.
      { ...sampleStructureB, 'Fee Category': otherFee, Amount: 2500, 'Applies To': APPLIES_TO_LABELS.specific_year, 'Year of Study': 3, 'Instalment #': '', 'Due Anchor': DUE_ANCHOR_LABELS.generation_date, 'Due After (Days)': 30 },
    ];
    for (const s of samples) sheet.addRow(s);
    // Two shades, one per sample structure, so "these rows are one structure"
    // is visible before reading a single cell.
    samples.forEach((s, i) => {
      sheet.getRow(i + 2).fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: s.Name === sampleStructureB.Name ? 'FFFEF3C7' : 'FFFFFBEB' },
      };
    });
    sheet.getCell('A2').note = {
      texts: [{
        font: { bold: true, size: 9 },
        text: 'Sample rows — delete all of them before importing.\n\nRows 2-5 are ONE fee structure: a fee split three ways, then a second fee paid in one go. Rows 6-7 are a DIFFERENT structure whose split is dated by calendar date instead of by "+days".\n\nThe structure columns repeat on every row of their structure and must match.',
      }],
    };
    // Header notes on the two dating columns. They are mutually exclusive per
    // row and the header text alone does not say so.
    const noteOn = (header: string, text: string) => {
      const col = headerColumn(UNIFIED_HEADERS, header);
      if (col) sheet.getCell(`${col}1`).note = { texts: [{ font: { size: 9 }, text }] };
    };
    noteOn('Applies To', "WHICH YEARS OF THE COURSE THIS FEE IS BILLED IN.\n\n  Every year       - billed in every year of the programme (the default).\n  First year only  - billed once, at admission. Use this for admission,\n                     uniform, kit and other one-off charges.\n  Specific year    - billed in ONE nominated year; put the year in the\n                     next column.\n\nBLANK leaves the fee as it is (Every year on a new fee).");
    noteOn('Year of Study', "A YEAR NUMBER, 1-10.\n\nFill this in ONLY when \"Applies To\" reads Specific year, and leave it blank\notherwise. The two cells go together and the database rejects one without\nthe other.");
    noteOn('Due After (Days)',
      'A COUNT OF DAYS, e.g. 15 — counted from whatever "Due Anchor" says. Lands on a different calendar date for each learner.\n\nUse this OR "Due Date" on a row, never both.');
    noteOn('Due Date',
      'A CALENDAR DATE, e.g. 2027-01-31 — the same day for every learner. Type it as yyyy-mm-dd (dd/mm/yyyy is also accepted).\n\nUse this OR "Due After (Days)" on a row, never both.\n\nOn a fee paid in one go, entering a date here switches its Due Anchor to Fixed Date automatically.');

    // ---- Sheet 2: Lists (hidden) ----
    const lists = wb.addWorksheet('Lists');
    lists.state = 'hidden';
    const instNames = (insts.data ?? []).map((r) => r.name);
    const quotaNames = (quotas.data ?? []).map((r) => r.name);
    const accNames = (accs.data ?? []).map((r) => r.name);
    const commNames = (comms.data ?? []).map((r) => r.name);
    const uniqueNames = (rowsIn: Array<{ name: string }> | null) =>
      [...new Set((rowsIn ?? []).map((r) => r.name))];
    const roomNames = uniqueNames(rooms.data);
    const messNames = uniqueNames(messes.data);
    const anchorLabels = Object.values(DUE_ANCHOR_LABELS);
    const appliesLabels = Object.values(APPLIES_TO_LABELS);
    const yearNumbers = Array.from({ length: 10 }, (_, i) => i + 1);
    lists.columns = [
      { header: 'Institution', key: 'inst', width: 30 },
      { header: 'Quota', key: 'quota', width: 24 },
      { header: 'Gender', key: 'gender', width: 12 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Community', key: 'comm', width: 30 },
      { header: 'Accommodation', key: 'acc', width: 18 },
      { header: 'Room Category', key: 'room', width: 24 },
      { header: 'Mess Category', key: 'mess', width: 20 },
      { header: 'Package Type', key: 'pkg', width: 16 },
      { header: 'Fee Category', key: 'cat', width: 30 },
      { header: 'Due Anchor', key: 'anchor', width: 22 },
      { header: 'Promotes To', key: 'promo', width: 20 },
      { header: 'Applies To', key: 'applies', width: 18 },
      { header: 'Year of Study', key: 'yos', width: 14 },
    ];
    const maxLen = Math.max(
      instNames.length, quotaNames.length, commNames.length, accNames.length,
      roomNames.length, messNames.length,
      categoryNames.length, anchorLabels.length, statusLabels.length,
      appliesLabels.length, yearNumbers.length, 3,
    );
    for (let i = 0; i < maxLen; i++) {
      lists.addRow({
        inst: instNames[i] ?? null, quota: quotaNames[i] ?? null,
        gender: ['Male', 'Female'][i] ?? null, status: ['draft', 'active', 'archived'][i] ?? null,
        comm: commNames[i] ?? null, acc: accNames[i] ?? null,
        room: roomNames[i] ?? null, mess: messNames[i] ?? null,
        pkg: ['Package', 'Non-Package'][i] ?? null,
        cat: categoryNames[i] ?? null,
        anchor: anchorLabels[i] ?? null,
        promo: statusLabels[i] ?? null,
        applies: appliesLabels[i] ?? null,
        yos: yearNumbers[i] ?? null,
      });
    }

    // ---- Dropdowns ----
    //
    // 800 rows, not 200: the long layout spends several rows per structure, so
    // the old ceiling would run out inside about 50 structures.
    //
    // Target columns are DERIVED from UNIFIED_HEADERS rather than hardcoded:
    // inserting "Room Category"/"Mess Category" after "Accommodation" once
    // shifted Status from L to N, and the previous hardcoded letters silently
    // attached the Status dropdown to the Communities column.
    const colRange = (letter: string, n: number) => `Lists!$${letter}$2:$${letter}$${n + 1}`;
    const validate = (header: string, formulae: string[], allowBlank: boolean, enabled = true) => {
      const col = headerColumn(UNIFIED_HEADERS, header);
      if (!col || !enabled) return;
      for (let r = 2; r <= 801; r++) {
        sheet.getCell(`${col}${r}`).dataValidation = { type: 'list', allowBlank, formulae };
      }
    };

    validate('Institution', [colRange('A', instNames.length)], false, instNames.length > 0);
    validate('Quota', [colRange('B', quotaNames.length)], false, quotaNames.length > 0);
    validate('Gender', ['Lists!$C$2:$C$3'], true);
    validate('Accommodation', [colRange('F', accNames.length)], true, accNames.length > 0);
    validate('Room Category', [colRange('G', roomNames.length)], true, roomNames.length > 0);
    validate('Mess Category', [colRange('H', messNames.length)], true, messNames.length > 0);
    validate('Status', ['Lists!$D$2:$D$4'], true);
    validate('Package Type', ['Lists!$I$2:$I$3'], true);
    validate('Fee Category', [colRange('J', categoryNames.length)], true, categoryNames.length > 0);
    validate('Due Anchor', [colRange('K', anchorLabels.length)], true);
    validate('Promotes To', [colRange('L', statusLabels.length)], true, statusLabels.length > 0);
    // allowBlank on both: blank means "leave this fee's setting alone", which is
    // the only way to re-import an older workbook without re-billing every
    // one-off fee in every year of the course.
    validate('Applies To', [colRange('M', appliesLabels.length)], true);
    validate('Year of Study', [colRange('N', yearNumbers.length)], true);

    // ---- Sheet 3: Instructions ----
    const instr = wb.addWorksheet('Instructions');
    instr.columns = [{ width: 100 }];
    [
      'INSTRUCTIONS — BULK FEE STRUCTURE IMPORT',
      '',
      'THE ONE THING TO UNDERSTAND: ONE ROW = ONE INSTALMENT.',
      '',
      'Everything lives on the single "Fee Structures" tab. A structure owns one row per',
      'fee; a fee that is split owns one row per instalment. The structure columns',
      '(Institution ... Package Type) REPEAT on every row of that structure.',
      '',
      '    Fee Structure ID | ... | Name        | Fee Category | Amount | Applies To      | Inst # | Share % | Due After | Due Date',
      '    (blank)          | ... | BE CSE 2026 | Tuition Fee  | 100000 | Every year      |   1    |   30    |    15     |',
      '    (blank)          | ... | BE CSE 2026 | Tuition Fee  | 100000 | Every year      |   2    |   40    |    90     |',
      '    (blank)          | ... | BE CSE 2026 | Tuition Fee  | 100000 | Every year      |   3    |   30    |           | 2027-06-30',
      '    (blank)          | ... | BE CSE 2026 | Uniform Fee  |   5000 | First year only | (blank)|         |           | 2027-01-31',
      '',
      '  = ONE structure, TWO fees, the first one split three ways.',
      '',
      'TWO WAYS TO DATE A PAYMENT — pick one per row, never both:',
      '  "Due After (Days)" = a COUNT, e.g. 15. Counted from the Due Anchor, so it lands on a',
      '                       different calendar date for each learner.',
      '  "Due Date"         = a CALENDAR DATE, e.g. 2027-01-31. The same day for everyone.',
      'You may mix them down one fee (offsets for the early instalments, hard dates later), and',
      'you may date every instalment. The sample rows show both.',
      '',
      'STRUCTURE COLUMNS',
      '',
      '1. Leave "Fee Structure ID" BLANK to create. Filled = update an existing structure',
      '   (that is what "Export for Edit" gives you).',
      '2. A structure column must read the SAME on every row of that structure — it stores',
      '   ONE value. Two different entries is an error naming the row; blank rows follow',
      '   the filled ones. Change your mind about a Name? Change it on all of that',
      '   structure’s rows (select the cells and paste).',
      '3. Dimensions (Institution/Degree/Department/Programme/Admission Year/Quota): type the',
      '   exact NAME. Degree/Department/Programme/Admission Year must be valid WITHIN the',
      '   chosen parent. On UPDATE rows these six are read-only identity — changing them',
      '   rejects the row.',
      '4. Communities: comma-separated names, e.g. "BC, MBC, OBC". At least one.',
      '5. Gender: Male, Female, or blank (= applies to any gender).',
      '   Accommodation: Hostel, Day Scholar, etc., or blank (= applies to any).',
      '5a. Room Category / Mess Category: ONLY for Accommodation = Hostel, and BOTH are',
      '    REQUIRED when Status is active. Leave blank on every other row. Name the tier',
      '    (e.g. "Classic Room" / "Classic") — each learner resolves to their own gender’s variant.',
      '6. Status: draft (default), active, or archived. Dates: yyyy-mm-dd.',
      '7. "Default Due (Days)": how many days after admission a fee falls due when it sets no',
      '    date of its own. Blank = leave unchanged (30 on a new structure).',
      '8. "Package Type": Package or Non-Package, or blank for unclassified. A label only —',
      '    nothing resolves a learner by it — so unlike the 6 dimensions you MAY change it on',
      '    an UPDATE row. Blank clears it.',
      '',
      'FEE COLUMNS',
      '',
      'F1. "Fee Category" + "Amount" define one fee of the structure. Amount is the FULL fee;',
      '    instalments split it, they do not add up on top of it — so put the same Amount on',
      '    every row of that fee.',
      'F1a. "Applies To" says WHICH YEARS OF THE COURSE the fee is billed in, and it is',
      '     the one column people most often need and never had. Every year (the default)',
      '     re-bills the fee in year 2, 3 and 4 as well — right for tuition, WRONG for a',
      '     one-time admission, uniform or kit charge, which wants First year only.',
      '       Every year       — billed in every year of the programme.',
      '       First year only  — billed once, at admission.',
      '       Specific year    — billed in ONE year; name it in "Year of Study" (1-10).',
      '     Like Amount, it belongs to the FEE, so it repeats down every row of that fee.',
      'F1b. BLANK "Applies To" leaves the fee as it is — Every year on a fee you are',
      '     creating, and whatever is already configured on a fee you are updating. That',
      '     is what lets an older export re-import without re-billing one-off fees.',
      '     "Year of Study" is filled ONLY next to Specific year, and must be blank',
      '     otherwise; the database rejects one without the other.',
      'F2. To ADD a fee, add a row. To REMOVE a fee, DELETE its row(s). A row with a Fee',
      '    Category but no Amount is an error, not a removal — that ambiguity is the one way',
      '    a blank cell could quietly delete money.',
      'F3. Transport fees are intentionally NOT available here (managed in their own module).',
      '',
      'INSTALMENT COLUMNS',
      '',
      'S1. "Instalment #" BLANK = the whole fee, paid in one go. Exactly one such row per fee.',
      'S2. "Instalment #" 1,2,3... = a split. At least 2 rows, numbered from 1 with no gaps.',
      '    Percentages must total exactly 100 (unless you use Fixed Amount instead).',
      'S3. Each row: EITHER "Share %" OR "Fixed Amount" — never both. The LAST instalment',
      '    absorbs any rounding, so the parts always add up to the fee exactly.',
      'S4. "Amount (ref)" is the rupee value each instalment actually bills — the same figure',
      '    the fee structure screen shows. It never SETS the size (that is Share % / Fixed',
      '    Amount); it is a cross-check. A filled-in value that does not match what the',
      '    instalment bills is an ERROR — so if you change a share or an Amount, update or',
      '    clear it. When any row uses Fixed Amount, the instalments must add up to the',
      '    fee’s Amount exactly: a split that comes out short or over is refused.',
      'S5. Each row: EITHER "Due After (Days)" OR "Due Date" — never both, and never neither',
      '    on a numbered instalment. Mixing the two ACROSS rows is allowed: "+15 days" for the',
      '    first, a hard calendar date for the rest — or a date on every one.',
      '    Keep instalments in chronological order — payments settle the earliest one first.',
      'S5a. Dates: type yyyy-mm-dd (2027-01-31). dd/mm/yyyy and a real Excel date cell are both',
      '     accepted too; the column is formatted so whatever you type displays as yyyy-mm-dd.',
      'S6. "Due Anchor" is what "Due After (Days)" counts FROM, and there is ONE per fee — so',
      '    the value repeats down every row of that fee and they must all agree.',
      '      • Generation Date      — days counted from when the bill is raised (the default).',
      '      • Academic Year Start  — days counted from the start of the learner’s academic year.',
      '      • Fixed Date           — use the "Due Date" column instead of an offset.',
      '    You do NOT have to set this by hand for a hard date: type a "Due Date" on a',
      '    whole-fee row and the anchor switches to Fixed Date for you. Clear the date and it',
      '    switches back. A Due Date next to "Academic Year Start" is rejected — that date',
      '    would never be used.',
      'S6a. On a SPLIT fee the anchor only governs the rows that use "Due After (Days)". A row',
      '     with its own "Due Date" uses that date directly, whatever the anchor says — which is',
      '     why the dated sample rows still read "Generation Date". Leave the anchor alone if',
      '     every instalment of that fee carries a date.',
      'S7. "Promotes To": the lifecycle status the learner reaches when THAT instalment is',
      '    settled (e.g. Reserved, Admitted). Blank = no rule. Statuses that grant a portal',
      '    login can never be reached automatically and are rejected.',
      'S7a. EVERY structure must promote to BOTH Reserved and Admitted — on any fee, any',
      '     instalment, in any combination (Reserved on instalment 1 of Tuition and Admitted',
      '     on instalment 2, or on a different fee altogether). A structure on the sheet that',
      '     is missing either one is rejected.',
      'S8. To SPLIT a fee that is currently one payment, replace its single blank-# row with',
      '    2+ numbered rows. To UN-split it, replace its numbered rows with one blank-# row.',
      '',
      'IMPORTING',
      '',
      'I1. Upload with "Bulk Import". The preview validates everything and writes NOTHING;',
      '    the import only runs once every row is clear.',
      'I2. Re-importing an untouched "Export for Edit" changes nothing, so you can safely',
      '    delete the rows you are not working on — or leave them.',
      'I3. Workbooks from before this layout (a separate "Fee Schedules" tab) still import',
      '    exactly as they did. The layout is detected from the header row.',
    ].forEach((line, i) => {
      const row = instr.addRow([line]);
      const isHeading = /^(INSTRUCTIONS|THE ONE THING|STRUCTURE COLUMNS|FEE COLUMNS|INSTALMENT COLUMNS|IMPORTING)/.test(line);
      row.font =
        i === 0 ? { bold: true, size: 14 }
        : isHeading ? { bold: true, size: 12 }
        : /^(\d+[a-z]?\.|[FSI]\d+[a-z]?\.)/.test(line) ? { bold: true, size: 11 }
        : line.trim().startsWith('Fee Structure ID |') || line.trim().startsWith('(blank)')
          ? { size: 10, name: 'Consolas' }
          : { size: 10 };
    });

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=fee-structures-template-${new Date().toISOString().split('T')[0]}.xlsx`,
      },
    });
  } catch (e) {
    console.error('[fees-structure/template] error:', e);
    return NextResponse.json({ error: 'Failed to generate template' }, { status: 500 });
  }
}
