// app/(routes)/system/api-management/_components/api-key-list.tsx
'use client';

import { MoreVertical } from 'lucide-react';
import { format } from 'date-fns';
import { ApiKey } from '@/types/api-keys';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ApiKeyListProps {
  apiKeys: ApiKey[];
  onDelete: (id: string) => void;
  onToggle: (id: string, isActive: boolean) => void;
  selectedKeys: string[];
  onSelectKey: (id: string) => void;
  onSelectAll: (selected: boolean) => void;
}

export function ApiKeyList({
  apiKeys,
  onDelete,
  onToggle,
  selectedKeys,
  onSelectKey,
  onSelectAll
}: ApiKeyListProps) {
  const formatDate = (date: string) => {
    return format(new Date(date), 'MMM d, yyyy HH:mm');
  };

  const allSelected = apiKeys.length > 0 && selectedKeys.length === apiKeys.length;
  const someSelected = selectedKeys.length > 0 && selectedKeys.length < apiKeys.length;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(checked) => onSelectAll(!!checked)}
              aria-label="Select all"
              className={someSelected ? 'data-[state=checked]:bg-muted' : ''}
            />
          </TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="hidden md:table-cell">Last Used</TableHead>
          <TableHead className="hidden md:table-cell">Expires</TableHead>
          <TableHead className="hidden md:table-cell">Created</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {apiKeys.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="text-center">
              No API keys found
            </TableCell>
          </TableRow>
        ) : (
          apiKeys.map((key) => (
            <TableRow key={key.id}>
              <TableCell>
                <Checkbox
                  checked={selectedKeys.includes(key.id)}
                  onCheckedChange={() => onSelectKey(key.id)}
                  aria-label={`Select ${key.name}`}
                />
              </TableCell>
              <TableCell className="font-medium">{key.name}</TableCell>
              <TableCell>
                <Badge
                  variant={key.is_active ? 'default' : 'secondary'}
                >
                  {key.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {key.last_used_at ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        {formatDate(key.last_used_at)}
                      </TooltipTrigger>
                      <TooltipContent>
                        {format(new Date(key.last_used_at), 'PPpp')}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  'Never'
                )}
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {key.expires_at ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        {formatDate(key.expires_at)}
                      </TooltipTrigger>
                      <TooltipContent>
                        {format(new Date(key.expires_at), 'PPpp')}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  'Never'
                )}
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      {formatDate(key.created_at)}
                    </TooltipTrigger>
                    <TooltipContent>
                      {format(new Date(key.created_at), 'PPpp')}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <span className="sr-only">Open menu</span>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onToggle(key.id, key.is_active)}
                    >
                      {key.is_active ? 'Deactivate' : 'Activate'}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => onDelete(key.id)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}