'use client';

/**
 * /cdc/drives/coordinating — "My assigned drives" for faculty / coordinators.
 *
 * Deliberately not permission-guarded: coordinators hold no CDC permission.
 * The API returns only the caller's own assignments, so an unassigned user
 * simply sees an empty list.
 */

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, ClipboardCheck, MapPin } from 'lucide-react';
import { useCdcCoordinatingDrives } from '@/hooks/cdc/use-cdc-drive-day';
import { DriveStatusBadge } from '../_components/drive-status-badge';

export const navMeta = { icon: 'ClipboardCheck' };

export default function CdcCoordinatingDrivesPage() {
  const { data, isLoading, error } = useCdcCoordinatingDrives();

  return (
    <ContentLayout title="My assigned drives">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/">Home</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>My assigned drives</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">My assigned drives</h1>
          <p className="text-sm text-muted-foreground">Campus drives where you are a coordinator. Open one to mark attendance on the day.</p>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error instanceof Error ? error.message : 'Failed to load'}</p>
        ) : !data || data.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center">
              <ClipboardCheck className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">No drives are assigned to you</p>
              <p className="text-xs text-muted-foreground">The CDC office assigns coordinators from the drive page.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {data.map((d) => (
              <Card key={d.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{d.title}</p>
                      <p className="text-xs text-muted-foreground">{d.recruiter_name ?? ''}</p>
                    </div>
                    <DriveStatusBadge status={d.status} />
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {d.drive_date ? (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {d.drive_date}
                        {d.drive_start_time ? ` · ${d.drive_start_time.slice(0, 5)}` : ''}
                      </span>
                    ) : null}
                    {d.venue_label ? <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{d.venue_label}</span> : null}
                  </div>
                  <Button asChild size="sm" className="w-full" variant={d.participants_finalized ? 'default' : 'outline'}>
                    <Link href={`/cdc/drives/${d.id}/attendance`}>
                      <ClipboardCheck className="h-4 w-4 mr-2" />
                      {d.participants_finalized ? 'Mark attendance' : 'Participants not finalized yet'}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
