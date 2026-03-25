/**
 * PDF Export Utility — Sarvam Galatta Individual Registrations
 * Created: 2026-03-23
 * Purpose: Generate a paginated PDF report of all individual registrations
 *          grouped by approval status, following the registrations-pdf.ts pattern.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import type { SarvamGalattaRegistration } from '@/types/sarvam-galatta';

export class SarvamGalattaPDFExporter {
  private doc: jsPDF;
  private pageWidth: number;
  private margin = 14;
  private y = 14;

  constructor() {
    this.doc = new jsPDF('l', 'mm', 'a4'); // landscape for wide table
    this.pageWidth = this.doc.internal.pageSize.getWidth();
  }

  async export(registrations: SarvamGalattaRegistration[], eventName: string): Promise<void> {
    this.addHeader(eventName, registrations.length);
    this.addStatusSummary(registrations);
    this.addMainTable(registrations);
    this.addPageNumbers();

    const safe = eventName.replace(/[^a-z0-9]/gi, '_').slice(0, 40);
    this.doc.save(`${safe}_sarvam_galatta_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  }

  private addHeader(eventName: string, total: number): void {
    this.doc.setFontSize(16);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('Sarvam Galatta — Individual Registrations', this.margin, this.y);
    this.y += 8;

    this.doc.setFontSize(11);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setTextColor(100, 100, 100);
    this.doc.text(`Event: ${eventName}`, this.margin, this.y);
    this.y += 6;
    this.doc.text(
      `Generated: ${format(new Date(), 'dd MMM yyyy, HH:mm')}  ·  Total Registrations: ${total}`,
      this.margin,
      this.y
    );
    this.doc.setTextColor(0, 0, 0);
    this.y += 10;
  }

  private addStatusSummary(registrations: SarvamGalattaRegistration[]): void {
    const shortlisted = registrations.filter((r) => r.approval_status === 'shortlisted').length;
    const rejected = registrations.filter((r) => r.approval_status === 'rejected').length;
    const waitlisted = registrations.filter((r) => r.approval_status === 'waitlisted').length;

    autoTable(this.doc, {
      startY: this.y,
      head: [['Total', 'Shortlisted', 'Waitlisted', 'Rejected']],
      body: [[
        String(registrations.length),
        String(shortlisted),
        String(waitlisted),
        String(rejected),
      ]],
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59] },
      styles: { fontSize: 10, fontStyle: 'bold', halign: 'center' },
      margin: { left: this.margin, right: this.margin },
      tableWidth: 100,
    });

    this.y = (this.doc as any).lastAutoTable.finalY + 8;
  }

  private addMainTable(registrations: SarvamGalattaRegistration[]): void {
    const rows = registrations.map((r) => [
      [r.snap_first_name, r.snap_last_name].filter(Boolean).join(' '),
      r.owner_email ?? '—',
      r.team_name ?? '—',
      r.institution_name ?? '—',
      r.program_name ?? '—',
      r.semester_name ?? '—',
      r.approval_status,
      r.project_url ? '✓' : '—',
      r.github_url ? '✓' : '—',
      r.submitted_at ? format(new Date(r.submitted_at), 'dd MMM yyyy') : '—',
    ]);

    autoTable(this.doc, {
      startY: this.y,
      head: [['Name', 'Email', 'Team Name', 'Institution', 'Program', 'Semester', 'Status', 'Project', 'GitHub', 'Submitted']],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { fontSize: 8, cellPadding: 2.5 },
      columnStyles: {
        0: { cellWidth: 38 },  // Name
        1: { cellWidth: 48 },  // Email
        2: { cellWidth: 35 },  // Team Name
        3: { cellWidth: 35 },  // Institution
        4: { cellWidth: 25 },  // Program
        5: { cellWidth: 20 },  // Semester
        6: { cellWidth: 22 },  // Status
        7: { cellWidth: 15, halign: 'center' },  // Project
        8: { cellWidth: 15, halign: 'center' },  // GitHub
        9: { cellWidth: 24 },  // Submitted
      },
      margin: { left: this.margin, right: this.margin },
    });
  }

  private addPageNumbers(): void {
    const pageCount = (this.doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      this.doc.setPage(i);
      this.doc.setFontSize(8);
      this.doc.setTextColor(150, 150, 150);
      this.doc.text(
        `Page ${i} of ${pageCount}`,
        this.pageWidth / 2,
        this.doc.internal.pageSize.getHeight() - 8,
        { align: 'center' }
      );
    }
  }
}

export async function exportSarvamGalattaPDF(
  registrations: SarvamGalattaRegistration[],
  eventName: string
): Promise<void> {
  const exporter = new SarvamGalattaPDFExporter();
  await exporter.export(registrations, eventName);
}
