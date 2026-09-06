'use client';

import { use } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  ClipboardCheck,
  CalendarDays,
  User,
  MapPin,
  Loader2,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { useHostelInspection } from '@/hooks/campus-living/use-hostel-inspections';

interface InspectionDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function InspectionDetailPage({ params }: InspectionDetailPageProps) {
  const { id } = use(params);
  const { data, isLoading } = useHostelInspection(id);

  if (isLoading) {
    return (
      <ContentLayout title="Inspection Detail">
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading inspection…
        </div>
      </ContentLayout>
    );
  }

  if (!data) {
    return (
      <ContentLayout title="Inspection Detail">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-yellow-600" />
            <p className="font-medium text-foreground">Inspection not found</p>
            <p className="text-sm">
              The inspection record may have been deleted or is not accessible to
              your role.
            </p>
            <Button asChild variant="link" className="mt-2">
              <Link href="/campus-living/safety/inspections">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Inspections
              </Link>
            </Button>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const block = (data as any).hostel_blocks as
    | { name?: string; code?: string }
    | null;
  const score = data.score;
  const blockLabel = block?.name
    ? `${block.name}${block.code ? ` · ${block.code}` : ''}`
    : 'Unspecified block';
  const typeLabel = data.inspection_type.replace('_', ' ');

  return (
    <ContentLayout title="Inspection Detail">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/campus-living/safety/inspections">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold capitalize">{typeLabel}</h1>
              <p className="text-muted-foreground">
                {blockLabel} | {data.inspection_date}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {score !== null ? (
              <Badge
                className={`${
                  score >= 90
                    ? 'bg-green-100 text-green-800 hover:bg-green-100'
                    : score >= 70
                    ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100'
                    : 'bg-red-100 text-red-800 hover:bg-red-100'
                }`}
              >
                Score: {score}%
              </Badge>
            ) : (
              <Badge variant="outline">No score yet</Badge>
            )}
            {data.follow_up_required ? (
              data.follow_up_completed ? (
                <Badge variant="default">Follow-up complete</Badge>
              ) : (
                <Badge variant="secondary">Follow-up pending</Badge>
              )
            ) : null}
          </div>
        </div>

        {/* Info */}
        <Card>
          <CardHeader>
            <CardTitle>Inspection Information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Type</p>
                <p className="font-medium capitalize">{typeLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Date</p>
                <p className="font-medium">{data.inspection_date}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Inspector ID</p>
                <p className="font-mono text-xs">{data.inspector_id}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Block</p>
                <p className="font-medium">{blockLabel}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Findings */}
        <Card>
          <CardHeader>
            <CardTitle>Findings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">
              {data.findings || (
                <span className="text-muted-foreground">No findings recorded.</span>
              )}
            </p>
          </CardContent>
        </Card>

        {/* Rooms inspected */}
        {data.rooms_inspected && data.rooms_inspected.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Rooms Inspected</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {data.rooms_inspected.map((roomId) => (
                  <Badge key={roomId} variant="outline" className="font-mono text-xs">
                    {roomId}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Issues */}
        {data.issues_found && data.issues_found.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Issues Found</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.issues_found.map((issue, idx) => (
                  <div
                    key={idx}
                    className="border rounded-lg p-3 text-sm bg-amber-50 border-amber-200"
                  >
                    <pre className="whitespace-pre-wrap font-sans text-xs">
                      {JSON.stringify(issue, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Follow-up */}
        {data.follow_up_required && (
          <Card>
            <CardHeader>
              <CardTitle>Follow-up</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Deadline: </span>
                <span className="font-medium">
                  {data.follow_up_deadline ?? '—'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Status: </span>
                <span className="font-medium">
                  {data.follow_up_completed ? 'Completed' : 'Pending'}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Report URL */}
        {data.report_url && (
          <Card>
            <CardHeader>
              <CardTitle>Report</CardTitle>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" size="sm">
                <a href={data.report_url} target="_blank" rel="noopener noreferrer">
                  Open report
                  <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
