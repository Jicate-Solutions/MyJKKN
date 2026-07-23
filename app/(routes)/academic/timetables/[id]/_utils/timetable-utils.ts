import { Period } from '@/types/academics';
import { format } from 'date-fns';
import { adaptLabel } from '@/lib/utils/school-label-adapter';
import type { InstitutionType } from '@/hooks/use-institution-type';
// jspdf, jspdf-autotable AND the shared institution banner are dynamically
// imported inside exportTimetableToPDF to keep jsPDF out of the SSR bundle —
// fflate (a jspdf dep) uses Node's Worker which Turbopack cannot resolve during
// server-side rendering.

/**
 * Sort periods by name naturally (Period 1, Period 2, etc.)
 */
export function sortPeriodsByName(periods: Period[]): Period[] {
  return periods.sort((a, b) => {
    const aName = a.period_name.toLowerCase();
    const bName = b.period_name.toLowerCase();

    // Extract numbers from period names for proper sorting
    const aMatch = aName.match(/(\d+)/);
    const bMatch = bName.match(/(\d+)/);

    if (aMatch && bMatch) {
      const aNumber = parseInt(aMatch[1]);
      const bNumber = parseInt(bMatch[1]);
      return aNumber - bNumber;
    }

    // Fallback to alphabetical sorting if no numbers found
    return aName.localeCompare(bName);
  });
}

/**
 * Generate all dates in a range (inclusive)
 */
export function generateDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * Validate date range for overlaps with existing dates
 */
export function validateDateRange(
  startDate: string,
  endDate: string,
  existingDates: string[]
): {
  valid: boolean;
  overlappingDates?: string[];
  message?: string;
} {
  // Generate all dates in the new range
  const newRangeDates = generateDateRange(startDate, endDate);

  // Extract existing dates from ranges
  const allExistingDates: string[] = [];

  existingDates.forEach((item) => {
    if (item.startsWith('RANGE:')) {
      const parts = item.split(':');
      if (parts.length === 3) {
        const rangeStart = parts[1];
        const rangeEnd = parts[2];
        const rangeDates = generateDateRange(rangeStart, rangeEnd);
        allExistingDates.push(...rangeDates);
      }
    } else if (!item.includes('RANGE')) {
      allExistingDates.push(item);
    }
  });

  // Check for overlaps
  const overlappingDates = newRangeDates.filter((date) =>
    allExistingDates.includes(date)
  );

  if (overlappingDates.length > 0) {
    return {
      valid: false,
      overlappingDates,
      message: `The selected range overlaps with existing dates: ${overlappingDates
        .slice(0, 3)
        .join(', ')}${
        overlappingDates.length > 3 ? ` and ${overlappingDates.length - 3} more` : ''
      }`
    };
  }

  return { valid: true };
}

/**
 * Check if any dates in a range already have slots
 */
export function checkDatesWithSlots(
  startDate: string,
  endDate: string,
  slots: any[]
): {
  hasSlots: boolean;
  datesWithSlots?: string[];
  message?: string;
} {
  const newRangeDates = generateDateRange(startDate, endDate);
  const datesWithSlots = newRangeDates.filter((date) =>
    slots.some((slot) => slot.slot_date === date)
  );

  if (datesWithSlots.length > 0) {
    return {
      hasSlots: true,
      datesWithSlots,
      message: `Some dates in this range already have slots created: ${datesWithSlots
        .slice(0, 3)
        .join(', ')}${
        datesWithSlots.length > 3 ? ` and ${datesWithSlots.length - 3} more` : ''
      }`
    };
  }

  return { hasSlots: false };
}

/**
 * Calculate number of days between two dates (inclusive)
 */
export function calculateDaysInRange(startDate: string, endDate: string): number {
  return (
    Math.ceil(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 3600 * 24)
    ) + 1
  );
}

