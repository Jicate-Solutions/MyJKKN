'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';
import {
  useGatePasses,
  usePendingGatePassRequests,
  useApproveGatePass,
  useRejectGatePass,
} from '@/hooks/campus-living/use-gate-passes';
import {
  Search,
  Loader2,
  DoorOpen,
  Clock,
  AlertTriangle,
  CheckCircle2,
  QrCode,
  Download,
  Check,
  X,
  MapPin,
  FileText,
} from 'lucide-react';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' }> = {
  requested: { label: 'Pending', variant: 'outline' },
  issued: { label: 'Issued', variant: 'outline' },
  active: { label: 'Active', variant: 'default' },
  returned: { label: 'Returned', variant: 'success' },
  overdue: { label: 'Overdue', variant: 'destructive' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  cancelled: { label: 'Cancelled', variant: 'secondary' },
};

const passTypeConfig: Record<string, { label: string; color: string }> = {
  regular_out: { label: 'Regular', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  overnight: { label: 'Overnight', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
  emergency: { label: 'Emergency', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
  visitor_accompanied: { label: 'Visitor', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
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

export default function GatePassesPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id ?? '';
  const { data: passesRaw, isLoading } = useGatePasses(institutionId);
  const { data: pendingRequests } = usePendingGatePassRequests(institutionId);
  const approveGatePass = useApproveGatePass();
  const rejectGatePass = useRejectGatePass();

  const passes = ((passesRaw as any)?.data ?? []) as any[];
  const pending = (pendingRequests ?? []) as any[];
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('pending');

  // Export CSV helper
  const sanitizeCsvValue = (val: string) => {
    // Prevent CSV formula injection — prefix dangerous characters with a single quote
    const s = String(val);
    if (/^[=+\-@\t\r]/.test(s)) return `'${s}`;
    return s;
  };

  const handleExport = () => {
    if (!passes.length) return;
    const headers = ['Pass Number', 'Student', 'Type', 'Status', 'Destination', 'Out Time', 'Expected Return', 'Actual Return'];
    const rows = passes.map((p: any) => [
      p.pass_number ?? '',
      p.learner?.full_name ?? '',
      p.pass_type ?? '',
      p.status ?? '',
      p.destination ?? '',
      p.out_time ?? '',
      p.expected_return ?? '',
      p.actual_return ?? '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${sanitizeCsvValue(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gate-passes-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isApproving, setIsApproving] = useState<string | null>(null);

  const getFilteredPasses = (tab: string) => {
    return passes?.filter((p: any) => {
      const matchesSearch =
        (p.learner?.full_name ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.learner_id ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.pass_number ?? '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTab =
        tab === 'all' ? true :
        tab === 'active' ? (p.status === 'active' || p.status === 'issued') :
        tab === 'overdue' ? p.status === 'overdue' :
        tab === 'returned' ? p.status === 'returned' :
        true;
      return matchesSearch && matchesTab;
    }) ?? [];
  };

  const activeCount = passes?.filter((p: any) => p.status === 'active' || p.status === 'issued').length ?? 0;
  const overdueCount = passes?.filter((p: any) => p.status === 'overdue').length ?? 0;
  const pendingCount = pending.length;

  const handleApprove = async (id: string) => {
    if (!profile?.id) return;
    setIsApproving(id);
    try {
      await approveGatePass.mutateAsync({ id, approverId: profile.id });
    } finally {
      setIsApproving(null);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectingId || !profile?.id || !rejectReason.trim()) return;
    try {
      await rejectGatePass.mutateAsync({
        id: rejectingId,
        rejectedBy: profile.id,
        reason: rejectReason.trim(),
      });
    } finally {
      setRejectDialogOpen(false);
      setRejectingId(null);
      setRejectReason('');
    }
  };

  if (isLoading) {
    return (
      <ContentLayout title="Gate Passes">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Gate Passes">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Gate Passes' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1">Gate Passes</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Track student exit and entry with QR-based gate pass system
            </p>
          </div>
          <Button variant="outline" onClick={handleExport} disabled={!passes.length}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>

        {/* Overdue Alert */}
        {overdueCount > 0 && (
          <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-red-800 dark:text-red-200">
                {overdueCount} Overdue Gate Pass{overdueCount > 1 ? 'es' : ''}
              </p>
              <p className="text-sm text-red-600 dark:text-red-300">
                Students haven&apos;t returned by expected time. Parents have been notified.
              </p>
            </div>
            <Button variant="outline" size="sm" className="border-red-200 text-red-700" onClick={() => setActiveTab('overdue')}>
              View Overdue
            </Button>
          </div>
        )}

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <Card className={pendingCount > 0 ? 'border-yellow-300 dark:border-yellow-700' : ''}>
            <CardContent className="p-4 flex items-center gap-3">
              <Clock className="h-8 w-8 text-yellow-600" />
              <div>
                <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <DoorOpen className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{activeCount}</p>
                <p className="text-xs text-muted-foreground">Currently Out</p>
              </div>
            </CardContent>
          </Card>
          <Card className={overdueCount > 0 ? 'border-red-200' : ''}>
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-red-600" />
              <div>
                <p className="text-2xl font-bold text-red-600">{overdueCount}</p>
                <p className="text-xs text-muted-foreground">Overdue</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{passes?.filter((p: any) => p.status === 'returned').length ?? 0}</p>
                <p className="text-xs text-muted-foreground">Returned Today</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <QrCode className="h-8 w-8 text-purple-600" />
              <div>
                <p className="text-2xl font-bold">{passes?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground">Total Passes</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, roll number, pass number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="pending" className={pendingCount > 0 ? 'text-yellow-600' : ''}>
              Pending ({pendingCount})
            </TabsTrigger>
            <TabsTrigger value="active">
              Active ({activeCount})
            </TabsTrigger>
            <TabsTrigger value="overdue" className={overdueCount > 0 ? 'text-red-600' : ''}>
              Overdue ({overdueCount})
            </TabsTrigger>
            <TabsTrigger value="returned">Returned</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>

          {/* ── Pending Requests Tab ────────────────────────────── */}
          <TabsContent value="pending">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Destination</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Expected Return</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.map((req: any) => {
                      const ptCfg = passTypeConfig[req.pass_type] ?? { label: req.pass_type, color: '' };
                      return (
                        <TableRow key={req.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{req.learner?.full_name ?? 'Unknown'}</p>
                              <p className="text-xs text-muted-foreground">{req.learner?.email ?? ''}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-xs ${ptCfg.color}`}>{ptCfg.label}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="text-sm">{req.destination}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-start gap-1.5 max-w-[200px]">
                              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                              <span className="text-sm text-muted-foreground truncate">{req.reason ?? '--'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{formatDateTime(req.expected_return)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDateTime(req.created_at)}</TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-700 border-green-300 hover:bg-green-50 dark:hover:bg-green-950/30"
                                onClick={() => handleApprove(req.id)}
                                disabled={isApproving === req.id}
                              >
                                {isApproving === req.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <Check className="mr-1 h-4 w-4" />
                                    Approve
                                  </>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-700 border-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                                onClick={() => {
                                  setRejectingId(req.id);
                                  setRejectDialogOpen(true);
                                }}
                              >
                                <X className="mr-1 h-4 w-4" />
                                Reject
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {pending.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                          No pending requests
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Existing tabs (Active, Overdue, Returned, All) ─── */}
          {['active', 'overdue', 'returned', 'all'].map((tab) => (
            <TabsContent key={tab} value={tab}>
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pass No.</TableHead>
                        <TableHead>Student</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Out Time</TableHead>
                        <TableHead>Expected Return</TableHead>
                        <TableHead>Actual Return</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getFilteredPasses(tab).map((pass: any) => {
                        const sCfg = statusConfig[pass.status] ?? { label: pass.status, variant: 'outline' as const };
                        const ptCfg = passTypeConfig[pass.pass_type] ?? { label: pass.pass_type, color: '' };
                        return (
                          <TableRow key={pass.id} className={pass.status === 'overdue' ? 'bg-red-50/50 dark:bg-red-950/20' : ''}>
                            <TableCell className="font-mono text-xs">{pass.pass_number ?? '--'}</TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{pass.learner?.full_name ?? 'Unknown'}</p>
                                <p className="text-xs text-muted-foreground">{pass.learner_id?.slice(0, 8)}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={`text-xs ${ptCfg.color}`}>{ptCfg.label}</Badge>
                            </TableCell>
                            <TableCell className="text-sm">{formatDateTime(pass.out_time)}</TableCell>
                            <TableCell className="text-sm">{formatDateTime(pass.expected_return)}</TableCell>
                            <TableCell className="text-sm">
                              {pass.actual_return ? formatDateTime(pass.actual_return) : (
                                <span className="text-muted-foreground">--</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={sCfg.variant}>{sCfg.label}</Badge>
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm" asChild>
                                <Link href={`/campus-living/gate-passes/${pass.id}`}>
                                  View
                                </Link>
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {getFilteredPasses(tab).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                            No gate passes found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* ── Reject Dialog ───────────────────────────────────── */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Gate Pass Request</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this request. The student will see this reason.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for rejection..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setRejectDialogOpen(false);
              setRejectReason('');
            }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectConfirm}
              disabled={!rejectReason.trim() || rejectGatePass.isPending}
            >
              {rejectGatePass.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <X className="mr-2 h-4 w-4" />
              )}
              Reject Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
