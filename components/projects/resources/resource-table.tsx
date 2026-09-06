'use client';

/**
 * ResourceTable — per-member allocation vs assigned hours table (F5).
 *
 * Columns: Member (staff_id), Role, Allocation %, Tasks, Assigned Hrs,
 *          Capacity Bar, Faculty Weekly Hrs (cross-module), Status badge.
 * Over-allocation flag renders as a destructive badge in the Status column.
 */

import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CapacityBar } from './capacity-bar';
import type { MemberCapacity } from '@/lib/services/projects/resource-service';
import { allocationToHours } from '@/lib/services/projects/resource-service';

interface ResourceTableProps {
  items: MemberCapacity[];
}

export function ResourceTable({ items }: ResourceTableProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <Clock className="mb-3 h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No members assigned to this project yet.</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member ID</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-center">Allocation %</TableHead>
              <TableHead className="text-center">Tasks</TableHead>
              <TableHead className="text-center">Assigned Hrs</TableHead>
              <TableHead className="min-w-[140px]">Capacity</TableHead>
              <TableHead className="text-center">Faculty Hrs / wk</TableHead>
              <TableHead className="text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const capacityHours = allocationToHours(item.member.allocation_percentage);
              return (
                <TableRow key={item.member.id}>
                  {/* Staff ID — truncated UUID; full value in tooltip */}
                  <TableCell className="font-mono text-xs">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-default">
                          {item.member.staff_id.slice(0, 8)}&hellip;
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p className="text-xs">{item.member.staff_id}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>

                  {/* Role */}
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {item.member.role || 'member'}
                    </Badge>
                  </TableCell>

                  {/* Allocation % */}
                  <TableCell className="text-center">
                    {item.member.allocation_percentage != null
                      ? `${item.member.allocation_percentage}%`
                      : '—'}
                  </TableCell>

                  {/* Task count */}
                  <TableCell className="text-center">{item.taskCount}</TableCell>

                  {/* Assigned hours */}
                  <TableCell className="text-center font-medium">
                    {item.assignedHours.toFixed(1)}h
                  </TableCell>

                  {/* Capacity bar */}
                  <TableCell>
                    <CapacityBar
                      allocationPct={item.member.allocation_percentage}
                      assignedHours={item.assignedHours}
                    />
                  </TableCell>

                  {/* Faculty weekly hours (cross-module) */}
                  <TableCell className="text-center text-sm">
                    {item.facultyWeeklyHours != null ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-default underline decoration-dotted">
                            {item.facultyWeeklyHours.toFixed(1)}h
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">
                            Total from hr_faculty_workload (contact + admin + research)
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  {/* Over-allocation status */}
                  <TableCell className="text-center">
                    {item.isOverAllocated ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="destructive"
                            className="inline-flex items-center gap-1 cursor-default"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            Over
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">
                            Assigned {item.assignedHours.toFixed(1)}h exceeds capacity of{' '}
                            {capacityHours.toFixed(0)}h
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <Badge
                        variant="secondary"
                        className="inline-flex items-center gap-1"
                      >
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        OK
                      </Badge>
                    )}
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
