'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
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
import { useAuth } from '@/hooks/use-auth';
import { useMyGatePasses } from '@/hooks/campus-living/use-gate-passes';
import {
  Loader2,
  Plus,
  DoorOpen,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MapPin,
} from 'lucide-react';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success'; icon: typeof Clock }> = {
  requested: { label: 'Pending Approval', variant: 'outline', icon: Clock },
  issued: { label: 'Approved', variant: 'default', icon: CheckCircle2 },
  active: { label: 'Active (Out)', variant: 'default', icon: DoorOpen },
  returned: { label: 'Returned', variant: 'success', icon: CheckCircle2 },
  overdue: { label: 'Overdue', variant: 'destructive', icon: AlertTriangle },
  rejected: { label: 'Rejected', variant: 'destructive', icon: XCircle },
  cancelled: { label: 'Cancelled', variant: 'secondary', icon: XCircle },
};

const passTypeLabels: Record<string, string> = {
  regular_out: 'Regular Outing',
  overnight: 'Overnight',
  emergency: 'Emergency',
  visitor_accompanied: 'With Visitor',
  home_visit: 'Home Visit',
};

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return '--';
  try {
    return new Date(dateStr).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export default function MyGatePassesPage() {
  const { profile } = useAuth();
  const { data: passes, isLoading } = useMyGatePasses(profile?.id ?? '');
  const [filter, setFilter] = useState<string>('all');

  const filteredPasses = (passes ?? []).filter((p) => {
    if (filter === 'all') return true;
    if (filter === 'pending') return p.status === 'requested';
    if (filter === 'active') return p.status === 'issued' || p.status === 'active';
    if (filter === 'completed') return p.status === 'returned';
    return true;
  });

  const pendingCount = (passes ?? []).filter((p) => p.status === 'requested').length;
  const activeCount = (passes ?? []).filter((p) => p.status === 'issued' || p.status === 'active').length;

  if (isLoading) {
    return (
      <ContentLayout title="My Gate Passes">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="My Gate Passes">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'My Gate Passes' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1">My Gate Passes</h1>
            <p className="text-sm text-muted-foreground">
              Request and track your hostel gate passes
            </p>
          </div>
          <Button asChild>
            <Link href="/learners/my-gate-passes/request">
              <Plus className="mr-2 h-4 w-4" />
              Request Gate Pass
            </Link>
          </Button>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Clock className="h-7 w-7 text-yellow-600" />
              <div>
                <p className="text-xl font-bold">{pendingCount}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <DoorOpen className="h-7 w-7 text-blue-600" />
              <div>
                <p className="text-xl font-bold">{activeCount}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="h-7 w-7 text-green-600" />
              <div>
                <p className="text-xl font-bold">{(passes ?? []).length}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 flex-wrap">
          {[
            { key: 'all', label: 'All' },
            { key: 'pending', label: `Pending (${pendingCount})` },
            { key: 'active', label: `Active (${activeCount})` },
            { key: 'completed', label: 'Returned' },
          ].map((f) => (
            <Button
              key={f.key}
              variant={filter === f.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Expected Return</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPasses.map((pass) => {
                  const sCfg = statusConfig[pass.status] ?? { label: pass.status, variant: 'outline' as const, icon: Clock };
                  return (
                    <TableRow key={pass.id} className={pass.status === 'overdue' ? 'bg-red-50/50 dark:bg-red-950/20' : ''}>
                      <TableCell>
                        <span className="font-medium text-sm">
                          {passTypeLabels[pass.pass_type] ?? pass.pass_type}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-sm">{pass.destination}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDateTime(pass.expected_return)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={sCfg.variant}>{sCfg.label}</Badge>
                        {pass.status === 'rejected' && pass.rejection_reason && (
                          <p className="text-xs text-red-600 mt-1">{pass.rejection_reason}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateTime(pass.created_at)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredPasses.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      <DoorOpen className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p>No gate passes found</p>
                      <Button asChild variant="link" size="sm" className="mt-2">
                        <Link href="/learners/my-gate-passes/request">
                          Request your first gate pass
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
