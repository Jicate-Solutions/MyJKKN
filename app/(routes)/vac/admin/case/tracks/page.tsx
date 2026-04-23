'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCASETracks, useUpdateCASETrack } from '@/hooks/vac/use-case';
import type { CASETrack } from '@/types/case';
import { Pencil, ArrowLeft, Layers } from 'lucide-react';

/**
 * navMeta — documents that this page is invoked via a button/link on the
 * parent listing page. Required by `scripts/assert-nav-coverage.mjs`.
 */
export const navMeta = {
  invokedFrom: '/vac/admin/case',
} as const;


// ── Type badge colors ─────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  ai_mastery: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  human_excellence:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CASETrackListPage() {
  const router = useRouter();

  const { data: tracksData, isLoading } = useCASETracks();
  const updateTrackMutation = useUpdateCASETrack();

  const tracks: CASETrack[] = useMemo(() => {
    if (!tracksData) return [];
    return (Array.isArray(tracksData) ? tracksData : []) as CASETrack[];
  }, [tracksData]);

  const sortedTracks = useMemo(
    () => [...tracks].sort((a, b) => a.sequence_order - b.sequence_order),
    [tracks]
  );

  const handleToggleActive = (track: CASETrack) => {
    updateTrackMutation.mutate({
      id: track.id,
      input: { is_active: !track.is_active },
    });
  };

  return (
    <ContentLayout title="CASE Tracks">
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
            <BreadcrumbPage>Tracks</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-4 mt-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">CASE Tracks</h1>
            <p className="text-sm text-muted-foreground">
              Manage the 6 CASE graduation tracks and their thresholds
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-center">Sequence</TableHead>
                  <TableHead>Prerequisite</TableHead>
                  <TableHead className="text-center">Attendance %</TableHead>
                  <TableHead className="text-center">Grader %</TableHead>
                  <TableHead className="text-center">Project</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 10 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : sortedTracks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8">
                      <Layers className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">
                        No tracks configured
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedTracks.map((track) => (
                    <TableRow key={track.id}>
                      <TableCell className="font-mono text-xs font-bold">
                        {track.track_code}
                      </TableCell>
                      <TableCell className="font-medium">
                        {track.track_name}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={TYPE_COLORS[track.track_type] || ''}
                        >
                          {track.track_type === 'ai_mastery' ? 'AI' : 'Human'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {track.sequence_order}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {track.prerequisite_track_id
                          ? tracks.find(
                              (t) => t.id === track.prerequisite_track_id
                            )?.track_code || '-'
                          : 'None'}
                      </TableCell>
                      <TableCell className="text-center">
                        {track.completion_attendance_threshold}%
                      </TableCell>
                      <TableCell className="text-center">
                        {track.completion_grader_threshold}%
                      </TableCell>
                      <TableCell className="text-center">
                        {track.completion_project_required ? (
                          <Badge variant="default">Required</Badge>
                        ) : (
                          <Badge variant="secondary">Optional</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={track.is_active}
                          onCheckedChange={() => handleToggleActive(track)}
                          disabled={updateTrackMutation.isPending}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() =>
                            router.push(
                              `/vac/admin/case/tracks/${track.id}/edit`
                            )
                          }
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
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
