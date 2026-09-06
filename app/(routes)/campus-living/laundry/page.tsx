'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  Shirt,
  Plus,
  Search,
  Loader2,
  CheckCircle2,
  Clock,
  PackageCheck,
  Droplets,
  AlertCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  useLaundryOrders,
  useCreateLaundryOrder,
} from '@/hooks/campus-living/use-hostel-laundry';
import { BlockSelector } from '@/components/campus-living/block-selector';


/**
 * navMeta — documents that this page is invoked via a button/row-click on
 * the parent page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 * Added 2026-04-24 in the matchPaths-only sweep (PR follow-up to #408).
 */
export const navMeta = {
  invokedFrom: '/campus-living',
} as const;

// Real prod schema (verified via Supabase Management API):
// hostel_laundry_orders.status → laundry_order_status_enum
const STATUS_OPTIONS = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'collected', label: 'Collected' },
  { value: 'washing', label: 'Washing' },
  { value: 'ready', label: 'Ready' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'disputed', label: 'Disputed' },
];

export default function LaundryPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';
  const [searchQuery, setSearchQuery] = useState('');
  const [blockFilter, setBlockFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState(false);

  const filters = useMemo(
    () => ({
      block_id: blockFilter !== 'all' ? blockFilter : undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
    }),
    [blockFilter, statusFilter]
  );

  const { data, isLoading } = useLaundryOrders(institutionId, filters);
  const orders = data?.data ?? [];

  const filteredOrders = orders.filter((o) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      String(o.order_number ?? '').toLowerCase().includes(q) ||
      String(o.id ?? '').toLowerCase().includes(q) ||
      String(o.notes ?? '').toLowerCase().includes(q)
    );
  });

  const stats = useMemo(() => {
    const all = orders;
    // Coerce status to string — service union (LaundryStatus) hasn't yet been
    // updated to include the real prod enum values (submitted / collected).
    const statusOf = (o: typeof all[number]) => String(o.status);
    return {
      total: all.length,
      pending: all.filter((o) => statusOf(o) === 'submitted' || statusOf(o) === 'collected').length,
      inProgress: all.filter((o) => statusOf(o) === 'washing').length,
      ready: all.filter((o) => statusOf(o) === 'ready').length,
      delivered: all.filter((o) => statusOf(o) === 'delivered').length,
    };
  }, [orders]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'submitted':
        return <Badge variant="outline"><Clock className="mr-1 h-3 w-3" />Submitted</Badge>;
      case 'collected':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100"><PackageCheck className="mr-1 h-3 w-3" />Collected</Badge>;
      case 'washing':
        return <Badge className="bg-cyan-100 text-cyan-800 hover:bg-cyan-100"><Droplets className="mr-1 h-3 w-3" />Washing</Badge>;
      case 'ready':
        return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100"><PackageCheck className="mr-1 h-3 w-3" />Ready</Badge>;
      case 'delivered':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle2 className="mr-1 h-3 w-3" />Delivered</Badge>;
      case 'disputed':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100"><AlertCircle className="mr-1 h-3 w-3" />Disputed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <ContentLayout title="Laundry">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Laundry' },
        ]}
      />

      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shirt className="h-6 w-6 text-primary" />
              Laundry Orders
            </h1>
            <p className="text-muted-foreground">
              Track laundry pickup, processing and delivery.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} disabled={!institutionId}>
            <Plus className="mr-2 h-4 w-4" />
            New Order
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-5">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="text-2xl font-bold">{stats.pending}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">In Progress</p>
              <p className="text-2xl font-bold">{stats.inProgress}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Ready</p>
              <p className="text-2xl font-bold">{stats.ready}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Delivered</p>
              <p className="text-2xl font-bold">{stats.delivered}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search orders…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <BlockSelector
                institutionId={institutionId}
                value={blockFilter}
                onValueChange={setBlockFilter}
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
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
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="py-16 text-center">
                <Shirt className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-medium">No laundry orders yet</h3>
                <p className="text-sm text-muted-foreground">
                  New orders will appear here once they&apos;re submitted.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Collected</TableHead>
                    <TableHead>Ready</TableHead>
                    <TableHead>Delivered</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs">
                        {String(o.order_number ?? o.id.slice(0, 8))}
                      </TableCell>
                      <TableCell>{String(o.total_items ?? o.garment_count ?? '—')}</TableCell>
                      <TableCell>{getStatusBadge(o.status)}</TableCell>
                      <TableCell>
                        {o.collected_at
                          ? new Date(o.collected_at as string).toLocaleDateString()
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {o.ready_at ? new Date(o.ready_at as string).toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell>
                        {o.delivered_at
                          ? new Date(o.delivered_at as string).toLocaleDateString()
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <CreateLaundryDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        institutionId={institutionId}
      />
    </ContentLayout>
  );
}

interface CreateLaundryDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  institutionId: string;
}

function CreateLaundryDialog({ open, onOpenChange, institutionId }: CreateLaundryDialogProps) {
  const createMut = useCreateLaundryOrder();
  const [blockId, setBlockId] = useState<string>('all');
  const [learnerId, setLearnerId] = useState<string>('');
  const [orderNumber, setOrderNumber] = useState<string>('');
  const [totalItems, setTotalItems] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const reset = () => {
    setBlockId('all');
    setLearnerId('');
    setOrderNumber('');
    setTotalItems('');
    setNotes('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!institutionId) return;
    if (blockId === 'all') return; // block_id is NOT NULL on prod
    const items = parseInt(totalItems, 10);
    if (Number.isNaN(items) || items < 1) return;
    // Auto-generate order number if blank: LO-<epoch-ms-tail>-<rand>
    const ordNum = orderNumber.trim() || `LO-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0')}`;
    // Payload uses real prod columns. Service DTO has index signature so
    // unknown keys pass through unchanged.
    const payload = {
      institution_id: institutionId,
      block_id: blockId,
      learner_id: learnerId.trim(),
      order_number: ordNum,
      total_items: items,
      status: 'submitted',
      notes: notes.trim() || null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    createMut.mutate(payload, {
      onSuccess: () => {
        onOpenChange(false);
        reset();
      },
    });
  };

  const learnerValid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    learnerId.trim()
  );
  const itemsValid = !Number.isNaN(parseInt(totalItems, 10)) && parseInt(totalItems, 10) >= 1;
  const canSubmit =
    Boolean(institutionId) && blockId !== 'all' && learnerValid && itemsValid && !createMut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New Laundry Order</DialogTitle>
            <DialogDescription>
              Record a laundry pickup for a resident. Order number, items count and
              block are required by the live schema.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="block">
                Block <span className="text-red-500">*</span>
              </Label>
              <BlockSelector
                institutionId={institutionId}
                value={blockId}
                onValueChange={setBlockId}
                includeAll={false}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="learner-id">
                Learner UUID <span className="text-red-500">*</span>
              </Label>
              <Input
                id="learner-id"
                placeholder="00000000-0000-0000-0000-000000000000"
                value={learnerId}
                onChange={(e) => setLearnerId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Paste from the resident&apos;s profile URL.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="order-number">Order number (auto-generated if blank)</Label>
              <Input
                id="order-number"
                placeholder="LO-1234"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="total-items">
                Total items <span className="text-red-500">*</span>
              </Label>
              <Input
                id="total-items"
                type="number"
                min={1}
                placeholder="e.g. 8"
                value={totalItems}
                onChange={(e) => setTotalItems(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Input
                id="notes"
                placeholder="Stains, fragile items, etc."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {createMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create order
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
