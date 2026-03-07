/**
 * PDF Export Utility for Startup Studio Event Registrations
 * Created: 2026-03-07
 * Purpose: Generate institution-grouped PDF report of all registered teams
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import type { EventRegistration } from '@/types/startup-studio';

interface ExportFilters {
  status?: string;
  institution?: string;
  search?: string;
  lovable?: string;
}

interface InstitutionGroup {
  name: string;
  teams: EventRegistration[];
}

export class RegistrationsPDFExporter {
  private doc: jsPDF;
  private pageWidth: number;
  private pageHeight: number;
  private margin = 14;
  private y = 14;

  constructor() {
    this.doc = new jsPDF('l', 'mm', 'a4'); // landscape for wide table
    this.pageWidth = this.doc.internal.pageSize.getWidth();
    this.pageHeight = this.doc.internal.pageSize.getHeight();
  }

  async export(
    registrations: EventRegistration[],
    eventName: string,
    filters: ExportFilters = {}
  ): Promise<void> {
    // Group registrations by institution
    const groups = this.groupByInstitution(registrations);

    this.addHeader(eventName, registrations.length, filters);
    this.addOverallSummary(registrations, groups);

    for (const group of groups) {
      this.addInstitutionSection(group);
    }

    this.addPageNumbers();

    const safeEventName = eventName.replace(/[^a-z0-9]/gi, '_').slice(0, 40);
    this.doc.save(`${safeEventName}_registrations_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  }

  private groupByInstitution(registrations: EventRegistration[]): InstitutionGroup[] {
    const map = new Map<string, InstitutionGroup>();

    for (const reg of registrations) {
      const key = (reg as any).institution?.id || 'unknown';
      const name = (reg as any).institution?.name || 'Unknown Institution';

      if (!map.has(key)) {
        map.set(key, { name, teams: [] });
      }
      map.get(key)!.teams.push(reg);
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  private addHeader(eventName: string, totalTeams: number, filters: ExportFilters) {
    // JKKN title bar
    this.doc.setFillColor(15, 23, 42); // dark navy
    this.doc.rect(0, 0, this.pageWidth, 18, 'F');
    this.doc.setTextColor(255, 255, 255);
    this.doc.setFontSize(11);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('JKKN STARTUP STUDIO', this.margin, 11);
    this.doc.setFontSize(8);
    this.doc.setFont('helvetica', 'normal');
    this.doc.text(`Exported: ${format(new Date(), 'dd MMM yyyy, hh:mm a')}`, this.pageWidth - this.margin, 11, { align: 'right' });

    this.y = 26;

    // Event name
    this.doc.setTextColor(15, 23, 42);
    this.doc.setFontSize(16);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(eventName, this.margin, this.y);
    this.y += 6;

    this.doc.setFontSize(10);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setTextColor(80, 80, 80);
    this.doc.text('Team Registrations Report — Institution Wise', this.margin, this.y);
    this.y += 5;

    // Applied filters line
    const activeFilters: string[] = [];
    if (filters.status && filters.status !== 'all') activeFilters.push(`Status: ${filters.status}`);
    if (filters.institution) activeFilters.push(`Institution: ${filters.institution}`);
    if (filters.lovable && filters.lovable !== 'all') activeFilters.push(`Lovable: ${filters.lovable}`);
    if (filters.search) activeFilters.push(`Search: "${filters.search}"`);

    if (activeFilters.length > 0) {
      this.doc.setFontSize(8);
      this.doc.setTextColor(100, 100, 100);
      this.doc.text(`Filters applied: ${activeFilters.join(' | ')}`, this.margin, this.y);
      this.y += 5;
    }

    // Divider
    this.doc.setDrawColor(200, 200, 200);
    this.doc.line(this.margin, this.y, this.pageWidth - this.margin, this.y);
    this.y += 6;
  }

  private addOverallSummary(registrations: EventRegistration[], groups: InstitutionGroup[]) {
    this.doc.setFontSize(11);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setTextColor(15, 23, 42);
    this.doc.text('Overall Summary', this.margin, this.y);
    this.y += 5;

    // Institution summary table
    const summaryRows = groups.map((group) => {
      const allMembers = group.teams.flatMap((t) =>
        ((t as any).team_members || []).filter((m: any) => m.status === 'accepted')
      );
      return [
        group.name,
        group.teams.length,
        allMembers.length,
        allMembers.filter((m: any) => m.has_laptop).length,
        group.teams.filter((t: any) => t.lovable_verified).length,
        group.teams.filter((t: any) => t.checked_in).length,
        group.teams.filter((t: any) => t.status === 'disqualified').length,
      ];
    });

    // Totals row
    const allMembers = registrations.flatMap((t) =>
      ((t as any).team_members || []).filter((m: any) => m.status === 'accepted')
    );
    summaryRows.push([
      'TOTAL',
      registrations.length,
      allMembers.length,
      allMembers.filter((m: any) => m.has_laptop).length,
      registrations.filter((t: any) => t.lovable_verified).length,
      registrations.filter((t: any) => t.checked_in).length,
      registrations.filter((t: any) => t.status === 'disqualified').length,
    ]);

    autoTable(this.doc, {
      startY: this.y,
      head: [['Institution', 'Teams', 'Members', 'Laptops', 'Lovable ✓', 'Checked In', 'Disqualified']],
      body: summaryRows,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell: (data) => {
        // Bold the totals row
        if (data.row.index === summaryRows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [226, 232, 240];
        }
      },
      margin: { left: this.margin, right: this.margin },
    });

    this.y = (this.doc as any).lastAutoTable.finalY + 10;
  }

  private addInstitutionSection(group: InstitutionGroup) {
    // Check if we need a new page (leave 60mm min)
    if (this.y > this.pageHeight - 60) {
      this.doc.addPage();
      this.y = 18;
    }

    // Institution header
    this.doc.setFillColor(226, 232, 240);
    this.doc.rect(this.margin, this.y - 4, this.pageWidth - this.margin * 2, 8, 'F');
    this.doc.setFontSize(10);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setTextColor(15, 23, 42);
    this.doc.text(group.name.toUpperCase(), this.margin + 2, this.y + 1);

    const instAllMembers = group.teams.flatMap((t) =>
      ((t as any).team_members || []).filter((m: any) => m.status === 'accepted')
    );
    const instStats = `${group.teams.length} teams · ${instAllMembers.length} members · ${instAllMembers.filter((m: any) => m.has_laptop).length} laptops`;
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(8);
    this.doc.setTextColor(80, 80, 80);
    this.doc.text(instStats, this.pageWidth - this.margin - 2, this.y + 1, { align: 'right' });

    this.y += 8;

    // Teams table for this institution
    const rows = group.teams.map((reg, idx) => {
      const members = ((reg as any).team_members || []).filter((m: any) => m.status === 'accepted');
      const leader = members.find((m: any) => m.is_leader);
      const memberNames = members.map((m: any) => m.full_name || m.email || '—').join(', ');
      const laptopCount = members.filter((m: any) => m.has_laptop).length;

      return [
        idx + 1,
        (reg as any).team_code || '—',
        reg.team_name,
        leader?.full_name || (reg as any).owner?.full_name || '—',
        members.length,
        `${laptopCount}/${members.length}`,
        (reg as any).lovable_verified ? '✓' : '—',
        (reg as any).checked_in ? 'Checked In' : reg.status === 'disqualified' ? 'Disqualified' : 'Registered',
        (reg as any).problem_idea
          ? this.doc.splitTextToSize((reg as any).problem_idea, 55).slice(0, 2).join(' ').slice(0, 80)
          : '—',
      ];
    });

    autoTable(this.doc, {
      startY: this.y,
      head: [['#', 'Code', 'Team Name', 'Leader', 'Members', 'Laptops', 'Lovable', 'Status', 'Problem / Idea']],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [51, 65, 85], textColor: 255, fontSize: 7.5, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7.5, cellPadding: 2 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 20 },
        2: { cellWidth: 38 },
        3: { cellWidth: 38 },
        4: { cellWidth: 16, halign: 'center' },
        5: { cellWidth: 18, halign: 'center' },
        6: { cellWidth: 16, halign: 'center' },
        7: { cellWidth: 24 },
        8: { cellWidth: 'auto' },
      },
      margin: { left: this.margin, right: this.margin },
    });

    this.y = (this.doc as any).lastAutoTable.finalY + 8;

    // Member details sub-section for this institution
    this.addMembersDetail(group);
  }

  private addMembersDetail(group: InstitutionGroup) {
    if (this.y > this.pageHeight - 50) {
      this.doc.addPage();
      this.y = 18;
    }

    this.doc.setFontSize(8);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setTextColor(80, 80, 80);
    this.doc.text(`Member Details — ${group.name}`, this.margin, this.y);
    this.y += 4;

    const memberRows: any[] = [];
    group.teams.forEach((reg) => {
      const members = ((reg as any).team_members || []).filter((m: any) => m.status === 'accepted');
      members.forEach((m: any) => {
        memberRows.push([
          reg.team_name,
          (reg as any).team_code || '—',
          m.full_name || '—',
          m.student_id || m.email || '—',
          m.is_leader ? 'Leader' : 'Member',
          m.has_laptop ? 'Yes' : 'No',
        ]);
      });
    });

    autoTable(this.doc, {
      startY: this.y,
      head: [['Team Name', 'Code', 'Member Name', 'Student ID / Email', 'Role', 'Laptop']],
      body: memberRows,
      theme: 'plain',
      headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85], fontSize: 7, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7, cellPadding: 1.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 22 },
        2: { cellWidth: 50 },
        3: { cellWidth: 55 },
        4: { cellWidth: 18 },
        5: { cellWidth: 16, halign: 'center' },
      },
      margin: { left: this.margin, right: this.margin },
    });

    this.y = (this.doc as any).lastAutoTable.finalY + 12;
  }

  private addPageNumbers() {
    const totalPages = (this.doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      this.doc.setPage(i);
      this.doc.setFontSize(7);
      this.doc.setTextColor(150, 150, 150);
      this.doc.text(
        `Page ${i} of ${totalPages}`,
        this.pageWidth / 2,
        this.pageHeight - 6,
        { align: 'center' }
      );
      this.doc.text('JKKN Startup Studio — Confidential', this.margin, this.pageHeight - 6);
    }
  }
}

export async function exportRegistrationsPDF(
  registrations: EventRegistration[],
  eventName: string,
  filters: ExportFilters = {}
): Promise<void> {
  const exporter = new RegistrationsPDFExporter();
  await exporter.export(registrations, eventName, filters);
}
