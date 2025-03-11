import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format as formatDate } from 'date-fns';
import { UsageReport } from '@/types/resources';

export class ExportService {
  /**
   * Export data to CSV format
   */
  static exportToCSV<T extends Record<string, any>>(
    data: T[],
    headers: Record<keyof T, string>,
    filename: string
  ): void {
    // Create CSV content
    const headerRow = Object.values(headers).join(',');
    const rows = data.map((item) =>
      Object.keys(headers)
        .map((key) => {
          // Handle values with commas by wrapping in quotes
          const value = item[key];
          return typeof value === 'string' && value.includes(',')
            ? `"${value}"`
            : value;
        })
        .join(',')
    );
    const csvContent = [headerRow, ...rows].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    saveAs(blob, `${filename}.csv`);
  }

  /**
   * Export data to Excel format
   */
  static exportToExcel<T extends Record<string, any>>(
    data: T[],
    headers: Record<keyof T, string>,
    filename: string,
    sheetName: string = 'Sheet1'
  ): void {
    // Create worksheet
    const worksheet = XLSX.utils.json_to_sheet(
      data.map((item) => {
        const row: Record<string, any> = {};
        Object.entries(headers).forEach(([key, header]) => {
          row[header] = item[key];
        });
        return row;
      })
    );

    // Create workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    // Generate Excel file and download
    XLSX.writeFile(workbook, `${filename}.xlsx`);
  }

  /**
   * Export data to PDF format
   */
  static exportToPDF<T extends Record<string, any>>(
    data: T[],
    headers: Record<keyof T, string>,
    filename: string,
    title: string,
    orientation: 'portrait' | 'landscape' = 'portrait'
  ): void {
    // Create PDF document
    const doc = new jsPDF({
      orientation,
      unit: 'mm',
      format: 'a4'
    });

    // Add title
    doc.setFontSize(16);
    doc.text(title, 14, 20);
    doc.setFontSize(10);
    doc.text(`Generated on: ${formatDate(new Date(), 'PPP')}`, 14, 28);

    // Prepare table data
    const headerValues = Object.values(headers);
    const tableData = data.map((item) =>
      Object.keys(headers).map((key) => item[key])
    );

    // Add table
    autoTable(doc, {
      head: [headerValues],
      body: tableData,
      startY: 35,
      theme: 'grid',
      styles: {
        fontSize: 9,
        cellPadding: 3
      },
      headStyles: {
        fillColor: [66, 139, 202],
        textColor: 255,
        fontStyle: 'bold'
      }
    });

    // Save PDF
    doc.save(`${filename}.pdf`);
  }

  /**
   * Export usage report to different formats
   */
  static exportUsageReport(
    report: UsageReport,
    exportType: 'csv' | 'excel' | 'pdf'
  ): void {
    // Format dates
    const startDate = formatDate(new Date(report.start_date), 'MMM d, yyyy');
    const endDate = formatDate(new Date(report.end_date), 'MMM d, yyyy');
    const createdAt = formatDate(new Date(report.created_at), 'MMM d, yyyy');

    // Prepare report data
    const reportData = {
      resource: report.resource?.resource_name || 'Unknown Resource',
      period: `${startDate} - ${endDate}`,
      utilization: `${report.metrics.utilization_percentage.toFixed(1)}%`,
      total_hours: `${report.metrics.total_hours_used.toFixed(1)} hours`,
      reservations: report.metrics.reservation_count,
      unique_users: report.metrics.unique_users,
      cross_institution: report.metrics.cross_institution_usage || 0,
      generated: createdAt
    };

    // Define headers
    const headers = {
      resource: 'Resource',
      period: 'Period',
      utilization: 'Utilization Rate',
      total_hours: 'Total Hours Used',
      reservations: 'Reservations',
      unique_users: 'Unique Users',
      cross_institution: 'Cross-Institution Usage',
      generated: 'Generated On'
    };

    const filename = `usage-report-${report.id}-${formatDate(
      new Date(),
      'yyyy-MM-dd'
    )}`;
    const title = `Usage Report: ${reportData.resource}`;

    // Export based on format
    switch (exportType) {
      case 'csv':
        this.exportToCSV([reportData], headers, filename);
        break;
      case 'excel':
        this.exportToExcel([reportData], headers, filename, 'Usage Report');
        break;
      case 'pdf':
        this.exportToPDF([reportData], headers, filename, title, 'landscape');
        break;
    }
  }

  /**
   * Export multiple usage reports to different formats
   */
  static exportMultipleUsageReports(
    reports: UsageReport[],
    exportType: 'csv' | 'excel' | 'pdf'
  ): void {
    // Prepare report data
    const reportsData = reports.map((report) => {
      const startDate = formatDate(new Date(report.start_date), 'MMM d, yyyy');
      const endDate = formatDate(new Date(report.end_date), 'MMM d, yyyy');
      const createdAt = formatDate(new Date(report.created_at), 'MMM d, yyyy');

      return {
        resource: report.resource?.resource_name || 'Unknown Resource',
        period: `${startDate} - ${endDate}`,
        utilization: `${report.metrics.utilization_percentage.toFixed(1)}%`,
        total_hours: `${report.metrics.total_hours_used.toFixed(1)} hours`,
        reservations: report.metrics.reservation_count,
        unique_users: report.metrics.unique_users,
        cross_institution: report.metrics.cross_institution_usage || 0,
        generated: createdAt
      };
    });

    // Define headers
    const headers = {
      resource: 'Resource',
      period: 'Period',
      utilization: 'Utilization Rate',
      total_hours: 'Total Hours Used',
      reservations: 'Reservations',
      unique_users: 'Unique Users',
      cross_institution: 'Cross-Institution Usage',
      generated: 'Generated On'
    };

    const filename = `usage-reports-${formatDate(new Date(), 'yyyy-MM-dd')}`;
    const title = 'Usage Reports';

    // Export based on format
    switch (exportType) {
      case 'csv':
        this.exportToCSV(reportsData, headers, filename);
        break;
      case 'excel':
        this.exportToExcel(reportsData, headers, filename, 'Usage Reports');
        break;
      case 'pdf':
        this.exportToPDF(reportsData, headers, filename, title, 'landscape');
        break;
    }
  }
}
