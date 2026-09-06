// Fresher Induction — report PDF (day-wise and session-wise).
//
// ONE renderer serves BOTH report tabs. mode='attendance' prints the stored
// mark; mode='feedback' prints a Yes/No "Feedback Submitted". Everything else —
// letterhead, program banding, ordering, signature block — is identical on
// purpose, so the two sheets read as one family of document.
//
// Formatted after the INTERNAL MARK ENTRY SHEET (lib/utils/internal-marks/
// internal-marks-pdf.ts): same letterhead dispatcher (CET gets its printed
// stationery, every other college the shared banner), same Times/A4 portrait
// grid tables, same footer, same signature block. An induction attendance sheet
// is the same class of signed academic record, so it should not look like a
// different document family.
//
// Structure:
//   1. Letterhead (single left logo) + event name + the report title +
//      the day-or-session line, with date left / venue right.
//   2. ONE TABLE PER PROGRAM — heading row carries "CODE - Program Name" on the
//      left and that program's head count on the right; body is
//      S.No | Student Name | Date of Birth | Father Mobile Number |
//      Attendance-or-Feedback Submitted | Remarks, ordered by student name.
//      Remarks is left EMPTY on purpose — it is the hand-written column.
//   3. Grand total across all programs.
//   4. Summary table — one row per program: Total / Present / Absent / Excused /
//      On Duty / Not Marked (attendance), or Total / Submitted / Not Submitted
//      (feedback), closed by a TOTAL row.
//   5. Signature block.
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { drawBosClaimHeader } from '@/lib/utils/internal-marks/internal-marks-pdf'
import { getInstitutionHeader } from '@/lib/utils/internal-marks/institution-header'

export type ReportAttendanceStatus = 'present' | 'absent' | 'excused' | 'od' | null

export interface InductionAttendanceReportRow {
  name: string
  program_code?: string | null
  program_name: string | null
  date_of_birth?: string | null
  mobile?: string | null
  status: ReportAttendanceStatus
  /** Day scope only: this learner's sessions that day carry DIFFERENT marks. */
  is_mixed?: boolean
  /** Did this learner submit feedback for the scope? Drives the Feedback Report. */
  feedback_submitted?: boolean
}

/** Which report this sheet is. Both share the layout; only the mark column and
 *  the summary columns differ, which is why one renderer serves both. */
export type ReportMode = 'attendance' | 'feedback'

export interface InductionAttendanceReportData {
  /** Host institution — drives the letterhead. */
  institutionName?: string | null
  /** MyJKKN counselling_code; resolves branding more reliably than the name. */
  institutionCode?: string | null
  /** institutions.logo_url — the college's own mark, when it has one. */
  institutionLogoUrl?: string | null
  eventName: string
  /** "Day 2" or the session title — printed as the report's scope line. */
  scopeLabel: string
  /** Left meta cell under the title (date, or date + time for a session). */
  scopeDate?: string | null
  /** Right meta cell under the title (venue / batch). */
  scopeVenue?: string | null
  /** 'attendance' (default) prints the mark column; 'feedback' prints Yes/No. */
  mode?: ReportMode
  rows: InductionAttendanceReportRow[]
}

// A4 portrait, matching the internal-marks sheet
const A4_WIDTH = 210
const A4_HEIGHT = 297
const MARGIN = 10
const TABLE_WIDTH = A4_WIDTH - MARGIN * 2

/** Human label for a mark, as printed in the Attendance column. */
export function attendanceLabel(row: InductionAttendanceReportRow): string {
  if (row.is_mixed) return 'Varies by session'
  switch (row.status) {
    case 'present': return 'Present'
    case 'absent':  return 'Absent'
    case 'excused': return 'Excused'
    case 'od':      return 'On Duty'
    default:        return 'Not marked'
  }
}

