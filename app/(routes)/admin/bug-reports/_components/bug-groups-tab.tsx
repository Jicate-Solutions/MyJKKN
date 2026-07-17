'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/query-keys';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  Layers,
  Loader2,
  RefreshCw,
  Check,
  X,
  Crown
} from 'lucide-react';

interface ClusterMember {
  id: string;
  display_id: string;
  description: string;
  status: string;
  module_name: string | null;
  created_at: string;
  reporter_name: string | null;
}

interface BugCluster {
  id: string;
  seed_bug_id: string;
  member_count: number;
  sample_description: string;
  module_names: string[];
  status: 'proposed' | 'confirmed' | 'dismissed';
  first_seen_at: string;
  last_scan_at: string;
  members: ClusterMember[] | null;
}

const fetchClusters = async (status: string): Promise<BugCluster[]> => {
  const response = await fetch(`/api/bug-reports/clusters?status=${status}`);
  if (!response.ok) throw new Error('Failed to load groups');
  const json = await response.json();
  return json.clusters ?? [];
};

/**
 * Groups tab: nightly-scan duplicate-group proposals. AI proposes, the admin
 * confirms — confirming parks every member under the canonical (oldest) bug,
 * after which resolving the canonical cascades + emails every reporter.
 */
export function BugGroupsTab() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'proposed' | 'confirmed' | 'dismissed'>('proposed');
  const [actingOn, setActingOn] = useState<string | null>(null);

  const clustersKey = [...queryKeys.bugReports.all, 'clusters', statusFilter];
  const { data: clusters, isLoading, refetch, isFetching } = useQuery<BugCluster[]>({
    queryKey: clustersKey,
    queryFn: () => fetchClusters(statusFilter),
    staleTime: 60 * 1000
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/bug-reports/clusters/scan', { method: 'POST' });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Scan failed');
      return json;
    },
    onSuccess: (data) => {
      toast.success(
        `Scan complete: ${data.proposed_now ?? 0} group(s) proposed from ${data.pool_size ?? 0} open bugs.`
      );
      queryClient.invalidateQueries({ queryKey: [...queryKeys.bugReports.all, 'clusters'] });
    },
    onError: (err: any) => toast.error(err?.message || 'Scan failed')
  });

  const actionMutation = useMutation({
    mutationFn: async ({ clusterId, action }: { clusterId: string; action: 'confirm' | 'dismiss' }) => {
      const response = await fetch(`/api/bug-reports/clusters/${clusterId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Action failed');
      return json;
    },
    onSuccess: (data) => {
      if (data.action === 'confirmed') {
        toast.success(
          `${data.parkedCount} report(s) parked under ${data.canonical}. Resolving it now resolves them all and emails every reporter.`
        );
      } else {
        toast.success('Group dismissed — it will not be proposed again.');
      }
      queryClient.invalidateQueries({ queryKey: [...queryKeys.bugReports.all, 'clusters'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.bugReports.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.bugReports.stats() });
    },
    onError: (err: any) => toast.error(err?.message || 'Action failed'),
    onSettled: () => setActingOn(null)
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex flex-wrap items-center justify-between gap-2'>
          <div className='flex items-center gap-2'>
            <Layers className='w-5 h-5' />
            Duplicate Groups
            {clusters && (
              <Badge variant='secondary' className='ml-1'>
                {clusters.length}
              </Badge>
            )}
          </div>
          <div className='flex items-center gap-2'>
            <div className='flex rounded-md border overflow-hidden'>
              {(['proposed', 'confirmed', 'dismissed'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 text-xs capitalize transition-colors ${
                    statusFilter === s
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <Button
              size='sm'
              variant='outline'
              onClick={() => scanMutation.mutate()}
              disabled={scanMutation.isPending}
            >
              {scanMutation.isPending ? (
                <Loader2 className='w-4 h-4 mr-1 animate-spin' />
              ) : (
                <RefreshCw className='w-4 h-4 mr-1' />
              )}
              Scan now
            </Button>
          </div>
        </CardTitle>
        <p className='text-sm text-muted-foreground'>
          The nightly scan groups similar open reports. Confirming a group parks
          every report under the original (oldest) one — resolving the original
          then resolves the whole group and emails every reporter.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading || isFetching ? (
          <div className='flex items-center justify-center h-32'>
            <Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
          </div>
        ) : !clusters || clusters.length === 0 ? (
          <div className='text-center py-10 text-sm text-muted-foreground'>
            No {statusFilter} groups.
            {statusFilter === 'proposed' && ' Run "Scan now" to refresh proposals.'}
          </div>
        ) : (
          <div className='space-y-4'>
            {clusters.map((cluster) => (
              <div key={cluster.id} className='rounded-lg border p-4'>
                <div className='flex flex-wrap items-start justify-between gap-3'>
                  <div className='min-w-0'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <Badge className='bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900 dark:text-purple-200'>
                        {cluster.member_count} reports
                      </Badge>
                      {cluster.module_names.map((m) => (
                        <Badge key={m} variant='outline' className='text-xs'>
                          {m}
                        </Badge>
                      ))}
                      <span className='text-[11px] text-muted-foreground'>
                        last scan {new Date(cluster.last_scan_at).toLocaleString()}
                      </span>
                    </div>
                    <p className='text-sm mt-2 line-clamp-2'>{cluster.sample_description}</p>
                  </div>
                  {cluster.status === 'proposed' && (
                    <div className='flex items-center gap-2 shrink-0'>
                      <Button
                        size='sm'
                        onClick={() => {
                          setActingOn(cluster.id);
                          actionMutation.mutate({ clusterId: cluster.id, action: 'confirm' });
                        }}
                        disabled={actionMutation.isPending && actingOn === cluster.id}
                      >
                        {actionMutation.isPending && actingOn === cluster.id ? (
                          <Loader2 className='w-4 h-4 mr-1 animate-spin' />
                        ) : (
                          <Check className='w-4 h-4 mr-1' />
                        )}
                        Confirm group
                      </Button>
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => {
                          setActingOn(cluster.id);
                          actionMutation.mutate({ clusterId: cluster.id, action: 'dismiss' });
                        }}
                        disabled={actionMutation.isPending && actingOn === cluster.id}
                      >
                        <X className='w-4 h-4 mr-1' />
                        Dismiss
                      </Button>
                    </div>
                  )}
                </div>

                <Separator className='my-3' />

                <div className='grid gap-1.5'>
                  {(cluster.members ?? []).map((member, idx) => (
                    <Link
                      key={member.id}
                      href={`/admin/bug-reports/${member.id}`}
                      className='flex items-center gap-2 text-xs rounded-md px-2 py-1.5 hover:bg-muted/60 transition-colors'
                    >
                      {idx === 0 ? (
                        <Crown className='w-3.5 h-3.5 text-amber-500 shrink-0' aria-label='canonical (oldest)' />
                      ) : (
                        <span className='w-3.5' />
                      )}
                      <span className='font-mono font-semibold shrink-0'>{member.display_id}</span>
                      <span className='text-muted-foreground truncate'>{member.description}</span>
                      <span className='ml-auto text-muted-foreground shrink-0'>
                        {member.reporter_name ?? 'Unknown'}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
