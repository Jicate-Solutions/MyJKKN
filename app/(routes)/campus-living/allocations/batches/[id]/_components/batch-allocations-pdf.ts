/**
 * PDF export for an allocation batch's proposed/approved mapping
 * (Campus Living → Allocations → Batches → Detail).
 *
 * Same jspdf + jspdf-autotable pattern as the rooms / sarvam-galatta exporters:
 * landscape A4, header + summary + auto-table + page numbers. Loaded via dynamic
 * import from the page so jsPDF stays out of the initial page bundle.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import type { AllocationBatchRow, ProposedAllocation } from '@/types/allocation-batch';

const FLOOR_LABELS = ['Ground Floor', '1st Floor', '2nd Floor', '3rd Floor'];
const floorLabel = (f: number | null) =>
  f == null ? '—' : FLOOR_LABELS[f] ?? `Floor ${f}`;

export async function exportBatchAllocationsPdf(
  batch: AllocationBatchRow,
  allocations: ProposedAllocation[]
): Promise<void> {
  const doc = new jsPDF('l', 'mm', 'a4'); // landscape — wide allocation table
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 14;

  // ── Header ──────────────────────────────────────────────────────────────
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`Allocation Batch — ${batch.category_name ?? 'Batch'}`, margin, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(
    `Block: ${batch.block_name ?? '—'}  ·  Institution: ${batch.institution_name ?? '—'}  ·  Status: ${batch.status.replace('_', ' ')}`,
    margin,
    y
  );
  y += 5;
  doc.text(
    `Generated: ${format(new Date(), 'dd MMM yyyy, HH:mm')}  ·  ${batch.allocated_count} proposed${batch.skipped_count > 0 ? `  ·  ${batch.skipped_count} skipped` : ''}`,
    margin,
    y
  );
  doc.setTextColor(0, 0, 0);
  y += 8;

  // ── Summary ─────────────────────────────────────────────────────────────
  const roomsUsed = new Set(
    allocations.map((a) => a.room_number).filter(Boolean)
  ).size;
  const bedsAllocated = allocations.filter((a) => a.bed_number).length;
  autoTable(doc, {
    startY: y,
    head: [['Students Allocated', 'Rooms Used', 'Beds Allocated', 'Block Capacity']],
    body: [[
      String(allocations.length),
      String(roomsUsed),
      String(bedsAllocated),
      batch.block_total_capacity != null ? String(batch.block_total_capacity) : '—',
    ]],
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59] },
    styles: { fontSize: 10, fontStyle: 'bold', halign: 'center' },
    margin: { left: margin, right: margin },
    tableWidth: 150,
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ── Main table ──────────────────────────────────────────────────────────
  const rows = allocations.map((a) => [
    a.learner_name,
    a.learner_institution ?? '—',
    a.learner_program ?? '—',
    a.learner_semester ?? '—',
    a.block_name ?? '—',
    a.room_number ?? '—',
    floorLabel(a.room_floor),
    a.room_category ?? '—',
    a.mess_category ?? '—',
    a.bed_number ?? '—',
    a.status.replace('_', ' '),
  ]);

  autoTable(doc, {
    startY: y,
    head: [[
      'Learner', 'Institution', 'Program', 'Semester', 'Block', 'Room',
      'Floor', 'Room Category', 'Mess Category', 'Bed', 'Status',
    ]],
    body: rows,
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    styles: { fontSize: 7.5, cellPadding: 1.8, overflow: 'linebreak' },
    columnStyles: {
      9: { halign: 'center' },  // Bed
    },
    margin: { left: margin, right: margin },
  });

  // ── Page numbers ────────────────────────────────────────────────────────
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' }
    );
  }

  const safe =
    (batch.category_name ?? 'batch').replace(/[^a-z0-9]/gi, '_').slice(0, 40) || 'batch';
  doc.save(`${safe}_allocations_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}
