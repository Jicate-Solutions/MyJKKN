'use client';

import { PermissionColumnDef } from '@/components/ui/data-table';
import { SectionWithIncharges, ClassIncharge } from '@/types/staff';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { MoreVertical, UserCheck, UserPlus, Trash2 } from 'lucide-react';

export interface ClassInchargeColumnActions {
  onManage: (section: SectionWithIncharges) => void;
  onRemoveAll: (section: SectionWithIncharges) => void;
  canDelete: boolean;
}

function getInitials(firstName: string, lastName: string) {
  return `${firstName[0]}${lastName[0]}`.toUpperCase();
}

function InchargeAvatars({ incharges }: { incharges: ClassIncharge[] }) {
  if (!incharges || incharges.length === 0) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  const visibleCount = 3;
  const visible = incharges.slice(0, visibleCount);
  const overflow = incharges.length - visibleCount;

  return (
    <div className="flex items-center gap-1">
      <div className="flex -space-x-2">
        {visible.map((ic) => (
          <TooltipProvider key={ic.id}>
            <Tooltip>
              <TooltipTrigger>
                <Avatar className="h-7 w-7 border-2 border-background">
                  <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                    {ic.staff
                      ? getInitials(ic.staff.first_name, ic.staff.last_name)
                      : '?'}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  {ic.staff
                    ? `${ic.staff.first_name} ${ic.staff.last_name}`
                    : 'Unknown'}
                </p>
                {ic.staff?.designation && (
                  <p className="text-xs text-muted-foreground">
                    {ic.staff.designation}
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>
      {overflow > 0 && (
        <Badge variant="secondary" className="text-xs h-6 px-1.5">
          +{overflow}
        </Badge>
      )}
    </div>
  );
}

export function getClassInchargeColumns(
  actions: ClassInchargeColumnActions
): PermissionColumnDef<SectionWithIncharges, unknown>[] {
  return [
    {
      accessorKey: 'section_name',
      header: 'Section',
      cell: ({ row }) => (
        <span className="font-medium">{row.original.section_name}</span>
      ),
    },
    {
      id: 'semester',
      header: 'Semester',
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.semester?.semester_name ?? '—'}
        </span>
      ),
    },
    {
      id: 'program',
      header: 'Program',
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.program?.program_name ?? '—'}
        </span>
      ),
    },
    {
      id: 'department',
      header: 'Department',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.department?.department_name ?? '—'}
        </span>
      ),
    },
    {
      id: 'incharges',
      header: 'Incharges',
      enableHiding: false,
      cell: ({ row }) => (
        <InchargeAvatars incharges={row.original.class_incharges || []} />
      ),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const section = row.original;
        const hasIncharges = (section.class_incharges?.length ?? 0) > 0;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => actions.onManage(section)}
                className="cursor-pointer"
              >
                {hasIncharges ? (
                  <UserCheck className="mr-2 h-4 w-4" />
                ) : (
                  <UserPlus className="mr-2 h-4 w-4" />
                )}
                {hasIncharges ? 'Manage Incharges' : 'Assign Incharge'}
              </DropdownMenuItem>

              {hasIncharges && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={
                      actions.canDelete
                        ? () => actions.onRemoveAll(section)
                        : undefined
                    }
                    disabled={!actions.canDelete}
                    className={
                      actions.canDelete
                        ? 'text-destructive focus:text-destructive cursor-pointer'
                        : 'cursor-not-allowed'
                    }
                    style={{ opacity: actions.canDelete ? 1 : 0.5 }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove All Incharges
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
