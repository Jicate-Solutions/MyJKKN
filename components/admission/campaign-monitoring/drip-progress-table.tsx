'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Play, Pause, CheckCircle2, AlertCircle, Clock, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import type { ActiveSequence } from '@/lib/services/admission/campaign-monitoring-service';

interface DripProgressTableProps {
  sequences: ActiveSequence[];
  isLoading: boolean;
}

const statusConfig: Record<
  ActiveSequence['status'],
  { label: string; color: string; icon: React.ElementType }
> = {
  in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-700', icon: Play },
  paused: { label: 'Paused', color: 'bg-yellow-100 text-yellow-700', icon: Pause },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700', icon: AlertCircle },
};

function SequenceTableSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-8 w-16" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-12">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-4">
        <Clock className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold">No Active Sequences</h3>
      <p className="text-sm text-muted-foreground mt-1">
        Start a campaign to see active drip sequences here.
      </p>
    </div>
  );
}

export function DripProgressTable({ sequences, isLoading }: DripProgressTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Active Drip Sequences</CardTitle>
          <CardDescription>Real-time progress of running sequences</CardDescription>
        </CardHeader>
        <CardContent>
          <SequenceTableSkeleton />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Active Drip Sequences</CardTitle>
            <CardDescription>
              {sequences.length > 0
                ? `${sequences.length} sequences currently running`
                : 'Real-time progress of running sequences'}
            </CardDescription>
          </div>
          {sequences.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {sequences.filter((s) => s.status === 'in_progress').length} Active
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {sequences.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Next Action</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sequences.map((sequence) => {
                  const status = statusConfig[sequence.status];
                  const StatusIcon = status.icon;

                  return (
                    <TableRow key={sequence.id}>
                      <TableCell>
                        <div className="font-medium">{sequence.leadName}</div>
                        <div className="text-xs text-muted-foreground">
                          Started {formatDistanceToNow(new Date(sequence.startedAt), { addSuffix: true })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{sequence.campaignName}</div>
                      </TableCell>
                      <TableCell>
                        <div className="w-32 space-y-1">
                          <div className="flex justify-between text-xs">
                            <span>
                              Step {sequence.currentStep}/{sequence.totalSteps}
                            </span>
                            <span>{sequence.stepProgress}%</span>
                          </div>
                          <Progress value={sequence.stepProgress} className="h-2" />
                        </div>
                      </TableCell>
                      <TableCell>
                        {sequence.nextActionAt ? (
                          <div className="text-sm">
                            <span className="text-muted-foreground">
                              {formatDistanceToNow(new Date(sequence.nextActionAt), { addSuffix: true })}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${status.color} gap-1`}>
                          <StatusIcon className="h-3 w-3" />
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/admission/leads/${sequence.leadId}`}>
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
