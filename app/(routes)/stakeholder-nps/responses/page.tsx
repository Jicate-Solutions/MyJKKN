'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { usePermissions } from '@/hooks/use-permissions';
import { useNPSResponses, useExportResponses } from '@/hooks/stakeholder-nps/use-nps-responses';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BeatLoader } from 'react-spinners';
import {
  ArrowLeft,
  Search,
  Download,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { NPSCategoryBadge } from '../_components/nps-score-display';
import { StakeholderTypeBadge } from '../_components/stakeholder-type-badge';
import type { NPSCategory } from '@/types/stakeholder-nps';

function ResponsesPageContent() {
  const searchParams = useSearchParams();
  const surveyId = searchParams.get('survey');

  const { canAccess, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const canViewResponses = isSuperAdmin || canAccess('stakeholder-nps', 'view');

  const {
    responses,
    metadata,
    loading,
    filters,
    updateFilters,
    changePage
  } = useNPSResponses({
    survey_id: surveyId || undefined
  });

  const { exportResponses, loading: exporting } = useExportResponses();

  if (permissionsLoading) {
    return (
      <ContentLayout title="Survey Responses">
        <div className="flex items-center justify-center min-h-[400px]">
          <BeatLoader color="#00e902" />
        </div>
      </ContentLayout>
    );
  }

  if (!canViewResponses) {
    return (
      <ContentLayout title="Survey Responses">
        <div className="text-center py-8">
          <p className="text-destructive">
            You do not have permission to view survey responses.
          </p>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Survey Responses">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Stakeholder NPS', href: '/stakeholder-nps' },
          { label: 'Responses', href: '/stakeholder-nps/responses' }
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/stakeholder-nps">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Survey Responses</h1>
              <p className="text-muted-foreground">
                {metadata.total} total responses
              </p>
            </div>
          </div>

          {surveyId && metadata.total > 0 && (
            <Button
              variant="outline"
              onClick={() => exportResponses(surveyId)}
              disabled={exporting}
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          )}
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by feedback or email..."
                  value={filters.search || ''}
                  onChange={(e) => updateFilters({ search: e.target.value || undefined })}
                  className="pl-9"
                />
              </div>

              <Select
                value={filters.nps_category || 'all'}
                onValueChange={(value) =>
                  updateFilters({
                    nps_category: value === 'all' ? undefined : (value as NPSCategory)
                  })
                }
              >
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="promoter">Promoters</SelectItem>
                  <SelectItem value="passive">Passives</SelectItem>
                  <SelectItem value="detractor">Detractors</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Responses Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <BeatLoader color="#00e902" />
          </div>
        ) : responses.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <p className="text-muted-foreground">No responses found</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Score</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Stakeholder</TableHead>
                    <TableHead>Feedback</TableHead>
                    <TableHead>Respondent</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {responses.map((response) => (
                    <TableRow key={response.id}>
                      <TableCell>
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                            response.nps_score >= 9
                              ? 'bg-green-500'
                              : response.nps_score >= 7
                              ? 'bg-yellow-500'
                              : 'bg-red-500'
                          }`}
                        >
                          {response.nps_score}
                        </div>
                      </TableCell>
                      <TableCell>
                        <NPSCategoryBadge category={response.nps_category} />
                      </TableCell>
                      <TableCell>
                        <StakeholderTypeBadge type={response.respondent_type} />
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <p className="line-clamp-2 text-sm">
                          {response.additional_feedback || '-'}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {response.respondent_name || response.respondent_email || 'Anonymous'}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(response.submitted_at), 'MMM d, yyyy')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Pagination */}
        {metadata.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {((metadata.page - 1) * metadata.limit) + 1} to{' '}
              {Math.min(metadata.page * metadata.limit, metadata.total)} of {metadata.total}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => changePage(metadata.page - 1)}
                disabled={metadata.page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => changePage(metadata.page + 1)}
                disabled={metadata.page >= metadata.totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </ContentLayout>
  );
}

export default function ResponsesPage() {
  return (
    <Suspense
      fallback={
        <ContentLayout title="Survey Responses">
          <div className="flex items-center justify-center min-h-[400px]">
            <BeatLoader color="#00e902" />
          </div>
        </ContentLayout>
      }
    >
      <ResponsesPageContent />
    </Suspense>
  );
}
