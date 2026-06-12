'use client';

import { formatDistanceToNow } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { RoutingError } from '@/lib/services/admission/routing-errors-service';
import { Eye } from 'lucide-react';

interface Props {
  rows: RoutingError[];
  onRowClick: (row: RoutingError) => void;
}

function truncate(text: string, max = 80): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

export function RoutingErrorsDataTable({ rows, onRowClick }: Props) {
  return (
    <TooltipProvider>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">Occurred</TableHead>
              <TableHead className="w-[110px]">Tier</TableHead>
              <TableHead className="w-[110px]">SQLSTATE</TableHead>
              <TableHead>Error message</TableHead>
              <TableHead className="w-[160px]">Outcome</TableHead>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="w-[80px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const occurredRelative = (() => {
                try {
                  return formatDistanceToNow(new Date(row.occurred_at), {
                    addSuffix: true,
                  });
                } catch {
                  return row.occurred_at;
                }
              })();
              const isResolved = !!row.resolved_at;
              return (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onRowClick(row)}
                >
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-sm">{occurredRelative}</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <span className="font-mono text-xs">
                          {new Date(row.occurred_at).toISOString()}
                        </span>
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    {row.tier_order != null ? (
                      <Badge variant="outline">Tier {row.tier_order}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        pre-tier
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.sqlstate ? (
                      <code className="text-xs">{row.sqlstate}</code>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {truncate(row.error_message)}
                  </TableCell>
                  <TableCell>
                    {row.resulted_in_unassigned ? (
                      <Badge variant="destructive">Unassigned</Badge>
                    ) : (
                      <Badge variant="secondary">Recovered</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {isResolved ? (
                      <Badge variant="default">Resolved</Badge>
                    ) : (
                      <Badge variant="outline">Open</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRowClick(row);
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}