/** dd-MM-yyyy, or '-' for a learner with no DOB on file. */
function fmtDob(iso?: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`
}

export interface ProgramGroup {
  code: string | null
  name: string
  /** "CODE - Name", or just the name when the program has no code on file. */
  heading: string
  rows: InductionAttendanceReportRow[]
  total: number
  present: number
  absent: number
  excused: number
  od: number
  notMarked: number
  mixed: number
  /** Feedback Report tallies — counted in the same single pass. */
  submitted: number
  notSubmitted: number
}

/**
 * Bucket the roster into per-program groups, each internally sorted by student
 * name. Groups are ordered by program; the "no program on file" bucket lands
 * LAST rather than first — an empty program string would otherwise win every
 * localeCompare and open the sheet with the least identifiable rows. Same
 * convention the marking dialogs use for their program filter.
 *
 * Exported so the on-screen table renders the SAME grouping and counts the PDF
 * prints — there is one grouping implementation, not two that can drift.
 */
export function groupRosterByProgram(rows: InductionAttendanceReportRow[]): ProgramGroup[] {
  const map = new Map<string, ProgramGroup>()

  for (const r of rows) {
    const name = (r.program_name ?? '').trim()
    const code = (r.program_code ?? '').trim() || null
    const key = `${code ?? ''}|${name}`
    let g = map.get(key)
    if (!g) {
      g = {
        code,
        name: name || 'No program on file',
        heading: name ? (code ? `${code} - ${name}` : name) : 'No program on file',
        rows: [],
        total: 0, present: 0, absent: 0, excused: 0, od: 0, notMarked: 0, mixed: 0,
        submitted: 0, notSubmitted: 0,
      }
      map.set(key, g)
    }
    g.rows.push(r)
    g.total++
    if (r.feedback_submitted) g.submitted++
    else g.notSubmitted++
    if (r.is_mixed) g.mixed++
    else if (r.status === 'present') g.present++
    else if (r.status === 'absent') g.absent++
    else if (r.status === 'excused') g.excused++
    else if (r.status === 'od') g.od++
    else g.notMarked++
  }

  const groups = [...map.values()]
  for (const g of groups) g.rows.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  return groups.sort((a, b) => {
    const an = (a.rows[0]?.program_name ?? '').trim()
    const bn = (b.rows[0]?.program_name ?? '').trim()
    if (!an && bn) return 1
    if (an && !bn) return -1
    return a.heading.localeCompare(b.heading)
  })
}

/**
 * Fetch an image and inline it as a data URL. jsPDF cannot resolve a bare path
 * or a remote URL, so a logo must be inlined first. Browser-only; resolves
 * undefined on any failure (missing file, CORS, offline) because a logo is
 * decoration — it must never abort the export.
 */
async function toDataUrl(url?: string | null): Promise<string | undefined> {
  if (!url) return undefined
  try {
    const res = await fetch(url)
    if (!res.ok) return undefined
    const blob = await res.blob()
    return await new Promise<string | undefined>((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve(undefined)
      reader.readAsDataURL(blob)
    })
  } catch {
    return undefined
  }
}

/** Shared cell styling for every table on the sheet. */
const BASE_STYLES = {
  font: 'times',
  fontSize: 10,
  cellPadding: 1.8,
  lineColor: [0, 0, 0] as [number, number, number],
  lineWidth: 0.3,
  textColor: [0, 0, 0] as [number, number, number],
  valign: 'middle' as const,
  overflow: 'linebreak' as const,
}

const HEAD_STYLES = {
  font: 'times',
  fontStyle: 'bold' as const,
  fillColor: [240, 240, 240] as [number, number, number],
  textColor: [0, 0, 0] as [number, number, number],
  halign: 'center' as const,
  fontSize: 10,
}

/** Render the report and return the jsPDF doc (caller saves / previews it). */
export async function generateInductionAttendancePdf(
  data: InductionAttendanceReportData,
): Promise<jsPDF> {
  const mode: ReportMode = data.mode ?? 'attendance'
  const brand = getInstitutionHeader(data.institutionName, data.institutionCode)

  // Single LEFT logo — the institution's uploaded logo_url when it has one, else
  // the college's branding mark (CET ships its own; others fall back to the JKKN
  // trust logo). No right-hand mark.
  const logoImage = await toDataUrl(data.institutionLogoUrl || brand.logoImage || '/logo.png')

  const doc = new jsPDF('portrait', 'mm', 'a4')
  const pageWidth = A4_WIDTH
  const pageHeight = A4_HEIGHT
  let currentY = MARGIN

  // ========== HEADER ==========
  currentY = drawBosClaimHeader(
    doc,
    {
      institution_name: brand.institution_name,
      institution_accreditation: brand.institution_accreditation,
      institution_address: brand.institution_address,
      logoImage,
    },
    pageWidth,
    currentY,
  )

  doc.setFont('times', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(0, 0, 0)
  doc.text(data.eventName.toUpperCase(), pageWidth / 2, currentY, { align: 'center' })
  currentY += 5

  doc.text(mode === 'feedback' ? 'FEEDBACK REPORT' : 'ATTENDANCE REPORT', pageWidth / 2, currentY, { align: 'center' })
  currentY += 5

  doc.setFont('times', 'normal')
  doc.setFontSize(9)
  const scopeLines = doc.splitTextToSize(data.scopeLabel, TABLE_WIDTH)
  doc.text(scopeLines, pageWidth / 2, currentY, { align: 'center' })
  currentY += scopeLines.length * 4.5 + 1.5

  if (data.scopeDate || data.scopeVenue) {
    doc.setFont('times', 'bold')
    doc.setFontSize(9)
    if (data.scopeDate) doc.text(`Date: ${data.scopeDate}`, MARGIN, currentY)
    if (data.scopeVenue) {
      doc.setFont('times', 'normal')
      doc.text(`Venue: ${data.scopeVenue}`, pageWidth - MARGIN, currentY, { align: 'right' })
    }
    currentY += 4.5
  }
  currentY += 2

  const groups = groupRosterByProgram(data.rows)

  // ========== PROGRAM-WISE TABLES ==========
  // Column widths sum to TABLE_WIDTH (190mm) exactly.
  const snoW = 12
  const nameW = 52
  const dobW = 24
  const mobW = 34
  const attW = 26
  const remW = TABLE_WIDTH - snoW - nameW - dobW - mobW - attW  // 42

  for (const g of groups) {
    // Never open a program band in the last few mm of a page — a heading
    // stranded above a page break reads as an empty program.
    if (currentY + 26 > pageHeight - 14) { doc.addPage(); currentY = MARGIN }
    autoTable(doc, {
      startY: currentY,
      margin: { left: MARGIN, right: MARGIN, bottom: 12 },
      tableWidth: TABLE_WIDTH,
      theme: 'grid',
      head: [
        // Program band — code + name left, head count right.
        [
          { content: g.heading, colSpan: 5, styles: { halign: 'left' as const, fillColor: [222, 234, 246] as [number, number, number] } },
          { content: `Students: ${g.total}`, styles: { halign: 'right' as const, fillColor: [222, 234, 246] as [number, number, number] } },
        ],
        ['S.No', 'Student Name', 'Date of Birth', 'Father Mobile Number',
          mode === 'feedback' ? 'Feedback Submitted' : 'Attendance', 'Remarks'],
      ],
      body: g.rows.map((r, i) => [
        i + 1,
        r.name || 'Unnamed',
        fmtDob(r.date_of_birth),
        r.mobile || '-',
        // Feedback Report: a definite Yes/No — "no row" IS "did not submit", so
        // there is nothing indeterminate to leave blank.
        // Attendance Report: the stored mark, blank rather than "Not marked" so
        // an un-marked sheet prints as something to fill in by hand.
        mode === 'feedback'
          ? (r.feedback_submitted ? 'Yes' : 'No')
          : (r.status || r.is_mixed ? attendanceLabel(r) : ''),
        // Remarks is always empty — a ruled column for notes written on paper.
        '',
      ]),
      // No per-program total row: the head count already sits in the program
      // band above, and the SUMMARY table repeats it per program.
      styles: BASE_STYLES,
      headStyles: HEAD_STYLES,
      columnStyles: {
        0: { cellWidth: snoW, halign: 'center' },
        1: { cellWidth: nameW, halign: 'left' },
        2: { cellWidth: dobW, halign: 'center' },
        3: { cellWidth: mobW, halign: 'center' },
        4: { cellWidth: attW, halign: 'center' },
        5: { cellWidth: remW, halign: 'center' },
      },
    })
    currentY = ((doc as any).lastAutoTable?.finalY ?? currentY) + 5
  }

  // ========== GRAND TOTAL ==========
  const grand = groups.reduce(
    (a, g) => ({
      total: a.total + g.total,
      present: a.present + g.present,
      absent: a.absent + g.absent,
      excused: a.excused + g.excused,
      od: a.od + g.od,
      notMarked: a.notMarked + g.notMarked,
      mixed: a.mixed + g.mixed,
      submitted: a.submitted + g.submitted,
      notSubmitted: a.notSubmitted + g.notSubmitted,
    }),
    { total: 0, present: 0, absent: 0, excused: 0, od: 0, notMarked: 0, mixed: 0, submitted: 0, notSubmitted: 0 },
  )

  if (currentY + 12 > pageHeight - 14) { doc.addPage(); currentY = MARGIN }
  doc.setFont('times', 'bold')
  doc.setFontSize(10)
  doc.text(
    `Total Programs: ${groups.length}        Total Students: ${grand.total}`,
    MARGIN,
    currentY + 2,
  )
  currentY += 8

  // ========== SUMMARY ==========
  if (currentY + 30 > pageHeight - 14) { doc.addPage(); currentY = MARGIN }

  doc.setFont('times', 'bold')
  doc.setFontSize(10)
  doc.text('SUMMARY', MARGIN, currentY)
  currentY += 3

  // The two reports summarise different things, so the summary table is built
  // from a per-mode spec rather than by hiding columns: attendance breaks down
  // by mark, feedback by submitted / not submitted.
  const sSno = 12
  const summaryHead = mode === 'feedback'
    ? ['S.No', 'Program', 'Total Students', 'Submitted', 'Not Submitted']
    : ['S.No', 'Program', 'Total Students', 'Present', 'Absent', 'Excused', 'On Duty', 'Not Marked']
  const summaryBody = groups.map((g, i) => (mode === 'feedback'
    ? [i + 1, g.heading, g.total, g.submitted, g.notSubmitted]
    : [i + 1, g.heading, g.total, g.present, g.absent, g.excused, g.od, g.notMarked + g.mixed]))
  const summaryFoot = mode === 'feedback'
    ? [grand.total, grand.submitted, grand.notSubmitted]
    : [grand.total, grand.present, grand.absent, grand.excused, grand.od, grand.notMarked + grand.mixed]

  // Numeric columns share one width; Program absorbs whatever is left, so both
  // layouts fill exactly TABLE_WIDTH.
  const sNumCount = summaryHead.length - 2
  const sNum = mode === 'feedback' ? 30 : 20
  const sProg = TABLE_WIDTH - sSno - sNum * sNumCount
  const summaryColumnStyles: Record<number, any> = {
    0: { cellWidth: sSno, halign: 'center' },
    1: { cellWidth: sProg, halign: 'left' },
  }
  for (let c = 2; c < summaryHead.length; c++) {
    summaryColumnStyles[c] = { cellWidth: sNum, halign: 'center' }
  }

  autoTable(doc, {
    startY: currentY,
    margin: { left: MARGIN, right: MARGIN, bottom: 12 },
    tableWidth: TABLE_WIDTH,
    theme: 'grid',
    head: [summaryHead],
    body: summaryBody,
    foot: [[
      { content: 'TOTAL', colSpan: 2, styles: { halign: 'right' as const } },
      ...summaryFoot,
    ]],
    styles: { ...BASE_STYLES, fontSize: 9 },
    headStyles: { ...HEAD_STYLES, fontSize: 9 },
    footStyles: {
      font: 'times',
      fontStyle: 'bold' as const,
      fillColor: [240, 240, 240] as [number, number, number],
      textColor: [0, 0, 0] as [number, number, number],
      fontSize: 9,
      halign: 'center' as const,
    },
    columnStyles: summaryColumnStyles,
  })
  currentY = ((doc as any).lastAutoTable?.finalY ?? currentY) + 16

  // ========== SIGNATURE SECTION ==========
  if (currentY + 14 > pageHeight - 14) { doc.addPage(); currentY = MARGIN + 12 }

  const sigLabels = [
    'Signature of the Session In-Charge',
    'Signature of the Induction Coordinator',
    'Signature of the Principal',
  ]
  const sigWidth = TABLE_WIDTH / sigLabels.length

  doc.setFont('times', 'normal')
  doc.setFontSize(9)
  sigLabels.forEach((label, i) => {
    const centerX = MARGIN + i * sigWidth + sigWidth / 2
    const lineX1 = MARGIN + i * sigWidth + 8
    const lineX2 = MARGIN + (i + 1) * sigWidth - 8
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.2)
    doc.line(lineX1, currentY, lineX2, currentY)
    doc.text(label, centerX, currentY + 4, { align: 'center' })
  })

  // ========== FOOTER ==========
  // Stamped once per page AFTER everything else, rather than from each table's
  // didDrawPage hook: pages can be created by any of the tables OR by the manual
  // page breaks above, and only here is the final page count known — so every
  // page gets exactly one footer and it can read "Page i of N".
  const pageCount = doc.getNumberOfPages()
  const stamp = new Date().toLocaleString('en-IN')
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFont('times', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(128, 128, 128)
    doc.text(stamp, MARGIN, pageHeight - 6)
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - MARGIN, pageHeight - 6, { align: 'right' })
    doc.setTextColor(0, 0, 0)
  }

  return doc
}

/** Convenience: render + trigger a browser download. */
export async function downloadInductionAttendancePdf(
  data: InductionAttendanceReportData,
  fileName: string,
): Promise<void> {
  const doc = await generateInductionAttendancePdf(data)
  doc.save(fileName)
}
