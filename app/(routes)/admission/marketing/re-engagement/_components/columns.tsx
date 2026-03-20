'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  Flame,
  Snowflake,
  Clock,
  MoreHorizontal,
  Phone,
  MessageCircle,
  Mail,
  History
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, differenceInDays } from 'date-fns';

// Type

export type ReEngagementLead = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  interested_programs: string[] | string | null;
  source: string | null;
  last_contact_at: string | null;
  last_activity_at: string | null;
  funnel_stage: string | null;
  previous_stage: string | null;
  lost_reason: string | null;
  is_dormant: boolean | null;
  dormant_at: string | null;
  score: number | null;
  engagement_score: number | null;
  institution_id: string | null;
  created_at: string;
};

// Helpers

function getScoreColor(score: number) {
  if (score >= 70) return 'text-green-600 bg-green-100 dark:bg-green-900/30';
  if (score >= 50) return 'text-amber-600 bg-amber-100 dark:bg-amber-900/30';
  return 'text-red-600 bg-red-100 dark:bg-red-900/30';
}

function getColdnessLevel(days: number) {
  if (days >= 60)
    return { label: 'Very Cold', color: 'bg-blue-600', icon: Snowflake };
  if (days >= 30)
    return { label: 'Cold', color: 'bg-blue-400', icon: Snowflake };
  return { label: 'Cooling', color: 'bg-cyan-400', icon: Clock };
}

function getProgram(lead: ReEngagementLead): string {
  if (!lead.interested_programs) return "-";
  if (Array.isArray(lead.interested_programs)) {
    return lead.interested_programs.join(", ") || "-";
  }
  return lead.interested_programs || "-";
}

function getLastContact(
  lead: ReEngagementLead
): { date: string; days: number } | null {
  const raw = lead.last_contact_at || lead.last_activity_at || lead.created_at;
  if (!raw) return null;
  const days = differenceInDays(new Date(), new Date(raw));
  return { date: raw, days };
}

// Column factory

export function createColumns(
  onMarkAsHot: (leadId: string) => void
): ColumnDef<ReEngagementLead>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value: boolean) =>
            table.toggleAllPageRowsSelected(!!value)
          }
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value: boolean) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      maxSize: 50,
      enableSorting: false,
      enableHiding: false
    },
    {
      id: "lead",
      accessorKey: "full_name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Lead" />
      ),
      cell: ({ row }) => {
        const lead = row.original;
        const initials = (lead.full_name || "U")
          .split(" ")
          .map((n: string) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2);
        return (
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{lead.full_name || "Unknown"}</p>
              <p className="text-xs text-muted-foreground">
                {lead.email || lead.phone || "-"}
              </p>
            </div>
          </div>
        );
      },
      size: 240,
      minSize: 180
    },
    {
      id: "program",
      accessorKey: "interested_programs",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Program" />
      ),
      cell: ({ row }) => (
        <span className="text-sm">{getProgram(row.original)}</span>
      ),
      size: 200,
      minSize: 140,
      enableSorting: false
    },
    {
      id: "status",
      accessorKey: "funnel_stage",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => {
        const lead = row.original;
        const contact = getLastContact(lead);
        const days = contact?.days ?? 999;
        const coldness = getColdnessLevel(days);
        return (
          <div>
            <div className="flex items-center gap-2">
              <div className={cn("w-2 h-2 rounded-full", coldness.color)} />
              <span className="text-sm">{coldness.label}</span>
            </div>
            {lead.lost_reason && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {lead.lost_reason}
              </p>
            )}
          </div>
        );
      },
      size: 140,
      minSize: 110
    },
    {
      id: "last_contact",
      accessorKey: "last_contact_at",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Last Contact" />
      ),
      cell: ({ row }) => {
        const contact = getLastContact(row.original);
        if (!contact) {
          return <span className="text-muted-foreground text-sm">-</span>;
        }
        return (
          <div>
            <p className="text-sm">{contact.days} days ago</p>
            <p className="text-xs text-muted-foreground">
              {format(new Date(contact.date), "MMM d, yyyy")}
            </p>
          </div>
        );
      },
      size: 160,
      minSize: 130
    },
    {
      id: "score",
      accessorKey: "score",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Score" />
      ),
      cell: ({ row }) => {
        const score = row.original.score ?? row.original.engagement_score ?? 0;
        return (
          <Badge className={cn("text-xs", getScoreColor(score))}>
            {score}%
          </Badge>
        );
      },
      size: 90,
      minSize: 80
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const lead = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  if (lead.phone) window.open("tel:" + lead.phone);
                }}
              >
                <Phone className="h-4 w-4 mr-2" />
                Call
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  if (lead.phone) {
                    window.open(
                      "https://wa.me/" + lead.phone.replace(/D/g, "")
                    );
                  }
                }}
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                WhatsApp
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  if (lead.email) window.open("mailto:" + lead.email);
                }}
              >
                <Mail className="h-4 w-4 mr-2" />
                Email
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <History className="h-4 w-4 mr-2" />
                View History
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onMarkAsHot(lead.id)}>
                <Flame className="h-4 w-4 mr-2" />
                Mark as Hot
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
      maxSize: 56,
      enableSorting: false,
      enableHiding: false
    }
  ];
}
