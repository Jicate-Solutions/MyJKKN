import { toast } from "sonner";
import * as XLSX from "xlsx";


// Generic type for exportable data - should have string keys and values that can be converted to string
export type ExportableData = Record<string, string | number | boolean | null | undefined>;

// Type for transformation function that developers can provide
export type DataTransformFunction<T extends ExportableData> = (row: T) => ExportableData;

/**
 * Map data rows onto their labelled worksheet columns.
 *
 * `headers` are DATA KEYS (`attendance_date`); `columnMapping` supplies each
 * key's display label ('Date'). Passing the LABELS as `headers` matches
 * nothing on the row, so every row comes back `{}` — a spreadsheet with the
 * right row count and no columns, which opens blank.
 *
 * `resolvedKeys` reports which headers actually existed on the data, so
 * callers can fail loudly instead of writing that blank file.
 */
export function buildExcelRows<T extends ExportableData>(
  data: T[],
  headers: string[],
  columnMapping: Record<string, string>,
  transformFunction?: DataTransformFunction<T>
): { rows: ExportableData[]; resolvedKeys: string[] } {
  const resolved = new Set<string>();

  const rows = data.map((item) => {
    const transformedItem = transformFunction ? transformFunction(item) : item;

    const row: ExportableData = {};
    for (const key of headers) {
      if (key in transformedItem) {
        resolved.add(key);
        row[columnMapping[key] || key] = transformedItem[key];
      }
    }
    return row;
  });

  // Preserve the caller's header order rather than Set insertion order.
  return { rows, resolvedKeys: headers.filter((h) => resolved.has(h)) };
}

/**
 * Convert array of objects to CSV string
 */
function convertToCSV<T extends ExportableData>(
  data: T[], 
  headers: string[], 
  columnMapping?: Record<string, string>,
  transformFunction?: DataTransformFunction<T>
): string {
  if (data.length === 0) {
    throw new Error("No data to export");
  }

  // Create CSV header row with column mapping if provided
  let csvContent = "";

  if (columnMapping) {
    // Use column mapping for header names
    const headerRow = headers.map(header => {
      const mappedHeader = columnMapping[header] || header;
      // Escape quotes and wrap in quotes if contains comma
      return mappedHeader.includes(",") || mappedHeader.includes('"')
        ? `"${mappedHeader.replace(/"/g, '""')}"`
        : mappedHeader;
    });
    csvContent = `${headerRow.join(",")}\n`;
  } else {
    // Use original headers
    csvContent = `${headers.join(",")}\n`;
  }

  // Add data rows
  for (const item of data) {
    // Apply transformation function if provided
    const transformedItem = transformFunction ? transformFunction(item) : item;
    
    const row = headers.map(header => {
      // Get the value for this header from the transformed item
      const value = transformedItem[header];

      // Convert all values to string and properly escape for CSV
      const cellValue = value === null || value === undefined ? "" : String(value);
      // Escape quotes and wrap in quotes if contains comma
      const escapedValue = cellValue.includes(",") || cellValue.includes('"')
        ? `"${cellValue.replace(/"/g, '""')}"`
        : cellValue;

      return escapedValue;
    });

    csvContent += `${row.join(",")}\n`;
  }

  return csvContent;
}

/**
 * Download blob as file
 */
function downloadFile(blob: Blob, filename: string) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Export data to CSV file
 */
export function exportToCSV<T extends ExportableData>(
  data: T[],
  filename: string,
  headers: string[] = Object.keys(data[0] || {}),
  columnMapping?: Record<string, string>,
  transformFunction?: DataTransformFunction<T>
): boolean {
  if (data.length === 0) {
    console.error("No data to export");
    return false;
  }

  try {
    // Apply transformation function first if provided, then filter data to only include specified headers
    const processedData = data.map(item => {
      // Apply transformation function if provided
      const transformedItem = transformFunction ? transformFunction(item) : item;
      
      // Filter to only include specified headers
      const filteredItem: ExportableData = {};
      for (const header of headers) {
        if (header in transformedItem) {
          filteredItem[header] = transformedItem[header];
        }
      }
      return filteredItem;
    });

    // Same failure as the Excel path: no requested header exists on the data,
    // so every row would be blank under a correct-looking header line. Surface
    // it rather than handing the user an empty file.
    if (headers.length > 0 && processedData.every(row => Object.keys(row).length === 0)) {
      console.error(
        `Export produced no columns: none of [${headers.join(', ')}] ` +
          `exist on the data (available: ${Object.keys(data[0] || {}).join(', ')}). ` +
          'exportConfig.headers must be DATA KEYS; columnMapping supplies the labels.'
      );
      return false;
    }

    const csvContent = convertToCSV(processedData, headers, columnMapping);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    downloadFile(blob, `${filename}.csv`);
    return true;
  } catch (error) {
    console.error("Error creating CSV:", error);
    return false;
  }
}

