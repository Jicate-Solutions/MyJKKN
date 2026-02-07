'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Plus, Eye, Pencil, Trash2 } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BeatLoader } from 'react-spinners';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { useFacilitatorDevelopments, useDeleteFacilitatorDevelopment } from '@/hooks/facilitator';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import {
  STAGE_LABELS,
  STAGE_COLORS,
  DEVELOPMENT_STATUS_LABELS,
  DEVELOPMENT_STATUS_COLORS,
  type DevelopmentStage,
  type DevelopmentStatus,
  type FacilitatorDevelopmentFilters
} from '@/types/facilitator-development';

export default function FacilitatorDevelopmentRecordsPage() {
  const { isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const { institutions, loading: institutionsLoading } = useUserInstitutionAccess();
  const institutionId = institutions?.[0]?.institution_id || '';

  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<DevelopmentStage | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<DevelopmentStatus | 'all'>('all');
  const [page, setPage] = useState(1);

  const filters: FacilitatorDevelopmentFilters = useMemo(() => ({
    institution_id: institutionId,
    search: search || undefined,
    current_stage: stageFilter !== 'all' ? stageFilter : undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    page,
    limit: 10,
    sort_by: 'created_at' as const,
    sort_order: 'desc' as const
  }), [institutionId, search, stageFilter, statusFilter, page]);

  const {
    data,
    isLoading,
    refetch
  } = useFacilitatorDevelopments(filters);

  const deleteMutation = useDeleteFacilitatorDevelopment();

  const records = data?.data || [];
  const metadata = data?.metadata || { total: 0, page: 1, limit: 10, totalPages: 1 };
  const loading = isLoading || institutionsLoading;

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this development plan?')) return;
    try {
      await deleteMutation.mutateAsync(id);
      refetch();
    } catch {
      // Error handled by service toast
    }
  };

  if (permissionsLoading || institutionsLoading) {
    return (
      <ContentLayout title='Development Records'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Development Records'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Facilitator Development', href: '/facilitator-development' },
          { label: 'Records', href: '/facilitator-development/records' }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Development Records</h1>
            <p className='text-sm text-muted-foreground'>
              All facilitator development plans and progress
            </p>
          </div>
          <Button asChild>
            <Link href='/facilitator-development/records/new'>
              <Plus className='mr-2 h-4 w-4' />
              New Plan
            </Link>
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className='p-4'>
            <div className='flex flex-col sm:flex-row gap-4'>
              <Input
                placeholder='Search...'
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className='sm:max-w-xs'
              />
              <Select value={stageFilter} onValueChange={(v) => { setStageFilter(v as DevelopmentStage | 'all'); setPage(1); }}>
                <SelectTrigger className='sm:max-w-[180px]'>
                  <SelectValue placeholder='Stage' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Stages</SelectItem>
                  {(Object.entries(STAGE_LABELS) as [DevelopmentStage, string][]).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as DevelopmentStatus | 'all'); setPage(1); }}>
                <SelectTrigger className='sm:max-w-[180px]'>
                  <SelectValue placeholder='Status' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Statuses</SelectItem>
                  {(Object.entries(DEVELOPMENT_STATUS_LABELS) as [DevelopmentStatus, string][]).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className='p-0'>
            {loading ? (
              <div className='flex justify-center items-center p-8'>
                <BeatLoader color='#00e902' />
              </div>
            ) : records.length === 0 ? (
              <div className='text-center py-12 text-muted-foreground'>
                <p>No development records found.</p>
                <Button asChild className='mt-4' variant='outline'>
                  <Link href='/facilitator-development/records/new'>
                    Create First Plan
                  </Link>
                </Button>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff ID</TableHead>
                      <TableHead>Current Stage</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Workshops</TableHead>
                      <TableHead>Industry Hrs</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className='text-right'>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className='font-mono text-xs'>
                          {record.staff_id.slice(0, 8)}...
                        </TableCell>
                        <TableCell>
                          <Badge className={STAGE_COLORS[record.current_stage]}>
                            {STAGE_LABELS[record.current_stage]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {record.target_stage ? (
                            <Badge variant='outline'>
                              {STAGE_LABELS[record.target_stage]}
                            </Badge>
                          ) : '--'}
                        </TableCell>
                        <TableCell>
                          {record.outcome_score !== null ? (
                            <span className='font-semibold'>
                              {Number(record.outcome_score).toFixed(1)}
                            </span>
                          ) : '--'}
                        </TableCell>
                        <TableCell>{record.workshops_attended}</TableCell>
                        <TableCell>{record.industry_exposure_hours}</TableCell>
                        <TableCell>
                          <Badge className={DEVELOPMENT_STATUS_COLORS[record.status]}>
                            {DEVELOPMENT_STATUS_LABELS[record.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className='text-right'>
                          <div className='flex justify-end gap-1'>
                            <Button variant='ghost' size='sm' asChild>
                              <Link href={`/facilitator-development/records/${record.id}`}>
                                <Eye className='h-4 w-4' />
                              </Link>
                            </Button>
                            <Button
                              variant='ghost'
                              size='sm'
                              onClick={() => handleDelete(record.id)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className='h-4 w-4 text-destructive' />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {metadata.totalPages > 1 && (
                  <div className='flex items-center justify-between px-4 py-3 border-t'>
                    <p className='text-sm text-muted-foreground'>
                      Showing {((metadata.page - 1) * metadata.limit) + 1}-
                      {Math.min(metadata.page * metadata.limit, metadata.total)} of {metadata.total}
                    </p>
                    <div className='flex gap-2'>
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        Previous
                      </Button>
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => setPage(p => Math.min(metadata.totalPages, p + 1))}
                        disabled={page >= metadata.totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
