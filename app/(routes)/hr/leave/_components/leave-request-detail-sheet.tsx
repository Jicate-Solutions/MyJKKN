'use client';

/**
 * The applicant's own request, as a side sheet.
 *
 * Replaces the Link to /hr/leave/[id] that the requests list used to carry
 * (2026-09-07). Same reasoning that moved the approvals queue to a sheet in
 * August: a full-page navigation costs the trip out, the trip back, and the
 * period filter that got the applicant to that row, all to read six fields.
 * The list stays underneath.
 *
 * /hr/leave/[id] still exists and renders the same body — a bookmarked or
 * shared request URL keeps working.
 */

import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';

import { LeaveRequestDetail } from './leave-request-detail';

export function LeaveRequestDetailSheet({
  applicationId,
  leaveTypeName,
  onOpenChange,
}: {
  /** null = closed. The fetch inside is disabled while it is. */
  applicationId: string | null;
  leaveTypeName?: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={Boolean(applicationId)} onOpenChange={onOpenChange}>
      {/* Flex column with a scrolling body: SheetContent has no max-height of
          its own, so a long approval chain would otherwise run under the edge
          of the screen with no way to reach it. */}
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b p-6 pb-4">
          <SheetTitle>Leave request</SheetTitle>
          <SheetDescription>
            Where this request has reached, and what was attached to it.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <LeaveRequestDetail
            applicationId={applicationId ?? undefined}
            leaveTypeName={leaveTypeName}
            // Withdrawing or cancelling removes the reason this sheet is open.
            onDone={() => onOpenChange(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
