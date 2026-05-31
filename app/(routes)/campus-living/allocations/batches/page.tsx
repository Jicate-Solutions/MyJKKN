'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, ArrowRight, Wand2 } from 'lucide-react';
import { useAllocationBatches } from '@/hooks/campus-living/use-allocation-batches';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending_approval: 'secondary',
  approved: 'default',
  rejected: 'destructive',
};
const STATUS_LABEL: Record<string, string> = {
  pending_approval: 'Pending approval',
  approved: 'Approved',
  rejected: 'Rejected',
};

export default function AllocationBatchesPage() {
  const { data: batches, isLoading } = useAllocationBatches();

  return (
    <ContentLayout title="Allocation Batches">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Allocations', href: '/campus-living/allocations' },
          { label: 'Batches' },
        ]}
      />
      <div className="space-y-4 mt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold py-1">Allocation Batches</h1>
            <p className="text-sm text-muted-foreground">
              Auto-allocation runs awaiting warden review, and their history.
            </p>
          </div>
          <Button asChild>
            <Link href="/campus-living/allocations/auto">
              <Wand2 className="h-4 w-4 mr-2" /> Auto-Allocate
            </Link>
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
          </div>
        ) : !batches || batches.length === 0 ? (
          <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
            No allocation batches yet. Run Auto-Allocate to create one.
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Block</TableHead>
                  <TableHead>Allocated</TableHead>
                  <TableHead>Skipped</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.category_name ?? '—'}</TableCell>
                    <TableCell>{b.block_name ?? '—'}</TableCell>
                    <TableCell>{b.allocated_count}</TableCell>
                    <TableCell className="text-muted-foreground">{b.skipped_count}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[b.status] ?? 'outline'}>
                        {STATUS_LABEL[b.status] ?? b.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/campus-living/allocations/batches/${b.id}`}>
                          Open <ArrowRight className="h-4 w-4 ml-1" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