/**
 * Export data to Excel file using xlsx package
 */
export function exportToExcel<T extends ExportableData>(
  data: T[],
  filename: string,
  columnMapping?: Record<string, string>,
  columnWidths?: Array<{ wch: number }>,
  headers?: string[],
  transformFunction?: DataTransformFunction<T>
): boolean {
  if (data.length === 0) {
    console.error("No data to export");
    return false;
  }

  try {
    // If no column mapping is provided, create one from the data keys
    const mapping = columnMapping ||
      Object.keys(data[0] || {}).reduce((acc, key) => {
        acc[key] = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
        return acc;
      }, {} as Record<string, string>);

    // If headers are provided, only include those columns
    const columnsToExport = headers || Object.keys(mapping);
    const { rows: worksheetData, resolvedKeys } = buildExcelRows(
      data,
      columnsToExport,
      mapping,
      transformFunction
    );

    // Not one requested column exists on the data — writing this would produce
    // a file with rows and no columns, i.e. a download that opens blank under a
    // green "Export successful" toast. Fail loudly instead (rule #27). The
    // usual cause is display LABELS passed as `exportConfig.headers` where the
    // pipeline expects data keys.
    if (resolvedKeys.length === 0) {
      console.error(
        `Export produced no columns: none of [${columnsToExport.join(', ')}] ` +
          `exist on the data (available: ${Object.keys(data[0] || {}).join(', ')}). ` +
          'exportConfig.headers must be DATA KEYS; columnMapping supplies the labels.'
      );
      return false;
    }

    // Create a worksheet
    const worksheet = XLSX.utils.json_to_sheet(worksheetData);

    // Set column widths if provided
    if (columnWidths) {
      worksheet["!cols"] = columnWidths;
    }

    // Create a workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data");

    // Generate Excel file
    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array"
    });

    // Create blob and download
    const blob = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });

    downloadFile(blob, `${filename}.xlsx`);
    return true;
  } catch (error) {
    console.error("Error creating Excel file:", error);
    return false;
  }
}

/**
 * Per-table PDF export options. Supplied by a page via
 * `exportConfig.pdf`; its presence is what makes the PDF entries appear in
 * the Export menu, so tables that don't opt in are completely unaffected.
 */
export interface PdfExportOptions {
  /**
   * Column keys to print, in order. Defaults to the CSV/XLSX `headers`.
   * A PDF page fits far fewer columns than a spreadsheet — a table with a
   * 25+ column export schema should pass a readable subset here.
   */
  headers?: string[];
  /** Title line at the top of page 1. Defaults to the entity name. */
  title?: string;
  /** Optional second line under the title (e.g. active filters, scope). */
  subtitle?: string;
  /** Landscape (default) suits wide tables; portrait suits <= 6 columns. */
  orientation?: "portrait" | "landscape";
}

/**
 * Export data to a paginated PDF using jspdf + jspdf-autotable.
 *
 * jsPDF is pulled in via dynamic import so it stays out of every bundle that
 * merely renders a DataTable — it is only fetched when a user actually picks
 * a PDF export. Mirrors the pattern in
 * app/(routes)/campus-living/blocks/[id]/rooms/_components/rooms-pdf.ts.
 */
