'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, Building2, Calendar, Clock, Star } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
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
import { useImmersions } from '@/hooks/facilitator';
import { usePermissions } from '@/hooks/use-permissions';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import {
  IMMERSION_STATUS_LABELS,
  IMMERSION_STATUS_COLORS,
  type ImmersionStatus,
  type ImmersionFilters
} from '@/types/facilitator-development';

export default function ImmersionsListPage() {
  const { isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const { institutions, loading: institutionsLoading } = useUserInstitutionAccess();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ImmersionStatus | 'all'>('all');
  const [page, setPage] = useState(1);

  const filters: ImmersionFilters = useMemo(() => ({
    search: search || undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    page,
    limit: 10,
    sort_by: 'start_date' as const,
    sort_order: 'desc' as const
  }), [search, statusFilter, page]);

  const { data, isLoading } = useImmersions(filters);

  const immersions = data?.data || [];
  const metadata = data?.metadata || { total: 0, page: 1, limit: 10, totalPages: 1 };
  const loading = isLoading || institutionsLoading;

  if (permissionsLoading || institutionsLoading) {
    return (
      <ContentLayout title='Industry Immersions'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Industry Immersions'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Facilitator Development', href: '/facilitator-development' },
          { label: 'Immersions', href: '/facilitator-development/immersions' }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Industry Immersions</h1>
            <p className='text-sm text-muted-foreground'>
              All industry placement and immersion records
            </p>
          </div>
          <Button variant='outline' asChild>
            <Link href='/facilitator-development'>
              <ArrowLeft className='mr-2 h-4 w-4' />
              Back to Dashboard
            </Link>
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className='p-4'>
            <div className='flex flex-col sm:flex-row gap-4'>
              <Input
                placeholder='Search company, industry, role...'
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className='sm:max-w-xs'
              />
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as ImmersionStatus | 'all'); setPage(1); }}>
                <SelectTrigger className='sm:max-w-[180px]'>
                  <SelectValue placeholder='Status' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Statuses</SelectItem>
                  {(Object.entries(IMMERSION_STATUS_LABELS) as [ImmersionStatus, string][]).map(([key, label]) => (
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
            ) : immersions.length === 0 ? (
              <div className='text-center py-12 text-muted-foreground'>
                <Building2 className='h-8 w-8 mx-auto mb-2 opacity-50' />
                <p>No immersion records found.</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company</TableHead>
                      <TableHead>Industry</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>Rating</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className='text-right'>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {immersions.map((imm) => (
                      <TableRow key={imm.id}>
                        <TableCell className='font-medium'>{imm.company_name}</TableCell>
                        <TableCell>{imm.industry || '--'}</TableCell>
                        <TableCell>{imm.role_title || '--'}</TableCell>
                        <TableCell>
                          <div className='flex items-center gap-1'>
                            <Clock className='h-3 w-3' />
                            {imm.duration_days ?? 0}d
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className='flex items-center gap-1'>
                            <Calendar className='h-3 w-3' />
                            {new Date(imm.start_date).toLocaleDateString()}
                          </div>
                        </TableCell>
                        <TableCell>
                          {imm.rating ? (
                            <div className='flex items-center gap-1'>
                              <Star className='h-3 w-3 text-amber-500' />
                              {imm.rating}/5
                            </div>
                          ) : '--'}
                        </TableCell>
                        <TableCell>
                          <Badge className={IMMERSION_STATUS_COLORS[imm.status]}>
                            {IMMERSION_STATUS_LABELS[imm.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className='text-right'>
                          <Button variant='ghost' size='sm' asChild>
                            <Link href={`/facilitator-development/records/${imm.development_id}`}>
                              View Plan
                            </Link>
                          </Button>
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
