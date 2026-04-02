'use client';

import { useState, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';
import {
  useCASEBatches,
  useCASETracks,
  useCreateCASEBatch,
} from '@/hooks/vac/use-case';
import type {
  CASEBatch,
  CASETrack,
  CASEBatchFilters,
  CASEBatchStatus,
  CASEDeliveryFormat,
  CreateCASEBatchInput,
} from '@/types/case';
import {
  Plus,
  ArrowLeft,
  Calendar,
  Users,
  Loader2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

// ── Status badge colors ───────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  planned: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  open: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  in_progress: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  completed: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

// ── Create Batch Dialog ───────────────────────────────────────────────────────

function CreateBatchDialog({
  tracks,
  institutionId,
}: {
  tracks: CASETrack[];
  institutionId: string;
}) {
  const createMutation = useCreateCASEBatch();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<CreateCASEBatchInput>>({
    institution_id: institutionId,
    delivery_format: 'spread',
    max_capacity: 30,
    start_date: '',
    end_date: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.track_id || !form.start_date || !form.end_date) return;

    createMutation.mutate(
      {
        ...form,
        institution_id: institutionId,
      } as CreateCASEBatchInput,
      {
        onSuccess: () => {
          setOpen(false);
          setForm({
            institution_id: institutionId,
            delivery_format: 'spread',
            max_capacity: 30,
            start_date: '',
            end_date: '',
          });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Create Batch
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New Batch</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Track *</Label>
            <Select
              value={form.track_id || ''}
              onValueChange={(v) =>
                setForm((prev) => ({ ...prev, track_id: v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a track" />
              </SelectTrigger>
              <SelectContent>
                {tracks.map((track) => (
                  <SelectItem key={track.id} value={track.id}>
                    {track.track_code} - {track.track_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="batch_code">Batch Code</Label>
            <Input
              id="batch_code"
              placeholder="e.g. AI1-2026-B1"
              value={form.batch_code || ''}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, batch_code: e.target.value }))
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_date">Start Date *</Label>
              <Input
                id="start_date"
                type="date"
                value={form.start_date || ''}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, start_date: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_date">End Date *</Label>
              <Input
                id="end_date"
                type="date"
                value={form.end_date || ''}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, end_date: e.target.value }))
                }
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Delivery Format</Label>
              <Select
                value={form.delivery_format || 'spread'}
                onValueChange={(v) =>
                  setForm((prev) => ({
                    ...prev,
                    delivery_format: v as CASEDeliveryFormat,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="spread">Spread</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="intensive">Intensive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_capacity">Max Capacity</Label>
              <Input
                id="max_capacity"
                type="number"
                min={1}
                value={form.max_capacity ?? 30}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    max_capacity: Number(e.target.value),
                  }))
                }
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Create
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BatchManagementPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';

  const [trackFilter, setTrackFilter] = useState<string>('all');

  const filters: CASEBatchFilters = useMemo(
    () => ({
      institution_id: institutionId,
      track_id: trackFilter !== 'all' ? trackFilter : undefined,
    }),
    [institutionId, trackFilter]
  );

  const { data: batchesData, isLoading: batchesLoading } =
    useCASEBatches(filters);
  const { data: tracksData, isLoading: tracksLoading } = useCASETracks();

  const batches = (batchesData ?? []) as CASEBatch[];
  const tracks = (
    Array.isArray(tracksData) ? tracksData : []
  ) as CASETrack[];

  const trackMap = useMemo(() => {
    const map: Record<string, CASETrack> = {};
    tracks.forEach((t) => (map[t.id] = t));
    return map;
  }, [tracks]);

  return (
    <ContentLayout title="CASE Batches">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/vac">VAC</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/vac/admin">Admin</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/vac/admin/case">CASE</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Batches</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-4 mt-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Batch Management</h1>
              <p className="text-sm text-muted-foreground">
                Create and manage CASE track batches
              </p>
            </div>
          </div>
          <CreateBatchDialog tracks={tracks} institutionId={institutionId} />
        </div>

        {/* Filter */}
        <div className="flex items-center gap-3">
          <Select value={trackFilter} onValueChange={setTrackFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by track" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tracks</SelectItem>
              {tracks.map((track) => (
                <SelectItem key={track.id} value={track.id}>
                  {track.track_code} - {track.track_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch Code</TableHead>
                  <TableHead>Track</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead className="text-center">Enrolled</TableHead>
                  <TableHead className="text-center">Capacity</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batchesLoading || tracksLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : batches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <Calendar className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">
                        No batches found
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  batches.map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell className="font-mono text-xs font-bold">
                        {batch.batch_code || '-'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {trackMap[batch.track_id]?.track_code || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {batch.delivery_format}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {batch.start_date
                          ? new Date(batch.start_date).toLocaleDateString(
                              'en-IN'
                            )
                          : '-'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {batch.end_date
                          ? new Date(batch.end_date).toLocaleDateString('en-IN')
                          : '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        {batch.current_enrollment}
                      </TableCell>
                      <TableCell className="text-center">
                        {batch.max_capacity}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="secondary"
                          className={STATUS_COLORS[batch.status] || ''}
                        >
                          {batch.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
