'use client';

// app/(routes)/grievance/_components/tickets-table.tsx
// F004: Grievance Ticketing System - Tickets Table Component

import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  MoreHorizontal,
  User,
  AlertTriangle
} from 'lucide-react';
import type { GrievanceTicket, GrievanceStatus, GrievancePriority, GrievanceSLAStatus } from '@/types/grievance';

interface TicketsTableProps {
  tickets: GrievanceTicket[];
  isStaff?: boolean;
}

// Status badge styling
const statusConfig: Record<GrievanceStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
  open: { label: 'Open', variant: 'default', icon: <AlertCircle className="h-3 w-3" /> },
  in_progress: { label: 'In Progress', variant: 'secondary', icon: <Clock className="h-3 w-3" /> },
  pending_info: { label: 'Pending Info', variant: 'outline', icon: <AlertTriangle className="h-3 w-3" /> },
  resolved: { label: 'Resolved', variant: 'default', icon: <CheckCircle2 className="h-3 w-3" /> },
  closed: { label: 'Closed', variant: 'secondary', icon: <CheckCircle2 className="h-3 w-3" /> },
  reopened: { label: 'Reopened', variant: 'destructive', icon: <AlertCircle className="h-3 w-3" /> }
};

// Priority badge styling
const priorityConfig: Record<GrievancePriority, { label: string; className: string }> = {
  low: { label: 'Low', className: 'bg-gray-100 text-gray-700' },
  medium: { label: 'Medium', className: 'bg-blue-100 text-blue-700' },
  high: { label: 'High', className: 'bg-orange-100 text-orange-700' },
  urgent: { label: 'Urgent', className: 'bg-red-100 text-red-700' }
};

// SLA status styling
const slaConfig: Record<GrievanceSLAStatus, { label: string; className: string; icon: React.ReactNode }> = {
  on_track: { label: 'On Track', className: 'bg-green-100 text-green-700', icon: <CheckCircle2 className="h-3 w-3" /> },
  at_risk: { label: 'At Risk', className: 'bg-yellow-100 text-yellow-700', icon: <AlertTriangle className="h-3 w-3" /> },
  breached: { label: 'Breached', className: 'bg-red-100 text-red-700', icon: <AlertCircle className="h-3 w-3" /> }
};

export function TicketsTable({ tickets, isStaff = false }: TicketsTableProps) {
  const router = useRouter();

  const handleRowClick = (ticketId: string) => {
    router.push(`/grievance/tickets/${ticketId}`);
  };

  if (tickets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">No tickets found</h3>
        <p className="text-muted-foreground mt-1">
          {isStaff ? 'No grievance tickets match your filters.' : 'You have not raised any grievance tickets yet.'}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[140px]">Ticket #</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead className="w-[120px]">Category</TableHead>
            <TableHead className="w-[100px]">Priority</TableHead>
            <TableHead className="w-[120px]">Status</TableHead>
            <TableHead className="w-[100px]">SLA</TableHead>
            {isStaff && <TableHead className="w-[150px]">Raised By</TableHead>}
            <TableHead className="w-[120px]">Created</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.map((ticket) => {
            const status = statusConfig[ticket.status];
            const priority = priorityConfig[ticket.priority];
            const sla = slaConfig[ticket.sla_status];

            return (
              <TableRow
                key={ticket.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleRowClick(ticket.id)}
              >
                <TableCell className="font-mono text-sm">
                  {ticket.ticket_number}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium truncate max-w-[300px]">
                      {ticket.subject}
                    </span>
                    {ticket.assignee && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <User className="h-3 w-3" />
                        {ticket.assignee.full_name}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {(ticket.category as any)?.name || 'N/A'}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={priority.className}>
                    {priority.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={status.variant} className="flex items-center gap-1 w-fit">
                    {status.icon}
                    {status.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
                    <Badge variant="outline" className={`flex items-center gap-1 w-fit ${sla.className}`}>
                      {sla.icon}
                      {sla.label}
                    </Badge>
                  )}
                  {(ticket.status === 'resolved' || ticket.status === 'closed') && (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </TableCell>
                {isStaff && (
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm">{ticket.raised_by_name}</span>
                      <span className="text-xs text-muted-foreground capitalize">
                        {ticket.raised_by_type}
                      </span>
                    </div>
                  </TableCell>
                )}
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
                  </span>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleRowClick(ticket.id)}>
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </DropdownMenuItem>
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
