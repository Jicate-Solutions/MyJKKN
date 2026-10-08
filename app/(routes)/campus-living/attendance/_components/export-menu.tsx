'use client';

import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface CsvExport {
  label: string;
  /** Used in the filename. */
  slug: string;
  build: () => string;
}

/**
 * Client-side CSV of the current period + filter. Built from the data the viewer
 * already loaded under their own RLS — there is no export endpoint to bypass it.
 * The BOM keeps Excel from mangling non-ASCII names.
 */
export function ExportMenu({
  exports,
  from,
  to,
  disabled,
}: {
  exports: CsvExport[];
  from: string;
  to: string;
  disabled?: boolean;
}) {
  const download = (e: CsvExport) => {
    try {
      const blob = new Blob(['﻿', e.build()], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hostel-attendance-${e.slug}-${from}${from === to ? '' : `_${to}`}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(`Could not build the export: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Current period and filter</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {exports.map((e) => (
          <DropdownMenuItem key={e.slug} onSelect={() => download(e)}>
            {e.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
