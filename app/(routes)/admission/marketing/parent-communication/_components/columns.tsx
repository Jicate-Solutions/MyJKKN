'use client';

import { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { Phone, MessageCircle, Mail } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// ── Type ──────────────────────────────────────────────────────────────────────

export interface CommLogRow {
  id: string;
  lead_id: string;
  /** Derived from lead parent_name or phone for display */
  parent_name: string;
  /** Lead full_name displayed as student name */
  student_name: string;
  channel: 'sms' | 'whatsapp' | 'email' | 'call';
  direction: 'inbound' | 'outbound';
  /** Mapped from log status */
  status: 'completed' | 'pending' | 'missed';
  /** log message_content */
  summary: string;
  counselor_name: string;
  /** ISO timestamp – created_at / sent_at */
  timestamp: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ChannelCell({ channel }: { channel: string }) {
  const icon =
    channel === 'call' ? (
      <Phone className="h-4 w-4" />
    ) : channel === 'whatsapp' ? (
      <MessageCircle className="h-4 w-4" />
    ) : channel === 'email' ? (
      <Mail className="h-4 w-4" />
    ) : (
      <MessageCircle className="h-4 w-4" />
    );

  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="capitalize">{channel}</span>
    </div>
  );
}

// ── Column Definitions ────────────────────────────────────────────────────────

export const columns: ColumnDef<CommLogRow>[] = [
  {
    accessorKey: 'parent_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Parent" />
    ),
    cell: ({ row }) => (
      <span className="font-medium">{row.getValue('parent_name') || '-'}</span>
    ),
    size: 180,
    minSize: 120,
  },
  {
    accessorKey: 'student_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Student" />
    ),
    cell: ({ row }) => (
      <span>{row.getValue('student_name') || '-'}</span>
    ),
    size: 180,
    minSize: 120,
  },
  {
    accessorKey: 'channel',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Channel" />
    ),
    cell: ({ row }) => (
      <ChannelCell channel={row.getValue('channel') as string} />
    ),
    size: 140,
    minSize: 100,
  },
  {
    accessorKey: 'direction',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Direction" />
    ),
    cell: ({ row }) => {
      const dir = row.getValue('direction') as string;
      return (
        <Badge variant={dir === 'inbound' ? 'secondary' : 'outline'}>
          {dir}
        </Badge>
      );
    },
    size: 110,
    minSize: 80,
  },
  {
    accessorKey: 'summary',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Summary" />
    ),
    cell: ({ row }) => (
      <span className="max-w-[220px] truncate block text-sm text-muted-foreground">
        {row.getValue('summary') || '-'}
      </span>
    ),
    size: 240,
    minSize: 140,
  },
  {
    accessorKey: 'counselor_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Counselor" />
    ),
    cell: ({ row }) => (
      <span className="text-sm">{row.getValue('counselor_name') || '-'}</span>
    ),
    size: 150,
    minSize: 100,
  },
  {
    accessorKey: 'timestamp',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Time" />
    ),
    cell: ({ row }) => {
      const ts = row.getValue('timestamp') as string;
      if (!ts) return <span className="text-muted-foreground">-</span>;
      try {
        return (
          <span className="text-sm text-muted-foreground">
            {formatDistanceToNow(new Date(ts), { addSuffix: true })}
          </span>
        );
      } catch {
        return <span className="text-muted-foreground">-</span>;
      }
    },
    size: 150,
    minSize: 100,
  },
];
