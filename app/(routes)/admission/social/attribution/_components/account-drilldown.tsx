'use client';

import { AlertCircle, Instagram } from 'lucide-react';

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

import { useAttributionByAccount } from './attribution-service';

/**
 * Drilldown #1 — Admission inquiries by Instagram account.
 * One row per ig_account, sorted by attributed lead_count desc.
 */
export function AccountDrilldown() {
  const { data, isLoading, error } = useAttributionByAccount();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Instagram className="h-5 w-5" />
          Admission inquiries by Instagram account
        </CardTitle>
        <CardDescription>
          Leads attributed to each connected Instagram account via the
          <code className="mx-1">lead_source=&apos;learner_creator_content&apos;</code>
          capture flow. Ranked by total attributed leads.
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
            No leads attributed to any Instagram account yet. Once learners
            create content and admission inquiries are captured with
            <code className="mx-1">lead_source=&apos;learner_creator_content&apos;</code>
            and an attribution post-id, rows appear here.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Posts</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Applied</TableHead>
                <TableHead className="text-right">Converted</TableHead>
                <TableHead className="text-right">Conv. rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r) => {
                const convRate =
                  r.lead_count > 0
                    ? Math.round((r.converted_lead_count / r.lead_count) * 100)
                    : 0;
                return (
                  <TableRow key={r.ig_account_id}>
                    <TableCell className="font-medium">
                      @{r.account_username ?? r.ig_account_id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-right">{r.post_count}</TableCell>
                    <TableCell className="text-right">{r.lead_count}</TableCell>
                    <TableCell className="text-right">
                      {r.applied_lead_count}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.converted_lead_count}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={convRate >= 10 ? 'default' : 'secondary'}
                        className="font-normal"
                      >
                        {convRate}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