export async function exportToPDF<T extends ExportableData>(
  data: T[],
  filename: string,
  columnMapping?: Record<string, string>,
  headers?: string[],
  transformFunction?: DataTransformFunction<T>,
  options?: PdfExportOptions & { entityName?: string }
): Promise<boolean> {
  if (data.length === 0) {
    console.error("No data to export");
    return false;
  }

  try {
    // NAMED jsPDF import, not the default: jspdf's package exports resolve to a
    // different build per environment, and only the browser build's `default`
    // is the constructor (the node build's `default` is a plain object). The
    // named export is the constructor in both, so this can't break if it ever
    // runs outside the browser.
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);

    // PDF columns default to the spreadsheet columns, but a page fits far
    // fewer — pages with a wide export schema pass a curated subset.
    const keys = (options?.headers?.length ? options.headers : headers) ?? [];
    if (keys.length === 0) {
      console.error("No columns to export to PDF");
      return false;
    }

    const orientation = options?.orientation === "portrait" ? "p" : "l";
    const doc = new jsPDF(orientation, "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 12;
    let y = 14;

    const title = options?.title || options?.entityName || "Export";
    doc.setFontSize(15);
    doc.setFont("helvetica", "bold");
    doc.text(title, margin, y);
    y += 7;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    const stamp = new Date().toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
    doc.text(
      `Generated: ${stamp}  ·  ${data.length} record${data.length === 1 ? "" : "s"}`,
      margin,
      y
    );
    y += 5;
    if (options?.subtitle) {
      doc.text(options.subtitle, margin, y);
      y += 5;
    }
    doc.setTextColor(0, 0, 0);
    y += 3;

    const head = [keys.map((k) => columnMapping?.[k] || k)];
    const body = data.map((item) => {
      const row = transformFunction ? transformFunction(item) : item;
      return keys.map((k) => {
        const v = row[k];
        return v === null || v === undefined ? "" : String(v);
      });
    });

    // Column count drives font size — the only thing that keeps a 12-column
    // table legible and a 6-column table from looking sparse.
    const fontSize = keys.length > 14 ? 5.5 : keys.length > 10 ? 6.5 : keys.length > 6 ? 7.5 : 8.5;

    autoTable(doc, {
      startY: y,
      head,
      body,
      theme: "striped",
      headStyles: { fillColor: [30, 41, 59], fontSize: fontSize + 0.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { fontSize, cellPadding: 1.6, overflow: "linebreak" },
      margin: { left: margin, right: margin },
    });

    const pageCount = (doc as unknown as { internal: { getNumberOfPages: () => number } })
      .internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Page ${i} of ${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 7,
        { align: "center" }
      );
    }

    doc.save(`${filename}.pdf`);
    return true;
  } catch (error) {
    console.error("Error creating PDF:", error);
    return false;
  }
}

/**
 * Unified export function that handles loading states and error handling
 */
export async function exportData<T extends ExportableData>(
  type: "csv" | "excel" | "pdf",
  getData: () => Promise<T[]>,
  onLoadingStart?: () => void,
  onLoadingEnd?: () => void,
  options?: {
    headers?: string[];
    columnMapping?: Record<string, string>;
    columnWidths?: Array<{ wch: number }>;
    entityName?: string;
    transformFunction?: DataTransformFunction<T>;
    pdf?: PdfExportOptions;
  }
): Promise<boolean> {
  // Use a consistent toast ID to ensure only one toast is shown at a time
  const TOAST_ID = "export-data-toast";
  
  try {
    // Start loading
    if (onLoadingStart) onLoadingStart();

    // Show toast for long operations using consistent ID
    toast.loading("Preparing export...", {
      description: "Fetching data for export...",
      id: TOAST_ID
    });

    // Get the data
    const exportData = await getData();

    // Update the same toast for processing
    toast.loading("Processing data...", {
      description: "Generating export file...",
      id: TOAST_ID
    });

    if (exportData.length === 0) {
      toast.error("Export failed", {
        description: "No data available to export.",
        id: TOAST_ID
      });
      return false;
    }

    // Get entity name for display in notifications
    const entityName = options?.entityName || "items";

    // Generate timestamp for filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${entityName}-export-${timestamp}`;

    // Export based on type
    let success = false;
    if (type === "csv") {
      success = exportToCSV(
        exportData, 
        filename, 
        options?.headers, 
        options?.columnMapping,
        options?.transformFunction
      );
      if (success) {
        toast.success("Export successful", {
          description: `Exported ${exportData.length} ${entityName} to CSV.`,
          id: TOAST_ID
        });
      }
    } else if (type === "pdf") {
      success = await exportToPDF(
        exportData,
        filename,
        options?.columnMapping,
        options?.headers,
        options?.transformFunction,
        { ...options?.pdf, entityName }
      );
      if (success) {
        toast.success("Export successful", {
          description: `Exported ${exportData.length} ${entityName} to PDF.`,
          id: TOAST_ID
        });
      }
    } else {
      success = exportToExcel(
        exportData,
        filename,
        options?.columnMapping,
        options?.columnWidths,
        options?.headers,
        options?.transformFunction
      );
      if (success) {
        toast.success("Export successful", {
          description: `Exported ${exportData.length} ${entityName} to Excel.`,
          id: TOAST_ID
        });
      }
    }

    return success;
  } catch (error) {
    console.error("Error exporting data:", error);
    
    toast.error("Export failed", {
      description: "There was a problem exporting the data. Please try again.",
      id: TOAST_ID
    });
    return false;
  } finally {
    // End loading regardless of result
    if (onLoadingEnd) onLoadingEnd();
  }
}
