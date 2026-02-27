'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Search,
  AlertCircle,
  FileCode,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { useSubmissions, useSSEvents } from '@/hooks/startup-studio';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  submitted: 'bg-blue-100 text-blue-800',
  under_review: 'bg-amber-100 text-amber-800',
  reviewed: 'bg-purple-100 text-purple-800',
  accepted: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

const STATUSES = ['all', 'draft', 'submitted', 'under_review', 'reviewed', 'accepted', 'rejected'];

export function SubmissionsList() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [eventFilter, setEventFilter] = useState('all');

  const filters: Record<string, any> = {};
  if (statusFilter !== 'all') filters.status = statusFilter;
  if (eventFilter !== 'all') filters.event_id = eventFilter;

  const { data: submissionsRaw, isLoading, error } = useSubmissions(filters);
  const { data: eventsRaw } = useSSEvents();

  const submissions = submissionsRaw as any;
  const events = eventsRaw as any;

  const submissionsList = Array.isArray(submissions)
    ? submissions
    : submissions?.data ?? [];

  const eventsList = Array.isArray(events) ? events : events?.data ?? [];

  const filteredSubmissions = submissionsList.filter((s: any) => {
    const appName = s.app_name ?? s.name ?? '';
    const teamName = s.team_name ?? '';
    const term = search.toLowerCase();
    return (
      appName.toLowerCase().includes(term) ||
      teamName.toLowerCase().includes(term)
    );
  });

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load submissions. Please try refreshing the page.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search & Filters */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by app name or team name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {eventsList.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1 mr-2">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Event:</span>
            </div>
            <Button
              variant={eventFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setEventFilter('all')}
              className="text-xs h-7"
            >
              All Events
            </Button>
            {eventsList.map((event: any) => (
              <Button
                key={event.id}
                variant={eventFilter === event.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setEventFilter(event.id)}
                className="text-xs h-7"
              >
                {event.name}
              </Button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1 mr-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-medium">Status:</span>
          </div>
          {STATUSES.map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(status)}
              className="capitalize text-xs h-7"
            >
              {status === 'all'
                ? 'All Statuses'
                : status.replace('_', ' ')}
            </Button>
          ))}
        </div>
      </div>

      {/* Submissions Table */}
      {isLoading ? (
        <Card>
          <CardContent className="pt-6 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : filteredSubmissions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileCode className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No submissions found</p>
            <p className="text-sm text-muted-foreground">
              {search
                ? 'Try adjusting your search or filters'
                : 'Submissions will appear here once teams submit their work'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>App Name</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSubmissions.map((submission: any) => (
                  <TableRow
                    key={submission.id}
                    className="cursor-pointer hover:bg-muted/50"
                  >
                    <TableCell>
                      <Link
                        href={`/startup-studio/submissions/${submission.id}`}
                        className="font-medium hover:underline"
                      >
                        {submission.app_name ?? submission.name ?? 'Untitled'}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {submission.team_name ?? '-'}
                    </TableCell>
                    <TableCell>
                      {submission.status && (
                        <Badge
                          variant="outline"
                          className={
                            STATUS_COLORS[submission.status] ??
                            'bg-gray-100 text-gray-800'
                          }
                        >
                          {submission.status.replace('_', ' ')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {submission.total_score ?? submission.score ?? '-'}
                    </TableCell>
                    <TableCell>
                      {submission.submitted_at
                        ? new Date(submission.submitted_at).toLocaleDateString()
                        : submission.created_at
                        ? new Date(submission.created_at).toLocaleDateString()
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <Link href={`/startup-studio/submissions/${submission.id}`}>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
