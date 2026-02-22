'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { FileText, FileImage, Clock, CheckCircle2, XCircle, Calendar } from 'lucide-react';
import type { PendingDocument } from '@/lib/services/admission/document-service';
import { DocumentRowActions } from './row-actions';

export function getDocVerificationBadge(status: string | null) {
  switch (status) {
    case 'verified':
      return <Badge className="bg-green-100 text-green-800 border-0"><CheckCircle2 className="h-3 w-3 mr-1" />Verified</Badge>;
    case 'rejected':
      return <Badge className="bg-red-100 text-red-800 border-0"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
    default:
      return <Badge className="bg-yellow-100 text-yellow-800 border-0"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
  }
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return 'N/A';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

export const pendingDocumentsColumns: ColumnDef<PendingDocument>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value: boolean) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value: boolean) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    maxSize: 50,
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'document_type_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Document Type" />
    ),
    cell: ({ row }) => {
      const doc = row.original;
      const isPdf = (doc.mime_type || '').includes('pdf');
      return (
        <div className="flex items-center gap-2">
          {isPdf ? (
            <FileText className="h-4 w-4 text-red-500 flex-shrink-0" />
          ) : (
            <FileImage className="h-4 w-4 text-blue-500 flex-shrink-0" />
          )}
          <span className="font-medium">{doc.document_type_name}</span>
        </div>
      );
    },
    size: 200,
    minSize: 150,
  },
  {
    accessorKey: 'application_id',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Application ID" />
    ),
    cell: ({ row }) => {
      const id = row.getValue('application_id') as string | null;
      return (
        <code className="bg-muted px-2 py-1 rounded text-xs">
          {id ? id.slice(0, 8) : 'N/A'}
        </code>
      );
    },
    size: 140,
    minSize: 110,
  },
  {
    accessorKey: 'file_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="File Name" />
    ),
    cell: ({ row }) => {
      const name = row.getValue('file_name') as string | null;
      return (
        <span className="text-sm text-muted-foreground truncate max-w-[200px] block">
          {name || 'Unknown'}
        </span>
      );
    },
    size: 220,
    minSize: 150,
  },
  {
    accessorKey: 'uploaded_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Uploaded" />
    ),
    cell: ({ row }) => {
      const date = row.getValue('uploaded_at') as string | null;
      return (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Calendar className="h-3 w-3" />
          {date ? new Date(date).toLocaleDateString() : 'N/A'}
        </div>
      );
    },
    size: 130,
    minSize: 110,
  },
  {
    accessorKey: 'file_size',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="File Info" />
    ),
    cell: ({ row }) => {
      const doc = row.original;
      const ext = (doc.mime_type || '').split('/').pop()?.toUpperCase() || 'N/A';
      const size = formatFileSize(doc.file_size);
      return <span className="text-sm text-muted-foreground">{ext} - {size}</span>;
    },
    size: 120,
    minSize: 100,
    enableSorting: false,
  },
  {
    accessorKey: 'verification_status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) =>
      getDocVerificationBadge(row.getValue('verification_status') as string | null),
    size: 120,
    minSize: 100,
  },
  {
    id: 'actions',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Actions" />
    ),
    cell: ({ row }) => <DocumentRowActions row={row} />,
    size: 140,
    minSize: 120,
    enableSorting: false,
    enableHiding: false,
  },
];

export const recentVerificationsColumns: ColumnDef<PendingDocument>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value: boolean) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value: boolean) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    maxSize: 50,
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'document_type_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Document Type" />
    ),
    cell: ({ row }) => (
      <span className="font-medium">{row.getValue('document_type_name') as string}</span>
    ),
    size: 200,
    minSize: 150,
  },
  {
    accessorKey: 'application_id',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Application ID" />
    ),
    cell: ({ row }) => {
      const id = row.getValue('application_id') as string | null;
      return (
        <code className="bg-muted px-2 py-1 rounded text-xs">
          {id ? id.slice(0, 8) : 'N/A'}
        </code>
      );
    },
    size: 140,
    minSize: 110,
  },
  {
    accessorKey: 'file_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="File" />
    ),
    cell: ({ row }) => {
      const name = row.getValue('file_name') as string | null;
      return <span className="text-sm text-muted-foreground">{name || 'Unknown'}</span>;
    },
    size: 220,
    minSize: 150,
  },
  {
    accessorKey: 'verification_status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) =>
      getDocVerificationBadge(row.getValue('verification_status') as string | null),
    size: 120,
    minSize: 100,
  },
  {
    accessorKey: 'rejection_reason',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Reason" />
    ),
    cell: ({ row }) => {
      const reason = row.getValue('rejection_reason') as string | null;
      return <span className="text-sm text-muted-foreground">{reason || '-'}</span>;
    },
    size: 200,
    minSize: 150,
    enableSorting: false,
  },
];
