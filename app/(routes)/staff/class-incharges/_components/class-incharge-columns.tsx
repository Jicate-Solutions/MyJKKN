'use client';

import { ColumnDef } from '@tanstack/react-table';
import { SectionWithIncharges, ClassIncharge } from '@/types/staff';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { UserCheck, UserPlus } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ColumnActions {
  onManage: (section: SectionWithIncharges) => void;
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
  actions: ColumnActions
): ColumnDef<SectionWithIncharges>[] {
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
      cell: ({ row }) => (
        <InchargeAvatars incharges={row.original.class_incharges || []} />
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const hasIncharges =
          row.original.class_incharges && row.original.class_incharges.length > 0;
        return (
          <Button
            variant={hasIncharges ? 'outline' : 'default'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => actions.onManage(row.original)}
          >
            {hasIncharges ? (
              <>
                <UserCheck className="h-3.5 w-3.5 mr-1.5" />
                Manage
              </>
            ) : (
              <>
                <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                Assign
              </>
            )}
          </Button>
        );
      },
    },
  ];
}
