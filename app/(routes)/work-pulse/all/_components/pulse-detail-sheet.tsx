'use client';

import { User, Building2, Calendar, Clock, MessageSquare, Languages } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { AdminPulseEntry } from '@/types/work-pulse';

interface PulseDetailSheetProps {
  entry: AdminPulseEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PulseDetailSheet({ entry, open, onOpenChange }: PulseDetailSheetProps) {
  if (!entry) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-lg">Pulse Entry Details</SheetTitle>
        </SheetHeader>

        <div className="space-y-6">
          {/* User Info */}
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1 min-w-0">
              <p className="font-semibold text-base truncate">
                {entry.profiles?.full_name || 'Unknown User'}
              </p>
              <p className="text-sm text-muted-foreground truncate">
                {entry.profiles?.email || ''}
              </p>
              <div className="flex items-center gap-2 flex-wrap mt-1">
                <Badge variant="outline" className="text-xs capitalize">
                  {entry.role.replace(/_/g, ' ')}
                </Badge>
                {entry.institutions?.name && (
                  <Badge variant="secondary" className="text-xs">
                    <Building2 className="h-3 w-3 mr-1" />
                    {entry.institutions.name}
                  </Badge>
                )}
                {entry.departments?.department_name && (
                  <Badge variant="secondary" className="text-xs">
                    {entry.departments.department_name}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Date Info */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              <span>
                Week of{' '}
                {new Date(entry.week_of).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              <span>
                {new Date(entry.created_at).toLocaleString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>

          <Separator />

          {/* Q1: Talent Waste */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-red-500" />
              <h4 className="text-sm font-semibold">Q1: What takes too much of your talent?</h4>
            </div>
            <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 text-xs">
              {entry.talent_waste_category}
            </Badge>
            <div className="rounded-lg border p-3 bg-background">
              <p className="text-sm leading-relaxed">{entry.talent_waste_description}</p>
            </div>
            {entry.talent_waste_description_en && (
              <div className="rounded-lg border border-blue-200 dark:border-blue-800 p-3 bg-blue-50/50 dark:bg-blue-950/20">
                <div className="flex items-center gap-1.5 mb-1">
                  <Languages className="h-3.5 w-3.5 text-blue-600" />
                  <span className="text-[10px] font-medium text-blue-600 uppercase">English Translation</span>
                </div>
                <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
                  {entry.talent_waste_description_en}
                </p>
              </div>
            )}
          </div>

          <Separator />

          {/* Q2: Repetitive Task */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-amber-500" />
              <h4 className="text-sm font-semibold">Q2: What repetitive task wastes the most time?</h4>
            </div>
            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 text-xs">
              {entry.repetition_category}
            </Badge>
            <div className="rounded-lg border p-3 bg-background">
              <p className="text-sm leading-relaxed">{entry.repetition_description}</p>
            </div>
            {entry.repetition_description_en && (
              <div className="rounded-lg border border-blue-200 dark:border-blue-800 p-3 bg-blue-50/50 dark:bg-blue-950/20">
                <div className="flex items-center gap-1.5 mb-1">
                  <Languages className="h-3.5 w-3.5 text-blue-600" />
                  <span className="text-[10px] font-medium text-blue-600 uppercase">English Translation</span>
                </div>
                <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
                  {entry.repetition_description_en}
                </p>
              </div>
            )}
          </div>

          <Separator />

          {/* Metadata */}
          <div className="text-xs text-muted-foreground space-y-1">
            <p><span className="font-medium">Entry ID:</span> {entry.id}</p>
            <p><span className="font-medium">User ID:</span> {entry.user_id}</p>
            <p>
              <span className="font-medium">Last Updated:</span>{' '}
              {new Date(entry.updated_at).toLocaleString('en-IN')}
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
