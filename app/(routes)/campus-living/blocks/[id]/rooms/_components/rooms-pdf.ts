/**
 * PDF export for a block's rooms list (Campus Living → Blocks → Rooms).
 *
 * Mirrors the jspdf + jspdf-autotable pattern in
 * lib/utils/pdf-export/sarvam-galatta-pdf.ts: landscape A4, header +
 * status summary + auto-table + page numbers. Reuses the room-meta label
 * helpers so PDF labels can't drift from the on-screen table.
 *
 * Loaded via dynamic import from the rooms page so jsPDF stays out of the
 * initial page bundle.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import type { HostelRoomWithBedsAndOccupancy } from '@/lib/services/campus-living/hostel-room-service';
import { formatRoomPurpose, formatTierAccess } from './room-meta';

const FLOOR_LABELS = ['Ground Floor', '1st Floor', '2nd Floor', '3rd Floor'];
const floorLabel = (f: number) => FLOOR_LABELS[f] ?? `Floor ${f}`;

// Mirrors the statusConfig labels in rooms-columns.tsx.
const STATUS_LABELS: Record<string, string> = {
  available: 'Available',
  partially_occupied: 'Partial',
  full: 'Full',
  maintenance: 'Maintenance',
  reserved: 'Reserved',
  closed: 'Closed',
  unknown: 'Unknown',
};
const statusLabel = (s: string) => STATUS_LABELS[s] ?? s;

const cap = (s: string | null | undefined) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';

export interface RoomsPdfContext {
  blockName: string;
  filters: string[]; // human-readable active filters; [] => none
}

export async function exportRoomsPdf(
  rooms: HostelRoomWithBedsAndOccupancy[],
  ctx: RoomsPdfContext
): Promise<void> {
  const doc = new jsPDF('l', 'mm', 'a4'); // landscape — wide 13-column table
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 14;

  // ── Header ──────────────────────────────────────────────────────────────
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`Hostel Rooms — ${ctx.blockName}`, margin, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(
    `Generated: ${format(new Date(), 'dd MMM yyyy, HH:mm')}  ·  Total: ${rooms.length} room${rooms.length === 1 ? '' : 's'}`,
    margin,
    y
  );
  y += 5;
  doc.text(
    `Filters: ${ctx.filters.length ? ctx.filters.join('  ·  ') : 'None (all rooms in block)'}`,
    margin,
    y
  );
  doc.setTextColor(0, 0, 0);
  y += 8;

  // ── Status summary ──────────────────────────────────────────────────────
  const count = (s: string) => rooms.filter((r) => r.derived_status === s).length;
  autoTable(doc, {
    startY: y,
    head: [['Total', 'Available', 'Partial', 'Full']],
    body: [[
      String(rooms.length),
      String(count('available')),
      String(count('partially_occupied')),
      String(count('full')),
    ]],
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59] },
    styles: { fontSize: 10, fontStyle: 'bold', halign: 'center' },
    margin: { left: margin, right: margin },
    tableWidth: 110,
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ── Main table ──────────────────────────────────────────────────────────
  const body = rooms.map((r) => [
    r.room_number ?? '—',
    floorLabel(r.floor),
    cap(r.room_type),
    cap((r.ac_status ?? '').replace('_', ' ')),
    r.hostel_categories?.name ?? '—',
    formatRoomPurpose(r.room_purpose),
    formatTierAccess(r.tier_access),
    `${r.active_residents}/${r.capacity}`,
    r.actual_capacity != null ? String(r.actual_capacity) : '—',
    statusLabel(r.derived_status),
    r.has_attached_bathroom ? 'Yes' : 'No',
    r.renovated || '—',
    r.painting || '—',
  ]);

  autoTable(doc, {
    startY: y,
    head: [[
      'Room No.', 'Floor', 'Type', 'AC', 'Category', 'Purpose', 'Tier',
      'Occ.', 'Actual', 'Status', 'Bath', 'Renovated', 'Painting',
    ]],
    body,
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    styles: { fontSize: 7, cellPadding: 1.8, overflow: 'linebreak' },
    columnStyles: {
      7: { halign: 'center' },  // Occupancy
      8: { halign: 'center' },  // Actual capacity
      10: { halign: 'center' }, // Bathroom
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

  const safeName = ctx.blockName.replace(/[^a-z0-9]/gi, '_').slice(0, 40) || 'block';
  doc.save(`${safeName}_rooms_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}
