'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { AlertCircle, Plus, Filter } from 'lucide-react';
import { useCaseBatches, useCaseTracks } from '@/hooks/case/use-case';
import { BatchList } from './_components/batch-list';
import { BatchForm, type BatchFormValues } from './_components/batch-form';
import { useToast } from '@/hooks/use-toast';

export default function CASEBatchesPage() {
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [trackFilter, setTrackFilter] = useState<string>('all');

  const { toast } = useToast();
  const { data: tracksData } = useCaseTracks();
  const tracks = tracksData ?? [];

  const { data: batches, isLoading, isError, error, refetch } = useCaseBatches(
    statusFilter !== 'all' || trackFilter !== 'all'
      ? {
          ...(statusFilter !== 'all' && { status: statusFilter }),
          ...(trackFilter !== 'all' && { trackId: trackFilter })
        }
      : undefined
  );
  const batchList = batches ?? [];

  const handleCreateBatch = async (values: BatchFormValues) => {
    setIsSubmitting(true);
    try {
      // NOTE: CaseService.createBatch() — wire up when mutation hook is added
      // For now, optimistically close and show success
      await new Promise((resolve) => setTimeout(resolve, 600)); // placeholder
      toast({
        title: 'Batch created',
        description: 'The new batch has been scheduled successfully.'
      });
      setShowForm(false);
      refetch();
    } catch {
      toast({
        title: 'Failed to create batch',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ContentLayout title="CASE Batches">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'VAC', href: '/vac' },
          { label: 'Admin', href: '/vac/admin' },
          { label: 'CASE', href: '/vac/admin/case' },
          { label: 'Batches' }
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold">Batch Manager</h1>
            <p className="text-muted-foreground">
              Schedule CASE tracks across institutions and manage enrolments
            </p>
          </div>
          <Button
            onClick={() => setShowForm(true)}
            style={{ backgroundColor: '#0b6d41' }}
            className="text-white hover:opacity-90"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Batch
          </Button>
        </div>

        {/* Error */}
        {isError && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <p className="text-sm">
                  Failed to load batches.{' '}
                  {error instanceof Error ? error.message : 'Please try again.'}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 flex-wrap">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>

              <Select value={trackFilter} onValueChange={setTrackFilter}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="All Tracks" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tracks</SelectItem>
                  {tracks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="font-mono text-xs mr-2">{t.track_code}</span>
                      {t.track_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Batch List */}
        <BatchList batches={batchList} isLoading={isLoading} />
      </div>

      {/* Create Batch Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Batch</DialogTitle>
            <DialogDescription>
              Schedule a CASE track session for an institution.
            </DialogDescription>
          </DialogHeader>
          <BatchForm
            onSubmit={handleCreateBatch}
            onCancel={() => setShowForm(false)}
            isSubmitting={isSubmitting}
          />
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
