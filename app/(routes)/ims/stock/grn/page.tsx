'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  Plus,
  Eye,
  CheckCircle,
  ShieldCheck,
  XCircle,
  Search,
} from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  useImsGRNs,
  useVerifyImsGRN,
  useApproveImsGRN,
  useCancelImsGRN,
} from '@/hooks/ims/use-ims-stock';
import { useImsSuppliersForSelect } from '@/hooks/ims/use-ims-settings';
import { useAuth } from '@/hooks/use-auth';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import { GRN_STATUS_CONFIG } from '@/types/ims/grn';
import type { ImsGoodsReceivedNote, ImsGRNStatus } from '@/types/ims';

const GRN_STATUSES: ImsGRNStatus[] = [
  'draft',
  'pending_verification',
  'verified',
  'approved',
  'cancelled',
];

export default function GRNListPage() {
  const { profile } = useAuth();
  const { storeId, institutionId } = useImsStoreContext();
  const userId = profile?.id ?? '';

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');

  const { data: grnData, isLoading } = useImsGRNs({
    search: search || undefined,
    status: statusFilter !== 'all' ? (statusFilter as ImsGRNStatus) : undefined,
    supplier_id: supplierFilter !== 'all' ? supplierFilter : undefined,
    store_id: storeId || '',
    institution_id: institutionId,
  });

  const { data: suppliers } = useImsSuppliersForSelect(storeId || '', institutionId);

  const verifyMutation = useVerifyImsGRN();
  const approveMutation = useApproveImsGRN();
  const cancelMutation = useCancelImsGRN();

  const grns: ImsGoodsReceivedNote[] = Array.isArray(grnData) ? grnData : [];

  const handleVerify = async (id: string) => {
    try {
      await verifyMutation.mutateAsync({ id, userId });
      toast.success('GRN verified successfully');
    } catch {
      toast.error('Failed to verify GRN');
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await approveMutation.mutateAsync({ id, userId });
      toast.success('GRN approved successfully');
    } catch {
      toast.error('Failed to approve GRN');
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await cancelMutation.mutateAsync(id);
      toast.success('GRN cancelled');
    } catch {
      toast.error('Failed to cancel GRN');
    }
  };

  return (
    <ContentLayout title="Goods Received Notes">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
          <div>
            <h1 className="text-2xl font-bold">Goods Received Notes</h1>
            <p className="text-sm text-muted-foreground">
              Track and manage goods received from suppliers
            </p>
          </div>
          <Button asChild>
            <Link href="/ims/stock/grn/new">
              <Plus className="mr-2 h-4 w-4" />
              New GRN
            </Link>
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by GRN# or invoice#..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-[200px]">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {GRN_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {GRN_STATUS_CONFIG[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger className="w-full md:w-[200px]">
                  <SelectValue placeholder="All Suppliers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Suppliers</SelectItem>
                  {(suppliers ?? []).map((s: { id: string; name: string }) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <BeatLoader color="#6366f1" size={12} />
              </div>
            ) : grns.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No goods received notes found.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>GRN #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grns.map((grn) => {
                    const config = GRN_STATUS_CONFIG[grn.status];
                    return (
                      <TableRow key={grn.id}>
                        <TableCell className="font-medium">
                          {grn.grn_number}
                        </TableCell>
                        <TableCell>
                          {grn.created_at
                            ? format(new Date(grn.created_at), 'dd MMM yyyy')
                            : '—'}
                        </TableCell>
                        <TableCell>
                          {grn.supplier?.name ?? '—'}
                        </TableCell>
                        <TableCell>
                          {grn.invoice_number ?? '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          {grn.invoice_amount != null
                            ? grn.invoice_amount.toLocaleString('en-IN', {
                                style: 'currency',
                                currency: 'INR',
                                maximumFractionDigits: 2,
                              })
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={config.variant}>
                            {config.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="icon" asChild>
                              <Link href={`/ims/stock/grn/${grn.id}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>

                            {(grn.status === 'draft' ||
                              grn.status === 'pending_verification') && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleVerify(grn.id)}
                                disabled={verifyMutation.isPending}
                                title="Verify"
                              >
                                <CheckCircle className="h-4 w-4 text-blue-600" />
                              </Button>
                            )}

                            {grn.status === 'verified' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleApprove(grn.id)}
                                disabled={approveMutation.isPending}
                                title="Approve"
                              >
                                <ShieldCheck className="h-4 w-4 text-green-600" />
                              </Button>
                            )}

                            {grn.status !== 'approved' &&
                              grn.status !== 'cancelled' && (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      title="Cancel"
                                    >
                                      <XCircle className="h-4 w-4 text-red-600" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>
                                        Cancel GRN?
                                      </AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to cancel GRN{' '}
                                        <strong>{grn.grn_number}</strong>? This
                                        action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>
                                        Keep it
                                      </AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleCancel(grn.id)}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        Yes, Cancel
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
