'use client';

// Retired (Director decision D1, 2026-10-10): new goods receipts are recorded in
// Procurement → Deliveries, which carries the invoice checks. This route stays so an old
// bookmark or link lands on a plain notice with the way forward — not a 404, and not a
// silent redirect. The database refuses a new IMS receipt too (trg_ims_grn_00_retired).

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { ImsGrnRetiredNotice } from '@/components/ims/ims-grn-retired-notice';

export default function NewGRNPage() {
  return (
    <ContentLayout title="New GRN">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/ims/stock/grn" aria-label="Back to the IMS GRN list">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">New GRN</h1>
            <p className="text-sm text-muted-foreground">Goods receipts have moved to Procurement</p>
          </div>
        </div>
        <ImsGrnRetiredNotice />
      </div>
    </ContentLayout>
  );
}
