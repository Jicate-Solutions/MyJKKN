'use client';

import { AlertCircle, ExternalLink, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { useAttributionByPost } from './attribution-service';

/**
 * Drilldown #2 — Top performing Instagram posts, sorted by attributed lead
 * count. Shows up to 100 posts (server-side LIMIT in the service).
 */
export function PostDrilldown() {
  const { data, isLoading, error } = useAttributionByPost();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Top performing Instagram posts
        </CardTitle>
        <CardDescription>
          Per-post attribution rollup from
          <code className="mx-1">v_ig_admission_attribution</code>. Sorted by
          attributed lead count (descending). A post stays here for as long
          as the attribution window allows new leads to land — tune that
          window above.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            Failed to load — {error.message}
          </div>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No Instagram-attributed leads yet. Once a learner-creator post
            drives an admission inquiry (lead captured with
            <code className="mx-1">lead_source_ig_post_id</code>), it
            appears here.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Posted</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Media</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Applied</TableHead>
                <TableHead className="text-right">Converted</TableHead>
                <TableHead>Link</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r) => (
                <TableRow key={r.ig_post_id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {r.posted_at
                      ? format(new Date(r.posted_at), 'MMM d, yyyy')
                      : '—'}
                  </TableCell>
                  <TableCell className="font-medium">
                    @{r.account_username ?? r.ig_account_id.slice(0, 8)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {r.media_type ?? 'unknown'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{r.lead_count}</TableCell>
                  <TableCell className="text-right">
                    {r.applied_lead_count}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.converted_lead_count}
                  </TableCell>
                  <TableCell>
                    {r.post_permalink ? (
                      <a
                        href={r.post_permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        Open
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
