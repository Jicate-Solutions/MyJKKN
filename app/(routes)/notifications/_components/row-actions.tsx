'use client';

import { DotsHorizontalIcon } from '@radix-ui/react-icons';
import type { Row } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Copy, Pencil } from 'lucide-react';
import type { NotificationWithStats } from '@/types/notification';

interface RowActionsProps {
  row: Row<NotificationWithStats>;
  onEdit: (notification: NotificationWithStats) => void;
  onReuse: (notification: NotificationWithStats) => void;
}

export function RowActions({ row, onEdit, onReuse }: RowActionsProps) {
  const notification = row.original;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          className='flex h-8 w-8 p-0 data-[state=open]:bg-muted'
        >
          <DotsHorizontalIcon className='h-4 w-4' />
          <span className='sr-only'>Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-[160px]'>
        <DropdownMenuItem onSelect={() => onEdit(notification)}>
          <Pencil className='mr-2 h-4 w-4' />
          Edit Message
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onReuse(notification)}>
          <Copy className='mr-2 h-4 w-4' />
          Reuse Message
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
