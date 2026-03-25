'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MessageSquare,
  Mail,
  Phone,
  ArrowRight,
  ClipboardList,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  Pause,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { ExecutionLog } from '@/lib/services/admission/campaign-monitoring-service';

interface ExecutionLogFeedProps {
  logs: ExecutionLog[];
  isLoading: boolean;
  onRefresh?: () => void;
  isConnected?: boolean;
}

const actionConfig: Record<
  ExecutionLog['actionType'],
  { label: string; icon: React.ElementType; color: string }
> = {
  send_whatsapp: { label: 'WhatsApp', icon: MessageSquare, color: 'text-green-600' },
  send_email: { label: 'Email', icon: Mail, color: 'text-blue-600' },
  send_sms: { label: 'SMS', icon: Phone, color: 'text-purple-600' },
  stage_update: { label: 'Stage Update', icon: ArrowRight, color: 'text-indigo-600' },
  task_created: { label: 'Task', icon: ClipboardList, color: 'text-orange-600' },
  sequence_started: { label: 'Started', icon: Play, color: 'text-cyan-600' },
  sequence_completed: { label: 'Completed', icon: CheckCircle2, color: 'text-emerald-600' },
  sequence_failed: { label: 'Failed', icon: AlertCircle, color: 'text-red-600' },
};

const statusConfig: Record<
  ExecutionLog['status'],
  { label: string; color: string; bgColor: string }
> = {
  success: { label: 'Success', color: 'text-green-700', bgColor: 'bg-green-100' },
  failed: { label: 'Failed', color: 'text-red-700', bgColor: 'bg-red-100' },
  pending: { label: 'Pending', color: 'text-amber-700', bgColor: 'bg-amber-100' },
};

function LogEntrySkeleton() {
  return (
    <div className="flex items-start gap-3 p-3 border-b last:border-b-0">
      <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

function LogEntry({ log, isNew }: { log: ExecutionLog; isNew?: boolean }) {
  const action = actionConfig[log.actionType];
  const status = statusConfig[log.status];
  const ActionIcon = action.icon;

  return (
    <div
      className={`flex items-start gap-3 p-3 border-b last:border-b-0 transition-colors ${
        isNew ? 'bg-primary/5 animate-pulse' : 'hover:bg-muted/50'
      }`}
    >
      {/* Action Icon */}
      <div
        className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${
          log.status === 'success'
            ? 'bg-green-100'
            : log.status === 'failed'
            ? 'bg-red-100'
            : 'bg-amber-100'
        }`}
      >
        <ActionIcon className={`h-4 w-4 ${action.color}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{action.label}</span>
          <Badge className={`${status.bgColor} ${status.color} text-xs px-1.5 py-0`}>
            {status.label}
          </Badge>
          {log.campaignName && (
            <span className="text-xs text-muted-foreground truncate max-w-[150px]">
              {log.campaignName}
            </span>
          )}
        </div>

        <p className="text-sm text-muted-foreground mt-0.5">{log.message}</p>

        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          {log.leadName && <span>{log.leadName}</span>}
          {log.leadName && <span>-</span>}
          <span>{formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}</span>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-12">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-4">
        <Clock className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold">No Recent Activity</h3>
      <p className="text-sm text-muted-foreground mt-1">
        Campaign executions will appear here in real-time.
      </p>
    </div>
  );
}

export function ExecutionLogFeed({
  logs,
  isLoading,
  onRefresh,
  isConnected,
}: ExecutionLogFeedProps) {
  const [newLogIds, setNewLogIds] = useState<Set<string>>(new Set());
  const prevLogsRef = useRef<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Track new logs for highlight animation
  useEffect(() => {
    const currentIds = logs.map((l) => l.id);
    const newIds = currentIds.filter((id) => !prevLogsRef.current.includes(id));

    if (newIds.length > 0) {
      setNewLogIds(new Set(newIds));

      // Clear highlight after animation
      const timeout = setTimeout(() => {
        setNewLogIds(new Set());
      }, 2000);

      return () => clearTimeout(timeout);
    }

    prevLogsRef.current = currentIds;
  }, [logs]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Execution Log</CardTitle>
          <CardDescription>Real-time campaign activity feed</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-0">
            {[1, 2, 3, 4, 5].map((i) => (
              <LogEntrySkeleton key={i} />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Execution Log
              {isConnected && (
                <span className="flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
              )}
            </CardTitle>
            <CardDescription>
              {isConnected ? 'Live feed - auto-updating' : 'Recent campaign activity'}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isConnected !== undefined && (
              <Badge
                variant="outline"
                className={isConnected ? 'text-green-600 border-green-200' : 'text-amber-600 border-amber-200'}
              >
                {isConnected ? 'Connected' : 'Disconnected'}
              </Badge>
            )}
            {onRefresh && (
              <Button variant="ghost" size="sm" onClick={onRefresh}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {logs.length === 0 ? (
          <div className="p-6">
            <EmptyState />
          </div>
        ) : (
          <ScrollArea className="h-[400px]" ref={scrollRef}>
            <div className="divide-y">
              {logs.map((log) => (
                <LogEntry key={log.id} log={log} isNew={newLogIds.has(log.id)} />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
