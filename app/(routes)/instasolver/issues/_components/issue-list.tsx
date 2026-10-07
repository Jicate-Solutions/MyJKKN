'use client';

import { formatDistanceToNow } from 'date-fns';
import { MapPin } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IssueStatusBadge, PriorityBadge, SeverityBadge } from '@/components/instasolver/badges';
import type { Issue } from '@/types/instasolver';

function assignee(issue: Issue): string {
  if (issue.assignee?.full_name && issue.team?.name) return `${issue.assignee.full_name} (${issue.team.name})`;
  if (issue.assignee?.full_name) return issue.assignee.full_name;
  if (issue.team?.name) return `${issue.team.name} (unclaimed)`;
  return 'Not assigned';
}

function ago(iso: string): string {
  return formatDistanceToNow(new Date(iso), { addSuffix: true });
}

interface Props {
  rows: Issue[];
  selectable: boolean;
  selected: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: (checked: boolean) => void;
  onOpen: (id: number) => void;
}

export function IssueList({ rows, selectable, selected, onToggle, onToggleAll, onOpen }: Props) {
  const selectableRows = rows.filter((r) => r.status === 'pending');
  const allSelected = selectableRows.length > 0 && selectableRows.every((r) => selected.has(r.id));

  return (
    <>
      {/* Cards below md */}
      <ul className="space-y-3 md:hidden">
        {rows.map((r) => (
          <li key={r.id}>
            <Card
              role="link"
              tabIndex={0}
              onClick={() => onOpen(r.id)}
              onKeyDown={(e) => e.key === 'Enter' && onOpen(r.id)}
              className="cursor-pointer active:bg-muted/50"
            >
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {selectable && r.status === 'pending' && (
                      <span onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(r.id)}
                          onCheckedChange={() => onToggle(r.id)}
                          aria-label={`Select ${r.reference_no}`}
                        />
                      </span>
                    )}
                    <span className="font-mono text-xs text-muted-foreground">{r.reference_no}</span>
                  </div>
                  <IssueStatusBadge status={r.status} />
                </div>
                <p className="font-medium leading-snug">{r.title}</p>
                <p className="flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 break-words">{r.location}</span>
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <SeverityBadge severity={r.severity} />
                  <PriorityBadge priority={r.priority} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {[r.institution?.name, r.category?.name].filter(Boolean).join(' · ')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {assignee(r)} · reported {ago(r.created_at)}
                </p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      {/* Table from md */}
      <div className="scrollbar-slim hidden overflow-x-auto rounded-md border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {selectable && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    disabled={selectableRows.length === 0}
                    onCheckedChange={(c) => onToggleAll(c === true)}
                    aria-label="Select all awaiting triage on this page"
                  />
                </TableHead>
              )}
              <TableHead>Reference</TableHead>
              <TableHead>Issue</TableHead>
              <TableHead>Institution</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assigned to</TableHead>
              <TableHead>Reported</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => onOpen(r.id)}>
                {selectable && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {r.status === 'pending' && (
                      <Checkbox
                        checked={selected.has(r.id)}
                        onCheckedChange={() => onToggle(r.id)}
                        aria-label={`Select ${r.reference_no}`}
                      />
                    )}
                  </TableCell>
                )}
                <TableCell className="whitespace-nowrap font-mono text-xs">{r.reference_no}</TableCell>
                <TableCell className="max-w-[280px]">
                  <p className="truncate font-medium">{r.title}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {r.location}
                  </p>
                </TableCell>
                <TableCell className="max-w-[160px] truncate text-sm">{r.institution?.name ?? '—'}</TableCell>
                <TableCell className="text-sm">{r.category?.name ?? '—'}</TableCell>
                <TableCell>
                  <SeverityBadge severity={r.severity} />
                </TableCell>
                <TableCell>
                  <PriorityBadge priority={r.priority} />
                </TableCell>
                <TableCell>
                  <IssueStatusBadge status={r.status} />
                </TableCell>
                <TableCell className="max-w-[180px] truncate text-sm">{assignee(r)}</TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{ago(r.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
