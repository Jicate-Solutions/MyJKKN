'use client';

/**
 * Meeting List — table of all meetings linked to one project.
 *
 * Columns: meeting title, source badge, date, transcript link, processed badge,
 * suggested task count, expand to reveal SuggestedTasksPanel, delete action.
 *
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F12.
 */

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { TAP_TARGET_ICON } from '@/app/(routes)/projects/_lib/tap-targets';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Plus,
  Trash2,
  Video,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { useMeetings, useDeleteMeeting } from '@/hooks/projects/use-meetings';
import { LinkMeetingDialog } from './link-meeting-dialog';
import { SuggestedTasksPanel } from './suggested-tasks-panel';
import type { ProjectMeetingLink } from '@/types/projects';
import type { SuggestedTaskItem } from '@/lib/services/projects/meeting-service';

interface MeetingListProps {
  projectId: string;
}

function getSuggestedItems(meeting: ProjectMeetingLink): SuggestedTaskItem[] {
  const raw = meeting.suggested_tasks;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as SuggestedTaskItem[];
  return [];
}

function sourceBadge(source: string) {
  const label = source === 'fireflies' ? 'Fireflies' : source;
  return (
    <Badge variant="secondary" className="text-xs gap-1">
      <Video className="h-3 w-3" />
      {label}
    </Badge>
  );
}

export function MeetingList({ projectId }: MeetingListProps) {
  const { data: meetings, isLoading, isError } = useMeetings(projectId);
  const deleteMeeting = useDeleteMeeting();

  const [linkOpen, setLinkOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deletingMeeting, setDeletingMeeting] = useState<ProjectMeetingLink | null>(null);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleDelete() {
    if (!deletingMeeting) return;
    deleteMeeting.mutate(deletingMeeting.id, {
      onSuccess: () => {
        toast.success('Meeting unlinked');
        setDeletingMeeting(null);
      },
      onError: (err) => {
        toast.error(`Failed to unlink: ${(err as Error).message}`);
        setDeletingMeeting(null);
      },
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Loading meetings…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-4 text-sm text-destructive">
        Failed to load meetings. Please refresh.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {(meetings ?? []).length === 0
            ? 'No meetings linked yet.'
            : `${meetings!.length} meeting${meetings!.length !== 1 ? 's' : ''} linked`}
        </p>
        <Button size="sm" onClick={() => setLinkOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Link meeting
        </Button>
      </div>

      {(meetings ?? []).length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Meeting</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Transcript</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Suggestions</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {meetings!.map((meeting) => {
                const isExpanded = expanded.has(meeting.id);
                const suggestions = getSuggestedItems(meeting);

                return (
                  <>
                    <TableRow key={meeting.id}>
                      <TableCell>
                        <button
                          onClick={() => toggleExpand(meeting.id)}
                          className="flex items-center justify-center w-5 h-5 text-muted-foreground hover:text-foreground"
                          aria-label={isExpanded ? 'Collapse' : 'Expand'}
                          disabled={suggestions.length === 0}
                        >
                          {suggestions.length > 0 ? (
                            isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )
                          ) : null}
                        </button>
                      </TableCell>
                      <TableCell className="font-medium">
                        {meeting.meeting_title ?? (
                          <span className="text-muted-foreground italic">Untitled</span>
                        )}
                      </TableCell>
                      <TableCell>{sourceBadge(meeting.meeting_source)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {meeting.meeting_date
                          ? format(parseISO(meeting.meeting_date), 'dd MMM yyyy')
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {meeting.transcript_url ? (
                          <a
                            href={meeting.transcript_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                          >
                            View <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {meeting.processed_at ? (
                          <Badge variant="outline" className="gap-1 text-xs text-green-700 border-green-300">
                            <CheckCircle2 className="h-3 w-3" />
                            Processed
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-xs text-amber-700 border-amber-300">
                            <Clock className="h-3 w-3" />
                            Pending
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {suggestions.length > 0 ? (
                          <Badge variant="secondary" className="text-xs">
                            {suggestions.length} suggested
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-7 w-7 text-destructive/70 hover:text-destructive ${TAP_TARGET_ICON}`}
                          onClick={() => setDeletingMeeting(meeting)}
                          aria-label="Unlink meeting"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>

                    {isExpanded && suggestions.length > 0 && (
                      <TableRow key={`${meeting.id}-suggestions`}>
                        <TableCell colSpan={8} className="p-0">
                          <div className="border-t bg-muted/30 px-8 py-4">
                            <SuggestedTasksPanel
                              projectId={projectId}
                              meetingTitle={meeting.meeting_title ?? 'Untitled meeting'}
                              suggestions={suggestions}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <LinkMeetingDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        projectId={projectId}
      />

      <AlertDialog
        open={!!deletingMeeting}
        onOpenChange={(open) => { if (!open) setDeletingMeeting(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink meeting?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the meeting link from this project. Suggested tasks already
              confirmed as project tasks will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleteMeeting.isPending}
            >
              {deleteMeeting.isPending ? 'Removing…' : 'Unlink'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
