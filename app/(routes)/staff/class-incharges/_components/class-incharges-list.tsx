'use client';

import { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table';
import { ClassInchargeFilters, SectionWithIncharges } from '@/types/staff';
import { useClassIncharges } from '@/hooks/staff/use-class-incharges';
import { getClassInchargeColumns } from './class-incharge-columns';
import { AssignInchargeDialog } from './assign-incharge-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ChevronLeft, ChevronRight, UserX } from 'lucide-react';

interface Props {
  filters: ClassInchargeFilters;
  onPageChange: (page: number) => void;
}

export function ClassInchargesList({ filters, onPageChange }: Props) {
  const [selectedSection, setSelectedSection] =
    useState<SectionWithIncharges | null>(null);

  const { data, isLoading, error } = useClassIncharges(filters);
  const sections = data?.data || [];
  const metadata = data?.metadata;

  const columns = getClassInchargeColumns({
    onManage: (section) => setSelectedSection(section),
  });

  const table = useReactTable({
    data: sections,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (!filters.institution_id) {
    return (
      <Alert>
        <AlertDescription>
          Select an institution to view class incharges.
        </AlertDescription>
      </Alert>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load sections. Please try again.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id} className="text-xs font-medium">
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center"
                >
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <UserX className="h-8 w-8" />
                    <p className="text-sm">No sections found</p>
                    <p className="text-xs">
                      Adjust the filters to see sections
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-muted/40">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-2">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {metadata && metadata.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Showing {sections.length} of {metadata.total} sections
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={metadata.page <= 1}
              onClick={() => onPageChange(metadata.page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground">
              {metadata.page} / {metadata.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={metadata.page >= metadata.totalPages}
              onClick={() => onPageChange(metadata.page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Assign/Manage Dialog */}
      {selectedSection && (
        <AssignInchargeDialog
          section={selectedSection}
          open={!!selectedSection}
          onOpenChange={(open) => {
            if (!open) setSelectedSection(null);
          }}
        />
      )}
    </>
  );
}
