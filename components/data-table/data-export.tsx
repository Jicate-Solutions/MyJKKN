"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DownloadIcon, Loader2 } from "lucide-react";
import { Table } from "@tanstack/react-table";
import { exportData, exportToCSV, exportToExcel, exportToPDF, ExportableData, DataTransformFunction, PdfExportOptions } from "./utils/export-utils";
import { TableConfig } from "./utils/table-config";
import { JSX, useState } from "react";
import { toast } from "sonner";

interface DataTableExportProps<TData extends ExportableData> {
  table: Table<TData>;
  data: TData[];
  selectedData?: TData[];
  getSelectedItems?: () => Promise<TData[]>;
  getAllItems?: () => Promise<TData[]>;
  entityName?: string;
  columnMapping?: Record<string, string>;
  columnWidths?: Array<{ wch: number }>;
  headers?: string[];
  transformFunction?: DataTransformFunction<TData>;
  size?: 'sm' | 'default' | 'lg';
  config?: TableConfig;
  /**
   * PDF export settings from the page's `exportConfig.pdf`. Presence is the
   * opt-in: when omitted the PDF menu entries are not rendered at all, so
   * tables that haven't chosen a printable column subset are unchanged.
   */
  pdfOptions?: PdfExportOptions;
}

export function DataTableExport<TData extends ExportableData>({
  table,
  data,
  selectedData,
  getSelectedItems,
  getAllItems,
  entityName = "items",
  columnMapping,
  columnWidths,
  headers,
  transformFunction,
  size = 'default',
  config,
  pdfOptions
}: DataTableExportProps<TData>): JSX.Element {
  const [isLoading, setIsLoading] = useState(false);

  const handleExport = async (type: "csv" | "excel" | "pdf") => {
    if (isLoading) return; // Prevent multiple export requests
    
    // Create a data fetching function based on the current state
    const fetchExportData = async (): Promise<TData[]> => {
      // If we have selected items and a function to get their complete data
      if (getSelectedItems && selectedData && selectedData.length > 0) {
        // Check if data is on current page or needs to be fetched
        if (selectedData.some(item => Object.keys(item).length === 0)) {
          // We have placeholder data, need to fetch complete data
          toast.loading("Preparing export...", {
            description: `Fetching complete data for selected ${entityName}.`,
            id: "export-data-toast",
          });
        }
        
        // Fetch complete data for selected items
        const selectedItems = await getSelectedItems();
        
        if (selectedItems.length === 0) {
          throw new Error(`Failed to retrieve complete data for selected ${entityName}`);
        }
        
        // Order the items according to the current sorting in the table
        // This preserves the table's page order in the exported data
        const sortedItems = [...selectedItems];
        const sorting = table.getState().sorting;
        
        if (sorting.length > 0) {
          const { id: sortField, desc: isDescending } = sorting[0];
          
          // Validate that sortField exists in data before sorting
          const sampleItem = sortedItems[0];
          if (sampleItem && !(sortField in sampleItem)) {
            console.warn(`Sort field "${sortField}" not found in data. Skipping sort.`);
            return sortedItems;
          }
          
          sortedItems.sort((a, b) => {
            try {
              const valueA = a[sortField as keyof TData];
              const valueB = b[sortField as keyof TData];
              
              if (valueA === valueB) return 0;
              
              if (valueA === null || valueA === undefined) return isDescending ? 1 : -1;
              if (valueB === null || valueB === undefined) return isDescending ? -1 : 1;
              
              if (typeof valueA === 'string' && typeof valueB === 'string') {
              return isDescending 
                ? valueB.localeCompare(valueA) 
                : valueA.localeCompare(valueB);
            }
            
              // For numeric and other comparable types
              return isDescending 
                ? (valueB > valueA ? 1 : -1) 
                : (valueA > valueB ? 1 : -1);
            } catch (sortError) {
              console.error('Error during sorting:', sortError);
              return 0; // Maintain original order on error
            }
          });
        }
        
        return sortedItems;
      } else {
        // No selection → this is the "Export Current Page" action: use the
        // visible page only. "Export All Pages" is handled separately by
        // exportAllPages() via getAllItems(), which fetches the full set.
        if (!data || data.length === 0) {
          throw new Error("No data available for export");
        }
        return data;
      }
    };

    try {
      // Get visible columns from the table
      const visibleColumns = table.getAllColumns()
        .filter(column => column.getIsVisible())
        .filter(column => column.id !== 'actions' && column.id !== 'select');

      // Generate export options based on visible columns and respect column order
      const columnOrder = table.getState().columnOrder;
      const orderedVisibleColumns = columnOrder.length > 0
        ? [...visibleColumns].sort((a, b) => {
            const aIndex = columnOrder.indexOf(a.id);
            const bIndex = columnOrder.indexOf(b.id);
            // If column isn't in the order array, put it at the end
            if (aIndex === -1) return 1;
            if (bIndex === -1) return -1;
            return aIndex - bIndex;
          })
        : visibleColumns;

      // Generate export headers - always start with visible columns only
      const visibleColumnIds = orderedVisibleColumns.map(column => column.id);
      // Get all table column IDs (visible + hidden) to identify what's a table column vs transform column
      const allTableColumnIds = table.getAllColumns()
        .filter(column => column.id !== 'actions' && column.id !== 'select')
        .map(column => column.id);
      
      let exportHeaders: string[];
      
      if (config?.allowExportNewColumns === false) {
        // Only export visible columns - no new columns from transform
        exportHeaders = headers && headers.length > 0 
          ? headers.filter(header => visibleColumnIds.includes(header))
          : visibleColumnIds;
      } else {
        // Allow new columns from transform function, but still filter existing columns by visibility.
        // Keep the page's declared header ORDER: `columnWidths` is applied
        // positionally against this list, so partitioning table columns ahead
        // of transform-only columns silently shifted every width by a column.
        if (headers && headers.length > 0) {
          exportHeaders = headers.filter(
            header => !allTableColumnIds.includes(header) || visibleColumnIds.includes(header)
          );
        } else {
          exportHeaders = visibleColumnIds;
        }
      }

      // Auto-generate column mapping from table headers if not provided
      const exportColumnMapping = columnMapping || (() => {
        const mapping: Record<string, string> = {};
        orderedVisibleColumns.forEach(column => {
          // Try to get header text if available
          const headerText = column.columnDef.header as string;
          
          if (headerText && typeof headerText === 'string') {
            mapping[column.id] = headerText;
          } else {
            // Fallback to formatted column ID
            mapping[column.id] = column.id
              .split(/(?=[A-Z])|_/)
              .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
              .join(' ');
          }
        });
        return mapping;
      })();

      // Filter column widths to match export headers
      const exportColumnWidths = columnWidths ? 
        exportHeaders.map((_, index) => columnWidths[index] || { wch: 15 }) :
        exportHeaders.map(() => ({ wch: 15 }));

      // Use the generic export function with proper options
      await exportData(
        type,
        fetchExportData,
        () => setIsLoading(true),
        () => setIsLoading(false),
        {
          entityName,
          headers: exportHeaders,
          columnMapping: exportColumnMapping,
          columnWidths: exportColumnWidths,
          transformFunction,
          pdf: pdfOptions
        }
      );
    } catch (error) {
      console.error("Error exporting data:", error);
      toast.error("Export failed", {
        description: "There was a problem exporting. Please try again.",
        id: "export-data-toast"
      });
      setIsLoading(false);
    }
  };

  const exportAllPages = async (type: "csv" | "excel" | "pdf") => {
    if (isLoading || !getAllItems) return;
    setIsLoading(true);
    
    try {
      // Show toast for long operations
      toast.loading("Preparing export...", {
        description: `Fetching all ${entityName}...`,
        id: "export-data-toast"
      });
      
      // Fetch all data with server-side sorting
      const allData = await getAllItems();
      
      if (allData.length === 0) {
        toast.error("Export failed", {
          description: "No data available to export.",
          id: "export-data-toast"
        });
        return;
      }
      
      // Get visible columns and apply export
      const visibleColumns = table.getAllColumns()
        .filter(column => column.getIsVisible())
        .filter(column => column.id !== 'actions' && column.id !== 'select');
      
      // Generate export headers - always start with visible columns only
      const visibleColumnIds = visibleColumns.map(column => column.id);
      // Get all table column IDs (visible + hidden) to identify what's a table column vs transform column
      const allTableColumnIds = table.getAllColumns()
        .filter(column => column.id !== 'actions' && column.id !== 'select')
        .map(column => column.id);
      
      let exportHeaders: string[];
      
      if (config?.allowExportNewColumns === false) {
        // Only export visible columns - no new columns from transform
        exportHeaders = headers && headers.length > 0 
          ? headers.filter(header => visibleColumnIds.includes(header))
          : visibleColumnIds;
      } else {
        // Allow new columns from transform function, but still filter existing
        // columns by visibility — in the page's declared header order, which is
        // what `columnWidths` is indexed against.
        if (headers && headers.length > 0) {
          exportHeaders = headers.filter(
            header => !allTableColumnIds.includes(header) || visibleColumnIds.includes(header)
          );
        } else {
          exportHeaders = visibleColumnIds;
        }
      }
      const exportColumnMapping = columnMapping || (() => {
        const mapping: Record<string, string> = {};
        
        // If we have custom headers, generate mapping for them
        if (headers && headers.length > 0) {
          headers.forEach(header => {
            mapping[header] = header
              .split(/(?=[A-Z])|_/)
              .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
              .join(' ');
          });
        } else {
          // Otherwise use visible columns
          visibleColumns.forEach(column => {
            const headerText = column.columnDef.header as string;
            
            if (headerText && typeof headerText === 'string') {
              mapping[column.id] = headerText;
            } else {
              mapping[column.id] = column.id
                .split(/(?=[A-Z])|_/)
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
            }
          });
        }
        
        return mapping;
      })();
      
      const exportColumnWidths = columnWidths ?
        exportHeaders.map((_, index) => columnWidths[index] || { wch: 15 }) :
        exportHeaders.map(() => ({ wch: 15 }));
      
      // Update toast for processing
      toast.loading("Processing data...", {
        description: "Generating export file...",
        id: "export-data-toast"
      });
      
      // Generate timestamp for filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `${entityName}-all-pages-export-${timestamp}`;
      
      // Export based on type
      let success = false;
      if (type === "csv") {
        success = exportToCSV(allData, filename, exportHeaders, exportColumnMapping, transformFunction);
      } else if (type === "pdf") {
        success = await exportToPDF(
          allData,
          filename,
          exportColumnMapping,
          exportHeaders,
          transformFunction,
          { ...pdfOptions, entityName }
        );
      } else {
        success = exportToExcel(
          allData,
          filename,
          exportColumnMapping,
          exportColumnWidths,
          exportHeaders,
          transformFunction
        );
      }
      
      if (success) {
        toast.success("Export successful", {
          description: `Exported all ${allData.length} ${entityName} to ${type.toUpperCase()}.`,
          id: "export-data-toast"
        });
      }
    } catch (error) {
      console.error("Error exporting all pages:", error);
      toast.error("Export failed", {
        description: "There was a problem exporting all pages. Please try again.",
        id: "export-data-toast"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Check if any rows are selected
  const hasSelection = selectedData && selectedData.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Exporting...
            </>
          ) : (
            <>
              <DownloadIcon className="mr-2 h-4 w-4" />
              Export
              {hasSelection && <span className="ml-1">({selectedData?.length})</span>}
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {hasSelection ? (
          <>
            <DropdownMenuItem onClick={() => handleExport("csv")} disabled={isLoading}>
              Export Selected as CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("excel")} disabled={isLoading}>
              Export Selected as XLS
            </DropdownMenuItem>
            {pdfOptions && (
              <DropdownMenuItem onClick={() => handleExport("pdf")} disabled={isLoading}>
                Export Selected as PDF
              </DropdownMenuItem>
            )}
          </>
        ) : config?.exportAllPagesByDefault && getAllItems ? (
          // Export = the whole dataset by default; current page is secondary.
          <>
            <DropdownMenuItem onClick={() => exportAllPages("csv")} disabled={isLoading}>
              Export All as CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportAllPages("excel")} disabled={isLoading}>
              Export All as XLS
            </DropdownMenuItem>
            {pdfOptions && (
              <DropdownMenuItem onClick={() => exportAllPages("pdf")} disabled={isLoading}>
                Export All as PDF
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => handleExport("csv")} disabled={isLoading}>
              Export Current Page as CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("excel")} disabled={isLoading}>
              Export Current Page as XLS
            </DropdownMenuItem>
            {pdfOptions && (
              <DropdownMenuItem onClick={() => handleExport("pdf")} disabled={isLoading}>
                Export Current Page as PDF
              </DropdownMenuItem>
            )}
          </>
        ) : (
          <>
            <DropdownMenuItem onClick={() => handleExport("csv")} disabled={isLoading}>
              Export Current Page as CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("excel")} disabled={isLoading}>
              Export Current Page as XLS
            </DropdownMenuItem>
            {pdfOptions && (
              <DropdownMenuItem onClick={() => handleExport("pdf")} disabled={isLoading}>
                Export Current Page as PDF
              </DropdownMenuItem>
            )}
            {getAllItems && (
              <>
                <DropdownMenuItem
                  onClick={() => exportAllPages("csv")}
                  disabled={isLoading}
                >
                  Export All Pages as CSV
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => exportAllPages("excel")}
                  disabled={isLoading}
                >
                  Export All Pages as XLS
                </DropdownMenuItem>
                {pdfOptions && (
                  <DropdownMenuItem
                    onClick={() => exportAllPages("pdf")}
                    disabled={isLoading}
                  >
                    Export All Pages as PDF
                  </DropdownMenuItem>
                )}
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}