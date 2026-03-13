'use client';

import { useState } from 'react';
import { FileSpreadsheet, FileText, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format as formatDate } from 'date-fns';
import toast from 'react-hot-toast';
import type {
  FacilitatorAttendanceStat,
  FacilitatorReportSummary,
  FacilitatorReportFilters,
  FacilitatorDepartmentBreakdown,
} from '@/types/attendance';

interface Props {
  facilitators: FacilitatorAttendanceStat[];
  summary: FacilitatorReportSummary;
  departmentBreakdown: FacilitatorDepartmentBreakdown[];
  filters: FacilitatorReportFilters;
  facilitatorSearch: string;
}

export function FacilitatorExportActions({
  facilitators,
  summary,
  departmentBreakdown,
  filters,
  facilitatorSearch,
}: Props) {
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);

  // Apply client-side facilitator search filter (same as data table)
  const getFilteredData = () => {
    if (!facilitatorSearch) return facilitators;
    const term = facilitatorSearch.toLowerCase();
    return facilitators.filter(
      (f) =>
        f.firstName?.toLowerCase().includes(term) ||
        f.lastName?.toLowerCase().includes(term) ||
        `${f.firstName} ${f.lastName}`.toLowerCase().includes(term) ||
        f.designation?.toLowerCase().includes(term)
    );
  };

  const getFilename = (ext: string) => {
    const dateRange = `${filters.dateFrom}_to_${filters.dateTo}`;
    return `facilitator-attendance-report_${dateRange}.${ext}`;
  };

  const getFilterDescription = () => {
    const parts: string[] = [];
    parts.push(
      `Date Range: ${formatDate(new Date(filters.dateFrom), 'MMM d, yyyy')} - ${formatDate(new Date(filters.dateTo), 'MMM d, yyyy')}`
    );
    if (filters.departmentId) {
      const dept = departmentBreakdown.find((d) => d.departmentId === filters.departmentId);
      parts.push(`Department: ${dept?.departmentName || 'Selected'}`);
    }
    if (facilitatorSearch) {
      parts.push(`Search: "${facilitatorSearch}"`);
    }
    return parts.join(' | ');
  };

  const getRateLabel = (rate: number) => {
    if (rate >= 80) return 'Excellent';
    if (rate >= 60) return 'Good';
    if (rate >= 40) return 'Average';
    return 'Low';
  };

  // ─────────────────── EXCEL EXPORT ───────────────────
  const handleExportExcel = async () => {
    setExporting('excel');
    try {
      const XLSX = await import('xlsx');
      const data = getFilteredData();
      const wb = XLSX.utils.book_new();

      // --- Sheet 1: Summary ---
      const summaryRows: any[][] = [
        ['Facilitator Attendance Report'],
        [],
        ['Generated On', formatDate(new Date(), 'PPP p')],
        ['Filters Applied', getFilterDescription()],
        [],
        ['SUMMARY METRICS'],
        ['Metric', 'Value'],
        ['Total Facilitators', summary.totalFacilitators],
        ['Total Periods Assigned', summary.totalPeriodsAssigned],
        ['Total Periods Marked', summary.totalPeriodsMarked],
        ['Total Periods Pending', summary.totalPeriodsPending],
        ['Avg Periods / Facilitator', summary.avgPeriodsPerFacilitator],
        ['Overall Marking Rate', `${summary.overallMarkingRate.toFixed(1)}%`],
      ];
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
      wsSummary['!cols'] = [{ wch: 28 }, { wch: 50 }];
      // Merge title row
      wsSummary['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

      // --- Sheet 2: Full Details (Facilitator + Timetable sub-rows) ---
      const fullDetailRows: any[][] = [];
      // Header row
      fullDetailRows.push([
        'S.No',
        'Type',
        'Staff Name',
        'Designation',
        'Department',
        'Timetable Name',
        'Assigned',
        'Marked',
        'Pending',
        'Rate (%)',
        'Performance',
        'Last Marked',
      ]);

      data.forEach((f, idx) => {
        const fullName = `${f.firstName} ${f.lastName}`.trim();
        const timetableCount = f.timetableAssignments?.length || 0;

        // Main facilitator row
        fullDetailRows.push([
          idx + 1,
          'Facilitator',
          fullName,
          f.designation || '-',
          f.departmentName || '-',
          timetableCount > 0 ? `${timetableCount} Timetable(s)` : 'No Timetables',
          f.periodsAssigned,
          f.periodsMarked,
          f.periodsPending,
          f.markingRate.toFixed(1),
          getRateLabel(f.markingRate),
          f.lastMarkedAt ? formatDate(new Date(f.lastMarkedAt), 'MMM d, yyyy HH:mm') : 'Never',
        ]);

        // Timetable sub-rows for this facilitator
        if (f.timetableAssignments && f.timetableAssignments.length > 0) {
          f.timetableAssignments.forEach((ta) => {
            const taRate = ta.assignedCount > 0
              ? (ta.markedCount / ta.assignedCount) * 100
              : 0;
            fullDetailRows.push([
              '',                              // No S.No for sub-rows
              '  └ Timetable',                // Indented type indicator
              '',                              // Name (empty for timetable row)
              '',                              // Designation
              '',                              // Department
              ta.timetableName,               // Timetable name
              ta.assignedCount,
              ta.markedCount,
              ta.pendingCount,
              taRate.toFixed(1),
              getRateLabel(taRate),
              '',                              // No last marked for timetable
            ]);
          });
        }

        // Empty separator row between facilitators
        fullDetailRows.push([]);
      });

      const wsFull = XLSX.utils.aoa_to_sheet(fullDetailRows);
      wsFull['!cols'] = [
        { wch: 6 },  // S.No
        { wch: 14 }, // Type
        { wch: 25 }, // Name
        { wch: 20 }, // Designation
        { wch: 25 }, // Department
        { wch: 32 }, // Timetable Name
        { wch: 10 }, // Assigned
        { wch: 10 }, // Marked
        { wch: 10 }, // Pending
        { wch: 10 }, // Rate
        { wch: 12 }, // Performance
        { wch: 20 }, // Last Marked
      ];
      XLSX.utils.book_append_sheet(wb, wsFull, 'Full Details');

      // --- Sheet 3: Facilitator Overview (flat, one row per facilitator) ---
      const overviewHeaders = [
        'S.No', 'Staff Name', 'Designation', 'Department',
        'Timetable(s)', 'Total Assigned', 'Total Marked', 'Total Pending',
        'Marking Rate (%)', 'Performance', 'Last Marked',
      ];
      const overviewRows = data.map((f, idx) => [
        idx + 1,
        `${f.firstName} ${f.lastName}`.trim(),
        f.designation || '-',
        f.departmentName || '-',
        f.timetableAssignments?.map((ta) => ta.timetableName).join(', ') || '-',
        f.periodsAssigned,
        f.periodsMarked,
        f.periodsPending,
        f.markingRate.toFixed(1),
        getRateLabel(f.markingRate),
        f.lastMarkedAt ? formatDate(new Date(f.lastMarkedAt), 'MMM d, yyyy') : 'Never',
      ]);
      const wsOverview = XLSX.utils.aoa_to_sheet([overviewHeaders, ...overviewRows]);
      wsOverview['!cols'] = [
        { wch: 6 }, { wch: 25 }, { wch: 20 }, { wch: 25 },
        { wch: 35 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
        { wch: 14 }, { wch: 12 }, { wch: 18 },
      ];
      XLSX.utils.book_append_sheet(wb, wsOverview, 'Facilitator Overview');

      // --- Sheet 4: Timetable Breakdown (flat, one row per timetable assignment) ---
      const ttHeaders = [
        'S.No', 'Staff Name', 'Department', 'Timetable Name',
        'Assigned', 'Marked', 'Pending', 'Rate (%)', 'Performance',
      ];
      const ttRows: any[][] = [];
      let ttIdx = 0;
      data.forEach((f) => {
        (f.timetableAssignments ?? []).forEach((ta) => {
          ttIdx++;
          const rate = ta.assignedCount > 0
            ? (ta.markedCount / ta.assignedCount) * 100
            : 0;
          ttRows.push([
            ttIdx,
            `${f.firstName} ${f.lastName}`.trim(),
            f.departmentName || '-',
            ta.timetableName,
            ta.assignedCount,
            ta.markedCount,
            ta.pendingCount,
            rate.toFixed(1),
            getRateLabel(rate),
          ]);
        });
      });

      if (ttRows.length > 0) {
        const wsTT = XLSX.utils.aoa_to_sheet([ttHeaders, ...ttRows]);
        wsTT['!cols'] = [
          { wch: 6 }, { wch: 25 }, { wch: 25 }, { wch: 32 },
          { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
        ];
        XLSX.utils.book_append_sheet(wb, wsTT, 'Timetable Breakdown');
      }

      // --- Sheet 5: Department Breakdown ---
      if (departmentBreakdown.length > 0) {
        const deptHeaders = [
          'Department', 'Facilitators', 'Total Assigned', 'Total Marked',
          'Total Pending', 'Avg Rate (%)', 'Performance',
        ];
        const deptRows = departmentBreakdown.map((d) => [
          d.departmentName,
          d.facilitatorCount,
          d.totalAssigned,
          d.totalMarked,
          d.totalPending,
          d.avgRate.toFixed(1),
          getRateLabel(d.avgRate),
        ]);
        const wsDept = XLSX.utils.aoa_to_sheet([deptHeaders, ...deptRows]);
        wsDept['!cols'] = [
          { wch: 30 }, { wch: 12 }, { wch: 14 },
          { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 },
        ];
        XLSX.utils.book_append_sheet(wb, wsDept, 'Department Breakdown');
      }

      XLSX.writeFile(wb, getFilename('xlsx'));
      toast.success(`Exported ${data.length} facilitators to Excel (${ttRows.length} timetable assignments)`);
    } catch (error) {
      toast.error('Failed to export Excel');
    } finally {
      setExporting(null);
    }
  };

  // ─────────────────── PDF EXPORT ───────────────────
  const handleExportPDF = async () => {
    setExporting('pdf');
    try {
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;

      const data = getFilteredData();
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      // --- Page 1: Title + Summary ---
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Facilitator Attendance Report', 14, 18);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100);
      doc.text(`Generated: ${formatDate(new Date(), 'PPP p')}`, 14, 26);
      doc.text(`Filters: ${getFilterDescription()}`, 14, 31);
      doc.setTextColor(0);

      // Summary KPI table
      autoTable(doc, {
        head: [['Facilitators', 'Assigned', 'Marked', 'Pending', 'Avg / Facilitator', 'Overall Rate']],
        body: [[
          String(summary.totalFacilitators),
          String(summary.totalPeriodsAssigned),
          String(summary.totalPeriodsMarked),
          String(summary.totalPeriodsPending),
          summary.avgPeriodsPerFacilitator.toFixed(1),
          `${summary.overallMarkingRate.toFixed(1)}%`,
        ]],
        startY: 37,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 3, halign: 'center' },
        headStyles: { fillColor: [124, 58, 237], textColor: 255, fontStyle: 'bold' },
        bodyStyles: { fontStyle: 'bold', fontSize: 10 },
      });

      // --- Page 1 continued: Facilitator Overview Table ---
      const overviewHead = [
        'S.No', 'Staff Name', 'Designation', 'Department',
        'Timetables', 'Assigned', 'Marked', 'Pending', 'Rate (%)', 'Last Marked'
      ];
      const overviewBody = data.map((f, idx) => [
        String(idx + 1),
        `${f.firstName} ${f.lastName}`.trim(),
        f.designation || '-',
        f.departmentName || '-',
        String(f.timetableAssignments?.length || 0),
        String(f.periodsAssigned),
        String(f.periodsMarked),
        String(f.periodsPending),
        f.markingRate.toFixed(1),
        f.lastMarkedAt ? formatDate(new Date(f.lastMarkedAt), 'MMM d') : 'Never',
      ]);

      let currentY = (doc as any).lastAutoTable?.finalY ?? 55;

      autoTable(doc, {
        head: [overviewHead],
        body: overviewBody,
        startY: currentY + 8,
        theme: 'striped',
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { halign: 'center', cellWidth: 10 },
          4: { halign: 'center', cellWidth: 18 },
          5: { halign: 'center', cellWidth: 16 },
          6: { halign: 'center', cellWidth: 14 },
          7: { halign: 'center', cellWidth: 14 },
          8: { halign: 'center', cellWidth: 16 },
        },
        didParseCell: (hookData) => {
          if (hookData.section === 'body' && hookData.column.index === 8) {
            const rate = parseFloat(String(hookData.cell.raw));
            if (rate >= 80) hookData.cell.styles.textColor = [22, 163, 74];
            else if (rate >= 60) hookData.cell.styles.textColor = [37, 99, 235];
            else if (rate >= 40) hookData.cell.styles.textColor = [202, 138, 4];
            else hookData.cell.styles.textColor = [220, 38, 38];
          }
          if (hookData.section === 'body' && hookData.column.index === 7) {
            const pending = parseInt(String(hookData.cell.raw), 10);
            if (pending > 0) hookData.cell.styles.textColor = [220, 38, 38];
          }
        },
      });

      // --- New Page: Per-Facilitator Timetable Details ---
      doc.addPage();
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Facilitator-wise Timetable Details', 14, 18);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100);
      doc.text('Each facilitator\'s assigned timetables with individual marking statistics', 14, 24);
      doc.setTextColor(0);

      currentY = 30;

      data.forEach((f, idx) => {
        const fullName = `${f.firstName} ${f.lastName}`.trim();
        const assignments = f.timetableAssignments ?? [];

        // Check if we need a new page (at least 40mm needed for header + 1 row)
        const pageH = doc.internal.pageSize.getHeight();
        if (currentY > pageH - 45) {
          doc.addPage();
          currentY = 18;
        }

        // Facilitator header bar
        doc.setFillColor(240, 240, 250);
        doc.rect(14, currentY, pageWidth - 28, 10, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(30, 30, 80);
        doc.text(
          `${idx + 1}. ${fullName}`,
          16,
          currentY + 6.5
        );

        // Right side: overall stats
        const statsText = `${f.designation || '-'} | ${f.departmentName || '-'} | Overall: ${f.periodsMarked}/${f.periodsAssigned} (${f.markingRate.toFixed(1)}%)`;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(80);
        doc.text(statsText, pageWidth - 16, currentY + 6.5, { align: 'right' });
        doc.setTextColor(0);

        currentY += 12;

        if (assignments.length === 0) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(8);
          doc.setTextColor(150);
          doc.text('No timetable assignments found', 20, currentY + 4);
          doc.setTextColor(0);
          currentY += 10;
        } else {
          // Timetable detail table for this facilitator
          const ttHead = ['Timetable Name', 'Assigned', 'Marked', 'Pending', 'Rate (%)', 'Performance'];
          const ttBody = assignments.map((ta) => {
            const rate = ta.assignedCount > 0
              ? (ta.markedCount / ta.assignedCount) * 100
              : 0;
            return [
              ta.timetableName,
              String(ta.assignedCount),
              String(ta.markedCount),
              String(ta.pendingCount),
              rate.toFixed(1),
              getRateLabel(rate),
            ];
          });

          autoTable(doc, {
            head: [ttHead],
            body: ttBody,
            startY: currentY,
            margin: { left: 20, right: 20 },
            theme: 'grid',
            styles: { fontSize: 7.5, cellPadding: 2 },
            headStyles: {
              fillColor: [100, 116, 139],
              textColor: 255,
              fontStyle: 'bold',
              fontSize: 7.5,
            },
            columnStyles: {
              1: { halign: 'center', cellWidth: 18 },
              2: { halign: 'center', cellWidth: 16 },
              3: { halign: 'center', cellWidth: 16 },
              4: { halign: 'center', cellWidth: 18 },
              5: { halign: 'center', cellWidth: 22 },
            },
            didParseCell: (hookData) => {
              // Color-code rate column
              if (hookData.section === 'body' && hookData.column.index === 4) {
                const rate = parseFloat(String(hookData.cell.raw));
                if (rate >= 80) hookData.cell.styles.textColor = [22, 163, 74];
                else if (rate >= 60) hookData.cell.styles.textColor = [37, 99, 235];
                else if (rate >= 40) hookData.cell.styles.textColor = [202, 138, 4];
                else hookData.cell.styles.textColor = [220, 38, 38];
              }
              // Color-code performance
              if (hookData.section === 'body' && hookData.column.index === 5) {
                const label = String(hookData.cell.raw);
                if (label === 'Excellent') hookData.cell.styles.textColor = [22, 163, 74];
                else if (label === 'Good') hookData.cell.styles.textColor = [37, 99, 235];
                else if (label === 'Average') hookData.cell.styles.textColor = [202, 138, 4];
                else hookData.cell.styles.textColor = [220, 38, 38];
              }
              // Pending red
              if (hookData.section === 'body' && hookData.column.index === 3) {
                const pending = parseInt(String(hookData.cell.raw), 10);
                if (pending > 0) hookData.cell.styles.textColor = [220, 38, 38];
              }
            },
          });

          currentY = ((doc as any).lastAutoTable?.finalY ?? currentY + 14) + 6;
        }
      });

      // --- Department Breakdown Page ---
      if (departmentBreakdown.length > 0) {
        doc.addPage();
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Department Breakdown', 14, 18);

        autoTable(doc, {
          head: [['Department', 'Facilitators', 'Assigned', 'Marked', 'Pending', 'Avg Rate (%)', 'Performance']],
          body: departmentBreakdown.map((d) => [
            d.departmentName,
            String(d.facilitatorCount),
            String(d.totalAssigned),
            String(d.totalMarked),
            String(d.totalPending),
            d.avgRate.toFixed(1),
            getRateLabel(d.avgRate),
          ]),
          startY: 24,
          theme: 'grid',
          styles: { fontSize: 9, cellPadding: 3 },
          headStyles: { fillColor: [124, 58, 237], textColor: 255, fontStyle: 'bold' },
          columnStyles: {
            1: { halign: 'center' },
            2: { halign: 'center' },
            3: { halign: 'center' },
            4: { halign: 'center' },
            5: { halign: 'center' },
            6: { halign: 'center' },
          },
          didParseCell: (hookData) => {
            if (hookData.section === 'body' && hookData.column.index === 6) {
              const label = String(hookData.cell.raw);
              if (label === 'Excellent') hookData.cell.styles.textColor = [22, 163, 74];
              else if (label === 'Good') hookData.cell.styles.textColor = [37, 99, 235];
              else if (label === 'Average') hookData.cell.styles.textColor = [202, 138, 4];
              else hookData.cell.styles.textColor = [220, 38, 38];
            }
          },
        });
      }

      // --- Footer on all pages ---
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        const pageH = doc.internal.pageSize.getHeight();
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text(
          `Page ${i} of ${pageCount} | Facilitator Attendance Report | ${formatDate(new Date(), 'PPP')}`,
          pageWidth / 2,
          pageH - 6,
          { align: 'center' }
        );
      }

      doc.save(getFilename('pdf'));
      toast.success(`Exported ${data.length} facilitators to PDF`);
    } catch (error) {
      toast.error('Failed to export PDF');
    } finally {
      setExporting(null);
    }
  };

  const isDisabled = facilitators.length === 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={isDisabled || !!exporting}
          className="h-9"
        >
          {exporting ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="mr-1.5 h-3.5 w-3.5" />
          )}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-xs">Export Report</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleExportExcel}
          disabled={!!exporting}
          className="cursor-pointer"
        >
          <FileSpreadsheet className="mr-2 h-4 w-4 text-green-600" />
          <div>
            <p className="font-medium">Excel (.xlsx)</p>
            <p className="text-xs text-muted-foreground">
              Full details with per-facilitator timetable breakdown
            </p>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={handleExportPDF}
          disabled={!!exporting}
          className="cursor-pointer"
        >
          <FileText className="mr-2 h-4 w-4 text-red-600" />
          <div>
            <p className="font-medium">PDF (.pdf)</p>
            <p className="text-xs text-muted-foreground">
              Printable report with individual timetable details
            </p>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
