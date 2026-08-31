'use client';

// The audit table's "Why" drawer. Deliberately thin: the breakdown itself is
// AllocationAuditPanel, shared with the allocation detail page so both tell the
// same story from one implementation.

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { AllocationAuditRow } from '@/types/campus-living-allocation-audit';
import { VerdictBadge } from './audit-badges';
import { AllocationAuditPanel } from './audit-detail-panel';

export function AuditDetailDrawer({
  row,
  onClose,
}: {
  row: AllocationAuditRow | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!row} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {row && (
          <>
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-2">
                {row.full_name}
                <VerdictBadge verdict={row.verdict} />
              </SheetTitle>
              <SheetDescription>
                {[row.roll_number, row.institution_name, row.program_name, row.semester_name]
                  .filter(Boolean)
                  .join(' · ')}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6">
              <AllocationAuditPanel row={row} />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
