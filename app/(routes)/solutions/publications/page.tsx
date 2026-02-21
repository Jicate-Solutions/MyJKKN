'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus,
  BookOpen,
  Award,
  FileText,
  ExternalLink,
  Calendar,
  AlertCircle,
  Download,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  usePublications,
  usePublicationStats,
  PAPER_TYPE_CONFIG,
  JOURNAL_TYPE_LABELS,
  PUBLICATION_STATUS_CONFIG,
} from '@/hooks/solutions/use-publications';
import type { PublicationWithSolution } from '@/lib/services/solutions/publications-service';
import type { PaperType, JournalType, PublicationStatus } from '@/lib/services/solutions/types';

export default function PublicationsPage() {
  const { data: pubsData, isLoading, error } = usePublications({ limit: 50 });
  const { data: stats } = usePublicationStats();

  const publications = pubsData?.data || [];
  const totalPublications = stats?.total || 0;
  const publishedCount = stats?.publishedCount || 0;
  const scopusCount = stats?.byJournalType?.scopus || 0;
  const wosCount = stats?.byJournalType?.wos || 0;

  return (
    <ContentLayout title="Publications">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Publications' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Publications</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Research publications for NIRF/NAAC accreditation
            </p>
          </div>
          <Button asChild>
            <Link href="/solutions/publications/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Publication
            </Link>
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <BookOpen className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{totalPublications}</p>
                <p className="text-sm text-muted-foreground">Total Publications</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <Award className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{publishedCount}</p>
                <p className="text-sm text-muted-foreground">Published</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <FileText className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{scopusCount}</p>
                <p className="text-sm text-muted-foreground">Scopus Indexed</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <FileText className="h-8 w-8 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{wosCount}</p>
                <p className="text-sm text-muted-foreground">WoS Indexed</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Error State */}
        {error && (
          <Card>
            <CardContent className="py-10">
              <div className="flex flex-col items-center justify-center gap-4 text-center">
                <AlertCircle className="h-10 w-10 text-destructive" />
                <div>
                  <h3 className="font-semibold">Failed to load publications</h3>
                  <p className="text-sm text-muted-foreground">
                    {error instanceof Error ? error.message : 'An error occurred'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-6 w-20" />
                      <Skeleton className="h-6 w-24" />
                    </div>
                    <Skeleton className="h-6 w-20" />
                  </div>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && publications.length === 0 && (
          <Card>
            <CardContent className="py-10">
              <div className="flex flex-col items-center justify-center gap-4 text-center">
                <BookOpen className="h-10 w-10 text-muted-foreground" />
                <div>
                  <h3 className="font-semibold">No publications yet</h3>
                  <p className="text-sm text-muted-foreground">
                    Start tracking research publications for NIRF/NAAC accreditation
                  </p>
                </div>
                <Button asChild>
                  <Link href="/solutions/publications/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Publication
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Publications Grid */}
        {!isLoading && !error && publications.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {publications.map((pub: PublicationWithSolution) => {
              const paperType =
                pub.paper_type && PAPER_TYPE_CONFIG[pub.paper_type as PaperType]
                  ? PAPER_TYPE_CONFIG[pub.paper_type as PaperType]
                  : { label: pub.paper_type || 'Unknown', color: 'bg-gray-100 text-gray-800' };

              const status =
                pub.status && PUBLICATION_STATUS_CONFIG[pub.status as PublicationStatus]
                  ? PUBLICATION_STATUS_CONFIG[pub.status as PublicationStatus]
                  : { label: pub.status || 'Unknown', variant: 'outline' as const };

              const journalType =
                pub.journal_type && JOURNAL_TYPE_LABELS[pub.journal_type as JournalType]
                  ? JOURNAL_TYPE_LABELS[pub.journal_type as JournalType]
                  : pub.journal_type || '';

              return (
                <Card key={pub.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge className={paperType.color}>{paperType.label}</Badge>
                        {journalType && (
                          <Badge variant="outline">{journalType}</Badge>
                        )}
                      </div>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                    <CardTitle className="text-lg">{pub.title}</CardTitle>
                    {pub.journal_name && (
                      <CardDescription>{pub.journal_name}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {pub.authors && Array.isArray(pub.authors) && pub.authors.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Authors</p>
                        <p className="text-sm">
                          {pub.authors
                            .map((a) => (typeof a === 'string' ? a : a.name))
                            .join(', ')}
                        </p>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm">
                      {pub.solution && (
                        <span className="text-muted-foreground">
                          {pub.solution.solution_code} - {pub.solution.title}
                        </span>
                      )}
                      {pub.publication_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(pub.publication_date), 'MMM yyyy')}
                        </span>
                      )}
                    </div>
                    {pub.doi && (
                      <a
                        href={`https://doi.org/${pub.doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline flex items-center gap-1"
                      >
                        DOI: {pub.doi}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    <div className="flex gap-2 text-xs flex-wrap">
                      {pub.nirf_category && (
                        <Badge variant="outline" className="text-xs">
                          NIRF: {pub.nirf_category}
                        </Badge>
                      )}
                      {pub.naac_criterion && (
                        <Badge variant="outline" className="text-xs">
                          NAAC: {pub.naac_criterion}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