// ─── Timetable PDF (official JKKN format) ────────────────────────────────────
// Layout mirrors the printed JKKN timetable:
//   1. Shared institution banner (logo + name + address)  [drawInstitutionBanner]
//   2. Department line + "Time Table for …" title + class metadata block
//   3. Transposed grid — periods are COLUMNS (time row + period-number row),
//      days/cycles/date-ranges are ROWS; breaks are vertical merged columns
//   4. Subject + handling-staff table (Theory / Practical), with Week/Hrs =
//      how many times each course appears in the grid
//
// All institution-type-sensitive wording goes through adaptLabel() so schools
// read "Wing / Class / Term" where colleges read "Department / Program / Semester".

// Official addresses, selected by institution entity_type.
const COLLEGE_ADDRESS =
  'Natarajapuram, NH-544, (Salem to Coimbatore), Kumarapalayam- 638 183. Namakkal Dist.';
const SCHOOL_ADDRESS =
  'Salem Main Rd, Thirvalluvar Nagar, Komarapalayam, Tamil Nadu 638183';

// Light blue header fill (matches the printed sheet's Excel "Blue, Accent 1,
// Lighter 60%") used for the time/period header rows and the day-label column.
const HEADER_BLUE: [number, number, number] = [197, 217, 241];
// Soft terracotta used for the Break / Lunch merged columns.
const BREAK_FILL: [number, number, number] = [252, 228, 214];
const PDF_MARGIN = 10;

/**
 * Format a time (HH:MM:SS) as "09:15am" — lowercase meridiem, 2-digit hour, to
 * match the printed timetable header.
 */
function fmtClock(timeString: string): string {
  try {
    const d = new Date(`2000-01-01T${timeString}`);
    let h = d.getHours();
    const m = d.getMinutes();
    const ap = h < 12 ? 'am' : 'pm';
    h = h % 12;
    if (h === 0) h = 12;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}${ap}`;
  } catch {
    return timeString;
  }
}

/** Stacked time label: "09:15am\nto\n10:00am". */
function timeStack(start: string, end: string): string {
  return `${fmtClock(start)}\nto\n${fmtClock(end)}`;
}

/**
 * Build a human label for a batch date-range column from its RANGE marker.
 */
function batchRangeLabel(marker: string): string {
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const parsed = parseRangeMarker(marker);
  if (!parsed) return fmt(marker); // legacy single date
  if (parsed.start === parsed.end) return fmt(parsed.start);
  const days = calculateDaysInRange(parsed.start, parsed.end);
  return `${fmt(parsed.start)} - ${fmt(parsed.end)} (${days}d)`;
}

/**
 * Compact course-code text for a grid cell (the printed sheet shows codes only;
 * faculty names live in the subject table below). Practical / subdivided /
 * combined slots join their distinct course codes with " / ".
 */
function getSlotCode(slot: any): string {
  if (!slot) return '';
  if (slot.is_break_slot) return slot.break_description || 'Break';

  // Practical period (batch mode)
  if (slot.period_mode === 'practical' && slot.practical_config?.batches?.length) {
    const codes = new Set<string>();
    slot.practical_config.batches.forEach((b: any) =>
      (b.enriched_courses || []).forEach(
        (c: any) => c.course_code && codes.add(c.course_code)
      )
    );
    if (codes.size) return Array.from(codes).join(' / ');
  }

  // Subdivided / combined — join sub-slot course codes
  if ((slot.is_subdivided || slot.is_combined) && slot.sub_slots?.length) {
    const codes = new Set<string>();
    slot.sub_slots.forEach(
      (ss: any) => ss.course?.course_code && codes.add(ss.course.course_code)
    );
    if (codes.size) return Array.from(codes).join(' / ');
  }

  return slot.course?.course_code || '';
}

/**
 * Load a remote image (institution logo) and return it as a PNG data URL plus
 * intrinsic dimensions. Resolves null on any failure (missing/blocked/CORS) so
 * a broken logo never aborts the export.
 */
function loadImageAsDataUrl(
  url: string
): Promise<{ dataUrl: string; w: number; h: number } | null> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0);
          resolve({
            dataUrl: canvas.toDataURL('image/png'),
            w: img.naturalWidth,
            h: img.naturalHeight
          });
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    } catch {
      resolve(null);
    }
  });
}

interface SubjectAgg {
  code: string;
  name: string;
  faculty: Set<string>;
  count: number;
  practical: boolean;
}

/**
 * Aggregate every course used across the timetable into rows for the subject
 * table. `count` = number of grid slots referencing the course (≈ Week/Hrs).
 * A course is flagged practical if any of its slots is a practical/subdivided
 * period or its name reads like a lab.
 */
function aggregateSubjects(slots: any[]): SubjectAgg[] {
  const map = new Map<string, SubjectAgg>();

  const add = (course: any, staffMembers: any[], practical: boolean) => {
    if (!course) return;
    const key = course.course_code || course.id || course.course_name;
    if (!key) return;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        code: course.course_code || '',
        name: course.course_name || '',
        faculty: new Set<string>(),
        count: 0,
        practical
      };
      map.set(key, entry);
    }
    entry.count += 1;
    if (practical) entry.practical = true;
    (staffMembers || []).forEach((s: any) => {
      const n = `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim();
      if (n) entry!.faculty.add(n);
    });
  };

  slots.forEach((slot) => {
    if (slot.is_break_slot) return;
    const looksPractical = slot.period_mode === 'practical' || !!slot.is_subdivided;

    if (slot.sub_slots?.length) {
      slot.sub_slots.forEach((ss: any) =>
        add(ss.course, ss.staff_members, looksPractical)
      );
    } else if (slot.practical_config?.batches?.length) {
      slot.practical_config.batches.forEach((b: any) =>
        (b.enriched_courses || []).forEach((c: any) => add(c, [], true))
      );
    } else {
      const namePractical = /\blab\b|practical/i.test(slot.course?.course_name || '');
      add(slot.course, slot.staff_members, looksPractical || namePractical);
    }
  });

  return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
}

