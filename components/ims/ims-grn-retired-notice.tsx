// components/ims/ims-grn-retired-notice.tsx
//
// Director decision D1 (2026-10-10): the IMS goods-receipt flow is retired. Every
// delivery is recorded as a procurement GRN, which carries the invoice checks. Shown on
// the IMS GRN pages in place of the old create / verify / approve actions — an explicit
// notice with a link, never a silent redirect.

import Link from 'next/link';
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ImsGrnRetiredNotice({ showButton = true }: { showButton?: boolean }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-background px-5 py-4 text-sm shadow sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="space-y-1">
          <p className="font-medium">Deliveries are now recorded in Procurement</p>
          <p className="text-muted-foreground">
            New goods receipts can no longer be created, verified or approved here. Record each
            delivery against its purchase order in Procurement → Deliveries. The older IMS
            receipts below stay here to view.
          </p>
        </div>
      </div>
      {showButton && (
        <Button asChild className="h-11 shrink-0 sm:h-9">
          <Link href="/procurement/grn">Go to Procurement deliveries</Link>
        </Button>
      )}
    </div>
  );
}
