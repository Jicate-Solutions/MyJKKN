'use client';

import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Award, MoreHorizontal, Trash2, Edit } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import type { PrivilegeGroup, PrivilegeGroupStatus } from '@/types/privileges';

interface PrivilegeGroupsTableProps {
  groups: PrivilegeGroup[];
  isLoading: boolean;
  onDelete?: (id: string) => void;
}

const statusConfig: Record<PrivilegeGroupStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active: { label: 'Active', variant: 'default' },
  expired: { label: 'Expired', variant: 'secondary' },
  archived: { label: 'Archived', variant: 'outline' },
};

export function PrivilegeGroupsTable({ groups, isLoading, onDelete }: PrivilegeGroupsTableProps) {
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Award className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h3 className="text-lg font-medium text-muted-foreground">No privilege groups yet</h3>
        <p className="text-sm text-muted-foreground/60 mt-1">
          Create your first privilege group to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Reference Code</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-center">Members</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-[60px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => {
            const status = statusConfig[group.status];
            return (
              <TableRow
                key={group.id}
                className="cursor-pointer"
                onClick={() => router.push(`/academic/privileges/${group.id}`)}
              >
                <TableCell className="font-medium">{group.name}</TableCell>
                <TableCell>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                    {group.reference_code}
                  </code>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={status.variant}
                    className={
                      group.status === 'active'
                        ? 'bg-green-100 text-green-800 hover:bg-green-100'
                        : group.status === 'expired'
                        ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100'
                        : ''
                    }
                  >
                    {status.label}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">{group.member_count ?? 0}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {format(new Date(group.created_at), 'dd MMM yyyy')}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/academic/privileges/${group.id}`);
                        }}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        View Details
                      </DropdownMenuItem>
                      {onDelete && (
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(group.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Archive
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