export interface ExportTimetableOptions {
  timetable: any;
  timetableFormat: 'regular' | 'batch' | 'cycle';
  selectedPeriods: Period[];
  /** Regular format: ordered day-of-week keys (e.g. ['MONDAY', ...]). */
  selectedDays?: string[];
  /** Batch format: RANGE markers / dates (e.g. ['RANGE:2025-11-01:2025-11-05']). */
  selectedDates?: string[];
  /** Cycle format: number of cycles. */
  numCycles?: number;
  /** All slots for the timetable. */
  slots: any[];
  /** Class in-charge display name → rendered as "Class Co-ordinator". */
  inchargeName?: string | null;
}

/**
 * Export the timetable to a PDF in the official JKKN printed format — a native
 * jspdf-autotable build (not a screenshot), so it fits any institution's column
 * count and never clips. See the section banner above for the layout.
 */
export async function exportTimetableToPDF(
  options: ExportTimetableOptions
): Promise<void> {
  const {
    timetable,
    timetableFormat,
    selectedPeriods,
    selectedDays = [],
    selectedDates = [],
    numCycles = 6,
    slots = [],
    inchargeName = null
  } = options;

  if (!selectedPeriods || selectedPeriods.length === 0) {
    throw new Error('No periods configured to export');
  }

  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const centerX = pageWidth / 2;
  const tableWidth = pageWidth - PDF_MARGIN * 2;
  const lastY = () => (doc as any).lastAutoTable.finalY as number;

  // ── Institution-type-aware labels & address ───────────────────────────────
  const entityType = (timetable.institution?.entity_type ||
    'institution') as InstitutionType;
  const adapt = (label: string) => {
    try {
      return adaptLabel(label, entityType);
    } catch {
      return label;
    }
  };
  const address = entityType === 'school' ? SCHOOL_ADDRESS : COLLEGE_ADDRESS;

  // ── Resolve metadata (nested objects from getTimetable's select) ──────────
  const institutionName =
    timetable.institution?.name ||
    timetable.institution?.institution_name ||
    'Institution';
  const programName = timetable.program?.program_name || '';
  const semesterName =
    timetable.semesters?.semester_name || timetable.semester_name || '';
  const sectionName =
    timetable.sections?.section_name ||
    timetable.section?.section_name ||
    'All Sections';
  const academicYear =
    timetable.academic_year?.academic_year_name ||
    (typeof timetable.academic_year === 'string' ? timetable.academic_year : '');

  // ── 1. HEADER: compact institution banner (logo left + name + address) ────
  // Drawn inline (not the shared drawInstitutionBanner) so the name→address line
  // spacing can be tight (~1.5 lines) without affecting other COE PDFs. Logo is
  // the same-origin public asset → no CORS.
  const logo = await loadImageAsDataUrl('/jkkn_logo.png');
  let y = PDF_MARGIN;
  const logoSize = 16;
  if (logo) {
    try {
      doc.addImage(logo.dataUrl, 'PNG', PDF_MARGIN, y, logoSize, logoSize);
    } catch {
      /* missing/broken logo never aborts the export */
    }
  }
  doc.setFont('times', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text(institutionName, centerX, y + 5, { align: 'center' });
  doc.setFont('times', 'normal');
  doc.setFontSize(9.5);
  doc.text(address, centerX, y + 10, { align: 'center' });
  y += 15;

  // ── 2. Department (colleges) + title + metadata block ─────────────────────
  // Per the canonical xlsx, colleges show "DEPARTMENT OF X" and title by semester;
  // schools omit the wing line and title by class/program (per requirement).
  const isSchool = entityType === 'school';
  const departmentName = timetable.department?.department_name || '';
  if (!isSchool && departmentName) {
    doc.setFont('times', 'bold');
    doc.setFontSize(11);
    doc.text(
      `${adapt('Department').toUpperCase()} OF ${departmentName.toUpperCase()}`,
      centerX,
      y,
      { align: 'center' }
    );
    y += 5;
  }
  doc.setFont('times', 'bold');
  doc.setFontSize(11);
  const titleSubject = isSchool ? programName : semesterName || programName;
  const titleBits = [titleSubject, academicYear ? `(${academicYear})` : '']
    .filter(Boolean)
    .join(' ');
  doc.text(`Time Table${titleBits ? ` for ${titleBits}` : ''}`, centerX, y, {
    align: 'center'
  });
  y += 3;

  autoTable(doc, {
    startY: y,
    body: [
      [
        `${adapt('Program')}:`,
        programName,
        `${adapt('Class Co-ordinator')}:`,
        inchargeName || '',
        `${adapt('Class Chairman')}:`,
        ''
      ],
      [
        `${adapt('Section')}:`,
        sectionName,
        `${adapt('Semester')}:`,
        semesterName,
        'Class Room:',
        ''
      ]
    ],
    theme: 'grid',
    styles: {
      font: 'times',
      fontSize: 9,
      cellPadding: 1.5,
      lineColor: [0, 0, 0],
      lineWidth: 0.3,
      textColor: [0, 0, 0],
      valign: 'middle'
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 28 },
      1: { cellWidth: 52 },
      2: { fontStyle: 'bold', cellWidth: 38 },
      3: { cellWidth: 48 },
      4: { fontStyle: 'bold', cellWidth: 30 }
    },
    margin: { left: PDF_MARGIN, right: PDF_MARGIN },
    tableWidth
  });
  y = lastY() + 3;

  // ── 3. Transposed grid (periods = columns, axis items = rows) ─────────────
  let rowItems: { key: string; label: string }[];
  if (timetableFormat === 'cycle') {
    rowItems = Array.from({ length: numCycles }, (_, i) => ({
      key: `cycle-${i + 1}`,
      label: `Cycle ${i + 1}`
    }));
  } else if (timetableFormat === 'batch') {
    rowItems = selectedDates
      .filter((d) => !d.includes('RANGE') || d.startsWith('RANGE:'))
      .map((m) => ({ key: m, label: batchRangeLabel(m) }));
  } else {
    // 'MONDAY' → 'Mon'
    rowItems = selectedDays.map((d) => ({
      key: d,
      label: d.charAt(0) + d.slice(1, 3).toLowerCase()
    }));
  }
  if (rowItems.length === 0) rowItems = [{ key: '__none__', label: '—' }];

  // Format-aware slot lookup: batch matches on slot_date, others on day_of_week
  // (cycle stores its cycle key, e.g. "cycle-1", in day_of_week).
  const matchSlot = (rowKey: string, periodId: string) => {
    if (timetableFormat === 'batch') {
      return (
        slots.find(
          (s: any) => s.slot_date === rowKey && s.period_id === periodId
        ) ?? null
      );
    }
    return (
      slots.find(
        (s: any) => s.day_of_week === rowKey && s.period_id === periodId
      ) ?? null
    );
  };

  // Number non-break periods sequentially (1, 2, …); breaks get no number.
  let pno = 0;
  const periodCols = selectedPeriods.map((p) => ({
    p,
    num: p.is_break ? null : ++pno
  }));

  // Break / special columns render their label rotated vertically (reading up)
  // via the didDrawCell hook below. Map table column index → {name, time}; the
  // day-label column is index 0, so period column N sits at table index N + 1.
  const breakCols = new Map<number, { name: string; time: string }>();
  periodCols.forEach(({ p }, i) => {
    if (p.is_break) {
      breakCols.set(i + 1, {
        name: p.period_name || 'Break',
        time: `${fmtClock(p.start_time)} - ${fmtClock(p.end_time)}`
      });
    }
  });

  const headerCellStyle = {
    fillColor: HEADER_BLUE,
    fontStyle: 'bold' as const,
    halign: 'center' as const,
    valign: 'middle' as const
  };

  // Header = the time row only. The "Period" row lives in the BODY so a break
  // column can merge the Period row + every day row into ONE tall cell (head and
  // body cells can't merge across sections), giving a continuous "Break" label.
  const timeRow: any[] = [
    { content: 'Time\nDays', styles: headerCellStyle },
    // Timing shown for every column (incl. breaks) in the blue header row.
    ...periodCols.map(({ p }) => timeStack(p.start_time, p.end_time))
  ];

  // Body row 0 = Period numbers; a break column starts its full-height merge here
  // (rowSpan = period row + all axis rows) so the rotated label spans the column.
  const periodBodyRow: any[] = [
    { content: 'Period', styles: headerCellStyle },
    ...periodCols.map(({ p, num }) =>
      p.is_break
        ? {
            content: '',
            rowSpan: rowItems.length + 1,
            styles: { fillColor: BREAK_FILL }
          }
        : { content: String(num), styles: headerCellStyle }
    )
  ];

  // One row per axis item (day / cycle / date-range); break columns are omitted
  // here — covered by the merged cell that began in the Period row above.
  const dayRows = rowItems.map((row) => {
    const cells: any[] = [{ content: row.label, styles: headerCellStyle }];
    periodCols.forEach(({ p }) => {
      if (p.is_break) return;
      cells.push({
        content: getSlotCode(matchSlot(row.key, p.id)),
        styles: { halign: 'center' as const, valign: 'middle' as const }
      });
    });
    return cells;
  });

  const gridBody = [periodBodyRow, ...dayRows];

  // Day-label column fixed. Break columns are narrowed (their body label is drawn
  // rotated, so they need little width); a smaller header font keeps the stacked
  // time text from wrapping in the slim column. Class columns share the rest.
  const LABEL_COL_W = 18;
  const BREAK_COL_W = 16;
  const gridColumnStyles: Record<number, any> = {
    0: { cellWidth: LABEL_COL_W, fillColor: HEADER_BLUE, fontStyle: 'bold' }
  };
  breakCols.forEach((_meta, idx) => {
    gridColumnStyles[idx] = { cellWidth: BREAK_COL_W, fontSize: 6 };
  });

  // Break columns' true X/width are captured from the HEADER row, where every
  // column is present (day rows omit break columns via rowSpan, which corrupts
  // body-cell geometry) → accurate, drift-free centering. Period-row top Y comes
  // from the always-present col-0/row-0 body cell.
  const breakXGeom = new Map<number, { x: number; width: number }>();
  let bodyTopY = y;

  autoTable(doc, {
    startY: y,
    head: [timeRow],
    body: gridBody,
    theme: 'grid',
    styles: {
      font: 'times',
      fontSize: 9,
      cellPadding: 1,
      lineColor: [0, 0, 0],
      lineWidth: 0.3,
      textColor: [0, 0, 0],
      halign: 'center',
      valign: 'middle',
      minCellHeight: 8,
      overflow: 'linebreak'
    },
    headStyles: {
      fillColor: HEADER_BLUE,
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
      lineColor: [0, 0, 0],
      lineWidth: 0.3,
      fontSize: 9
    },
    columnStyles: gridColumnStyles,
    margin: { left: PDF_MARGIN, right: PDF_MARGIN },
    tableWidth,
    // Very wide grids (many cycles / date-ranges) break across pages while the
    // day/period label column repeats — keeps any institution's grid readable.
    horizontalPageBreak: true,
    horizontalPageBreakRepeat: 0,
    // Capture break columns' true X/width from the header row, and the Period
    // row's top Y from the col-0/row-0 body cell; labels are drawn after the table.
    didDrawCell: (d: any) => {
      if (
        d.section === 'head' &&
        breakCols.has(d.column.index) &&
        !breakXGeom.has(d.column.index)
      ) {
        breakXGeom.set(d.column.index, { x: d.cell.x, width: d.cell.width });
      }
      if (d.section === 'body' && d.row.index === 0 && d.column.index === 0) {
        bodyTopY = d.cell.y;
      }
    }
  });

  // Draw the rotated break labels now that the body bottom is known. Each break is
  // one tall merged column spanning the Period row + all day rows; center the
  // label between bodyTopY and the body bottom, shrinking the font if a long name
  // ("DIARY CHECKING") would exceed the available height.
  const gridBottom = lastY();
  const breakAvail = gridBottom - bodyTopY - 4;
  const breakCy = (bodyTopY + gridBottom) / 2;
  breakXGeom.forEach((g, idx) => {
    const p = periodCols[idx - 1]?.p; // column idx = periodCols index + 1
    const name = p?.period_name || 'Break';
    const cx = g.x + g.width / 2; // true column center from the header row
    doc.setFont('times', 'bold');
    let fs = 10;
    doc.setFontSize(fs);
    while (fs > 5 && doc.getTextWidth(name) > breakAvail) {
      fs -= 0.5;
      doc.setFontSize(fs);
    }
    doc.setTextColor(150, 40, 40);
    // Center along length manually (align:'center' is unreliable for rotated
    // text): reading up, anchor the first letter at breakCy + L/2 so the string
    // spans breakCy ± L/2. baseline:'middle' centers it across the column on cx.
    const labelLen = doc.getTextWidth(name);
    doc.text(name, cx, breakCy + labelLen / 2, {
      angle: 90,
      baseline: 'middle'
    });
    doc.setTextColor(0, 0, 0);
  });

  y = gridBottom + 6;

  // ── 4. Subject + handling-staff table (Theory / Practical) ────────────────
  const subjects = aggregateSubjects(slots);
  const theory = subjects.filter((s) => !s.practical);
  const practical = subjects.filter((s) => s.practical);

  const renderSubjectSection = (title: string, rows: SubjectAgg[]) => {
    if (rows.length === 0) return;
    if (y + 16 > pageHeight - PDF_MARGIN) {
      doc.addPage();
      y = PDF_MARGIN;
    }
    doc.setFont('times', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text(title, PDF_MARGIN, y);
    y += 1.5;
    autoTable(doc, {
      startY: y,
      head: [
        ['Sl.No', 'Sub.Code', 'Name of the Subject', 'Name of the Faculty', 'Week/Hrs']
      ],
      body: rows.map((r, i) => [
        i + 1,
        r.code,
        r.name,
        Array.from(r.faculty).join(', '),
        r.count
      ]),
      theme: 'grid',
      styles: {
        font: 'times',
        fontSize: 9,
        cellPadding: 1.5,
        lineColor: [0, 0, 0],
        lineWidth: 0.3,
        textColor: [0, 0, 0],
        valign: 'middle'
      },
      headStyles: {
        fillColor: HEADER_BLUE,
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        halign: 'center',
        lineColor: [0, 0, 0],
        lineWidth: 0.3
      },
      columnStyles: {
        0: { cellWidth: 14, halign: 'center' },
        1: { cellWidth: 28, halign: 'center' },
        3: { cellWidth: 95 },
        4: { cellWidth: 20, halign: 'center' }
      },
      // Reserve bottom space so a row breaks to the next page (header repeats by
      // default) instead of rendering under the page-number footer.
      margin: { left: PDF_MARGIN, right: PDF_MARGIN, bottom: PDF_MARGIN + 8 },
      tableWidth
    });
    y = lastY() + 4;
  };

  renderSubjectSection('Theory:', theory);
  renderSubjectSection('Practical:', practical);

  // ── 5. Signature row (Class In-Charge · Academic Co-ordinator · Principal) ──
  // Placed just below the end of the subject tables (with signing space above the
  // labels). If that would collide with the page-number footer, it moves to the
  // next page. Labels adapt per institution type (colleges → Co-ordinator/Chairman).
  {
    y += 18; // signing space below the table
    if (y > pageHeight - PDF_MARGIN - 8) {
      doc.addPage();
      y = PDF_MARGIN + 18;
    }
    doc.setFont('times', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(adapt('Class Co-ordinator'), PDF_MARGIN, y, { align: 'left' });
    doc.text(adapt('Class Chairman'), centerX, y, { align: 'center' });
    doc.text('Principal', pageWidth - PDF_MARGIN, y, { align: 'right' });
  }

  // ── Footer: timestamp + "Page X of Y" on every page ───────────────────────
  // Done as a final pass because the total page count is only known after all
  // content (subject tables / signature) has been laid out.
  const pageCount = doc.getNumberOfPages();
  const footerY = pageHeight - 5;
  const generatedAt = format(new Date(), 'dd MMM yyyy, hh:mm a');
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('times', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(generatedAt, PDF_MARGIN, footerY, { align: 'left' });
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - PDF_MARGIN, footerY, {
      align: 'right'
    });
    doc.setTextColor(0, 0, 0);
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const safeName = (timetable.timetable_name || 'timetable').replace(
    /[^a-z0-9\-_]+/gi,
    '_'
  );
  const fileName = `timetable-${safeName}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
  doc.save(fileName);
}

/**
 * Format date range marker for storage
 */
export function createRangeMarker(startDate: string, endDate: string): string {
  return `RANGE:${startDate}:${endDate}`;
}

/**
 * Parse range marker to get start and end dates
 */
export function parseRangeMarker(
  marker: string
): { start: string; end: string } | null {
  if (!marker.startsWith('RANGE:')) return null;

  const parts = marker.split(':');
  if (parts.length !== 3) return null;

  return {
    start: parts[1],
    end: parts[2]
  };
}

/**
 * Check if a period is locked (has attendance marked)
 */
export function isPeriodLocked(periodId: string, markedPeriods: string[]): boolean {
  return markedPeriods.includes(periodId);
}
