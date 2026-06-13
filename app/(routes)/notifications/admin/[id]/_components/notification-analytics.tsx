'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Building2,
  Users,
  UserCheck,
  UserX,
  Search,
  TrendingUp,
  Clock,
  Shield,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  BarChart3,
  FileText,
  Download,
  CheckCircle2,
  XCircle,
  ExternalLink,
  MessageSquare,
  Paperclip,
  Link2,
  ListChecks
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface NotificationAnalyticsProps {
  notificationId: string;
}

export function NotificationAnalytics({ notificationId }: NotificationAnalyticsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedInstitution, setExpandedInstitution] = useState<string | null>(null);
  const [showAllUnread, setShowAllUnread] = useState(false);

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['notification-analytics', notificationId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/notifications/${notificationId}/analytics`, {
        cache: 'no-store'
      });
      if (!res.ok) throw new Error('Failed to fetch analytics');
      return res.json();
    },
    refetchInterval: 30000 // Auto-refresh every 30s for live monitoring
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!analytics) return null;

  const { summary, by_institution, by_role, recent_readers, not_read } = analytics;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ─── Summary Cards ─────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          icon={<Users className="h-4 w-4" />}
          label="Total Recipients"
          value={summary.total_recipients}
          color="blue"
        />
        <SummaryCard
          icon={<Eye className="h-4 w-4" />}
          label="Read"
          value={summary.read_count}
          subtext={`${summary.read_pct}%`}
          color="green"
        />
        <SummaryCard
          icon={<EyeOff className="h-4 w-4" />}
          label="Not Read"
          value={summary.unread_count}
          color="red"
        />
        <SummaryCard
          icon={<Shield className="h-4 w-4" />}
          label="Acknowledged"
          value={summary.acknowledged_count}
          subtext={`${summary.ack_pct}%`}
          color="emerald"
        />
      </div>

      {/* ─── Reach Progress Bar ────────────────── */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Communication Reach</span>
            <span className="text-sm font-bold text-primary">{summary.read_pct}%</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-green-400 rounded-full transition-all duration-1000"
              style={{ width: `${Math.max(summary.read_pct, 1)}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5 text-xs text-muted-foreground">
            <span>{summary.read_count} read</span>
            <span>{summary.unread_count} pending</span>
          </div>
        </CardContent>
      </Card>

      {/* ─── Tabs: Institution / Role / People ── */}
      <Tabs defaultValue="institution" className="w-full">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="institution" className="text-xs sm:text-sm">
            <Building2 className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
            By Institution
          </TabsTrigger>
          <TabsTrigger value="role" className="text-xs sm:text-sm">
            <BarChart3 className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
            By Role
          </TabsTrigger>
          <TabsTrigger value="people" className="text-xs sm:text-sm">
            <Users className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
            People
          </TabsTrigger>
          <TabsTrigger value="responses" className="text-xs sm:text-sm">
            <FileText className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
            Responses
          </TabsTrigger>
        </TabsList>

        {/* ─── Institution Tab ───────────────── */}
        <TabsContent value="institution" className="mt-4 space-y-2">
          {(by_institution || []).map((inst: any) => (
            <Card
              key={inst.institution_name}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setExpandedInstitution(
                expandedInstitution === inst.institution_name ? null : inst.institution_name
              )}
            >
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm truncate">
                        {inst.institution_name}
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          inst.read_pct >= 50 ? 'bg-green-500' :
                          inst.read_pct >= 20 ? 'bg-yellow-500' : 'bg-red-500'
                        )}
                        style={{ width: `${Math.max(inst.read_pct, 2)}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    <div className="text-right">
                      <div className={cn(
                        'text-lg font-bold',
                        inst.read_pct >= 50 ? 'text-green-600' :
                        inst.read_pct >= 20 ? 'text-yellow-600' : 'text-red-600'
                      )}>
                        {inst.read_pct}%
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {inst.read_count}/{inst.total}
                      </div>
                    </div>
                    {expandedInstitution === inst.institution_name
                      ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    }
                  </div>
                </div>

                {expandedInstitution === inst.institution_name && (
                  <div className="mt-3 pt-3 border-t grid grid-cols-3 gap-2 text-center animate-in fade-in duration-200">
                    <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                      <div className="text-lg font-bold text-blue-600">{inst.total}</div>
                      <div className="text-[10px] text-blue-600/70">Total</div>
                    </div>
                    <div className="p-2 rounded-lg bg-green-50 dark:bg-green-950/30">
                      <div className="text-lg font-bold text-green-600">{inst.read_count}</div>
                      <div className="text-[10px] text-green-600/70">Read</div>
                    </div>
                    <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
                      <div className="text-lg font-bold text-emerald-600">{inst.ack_count}</div>
                      <div className="text-[10px] text-emerald-600/70">Acknowledged</div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ─── Role Tab ──────────────────────── */}
        <TabsContent value="role" className="mt-4 space-y-2">
          {(by_role || []).map((r: any) => (
            <div
              key={r.role}
              className="flex items-center gap-3 p-3 rounded-lg border bg-card"
            >
              <Badge variant="secondary" className="text-xs capitalize shrink-0">
                {r.role}
              </Badge>
              <div className="flex-1">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      r.read_pct >= 50 ? 'bg-green-500' :
                      r.read_pct >= 20 ? 'bg-yellow-500' : 'bg-red-500'
                    )}
                    style={{ width: `${Math.max(r.read_pct, 2)}%` }}
                  />
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className={cn(
                  'text-sm font-bold',
                  r.read_pct >= 50 ? 'text-green-600' :
                  r.read_pct >= 20 ? 'text-yellow-600' : 'text-red-600'
                )}>
                  {r.read_pct}%
                </span>
                <span className="text-xs text-muted-foreground ml-1">
                  ({r.read_count}/{r.total})
                </span>
              </div>
            </div>
          ))}
        </TabsContent>

        {/* ─── People Tab ────────────────────── */}
        <TabsContent value="people" className="mt-4 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or institution..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>

          {/* Recent Readers */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-green-700">
                <UserCheck className="h-4 w-4" />
                Read ({(recent_readers || []).length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y max-h-[300px] overflow-y-auto">
                {(recent_readers || [])
                  .filter((r: any) => {
                    if (!searchQuery) return true;
                    const q = searchQuery.toLowerCase();
                    return (r.name || '').toLowerCase().includes(q) ||
                      (r.email || '').toLowerCase().includes(q) ||
                      (r.institution_name || '').toLowerCase().includes(q);
                  })
                  .map((reader: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{reader.name || reader.email}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {reader.role} · {reader.institution_name}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {reader.acknowledged_at && (
                          <Badge variant="outline" className="text-[10px] border-green-300 text-green-600">
                            Ack
                          </Badge>
                        )}
                        <span className="text-[11px] text-muted-foreground">
                          {reader.read_at ? format(new Date(reader.read_at), 'h:mm a') : ''}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          {/* Not Read */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2 text-red-700">
                  <UserX className="h-4 w-4" />
                  Not Read ({summary.unread_count})
                </span>
                {(not_read || []).length > 10 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setShowAllUnread(!showAllUnread)}
                  >
                    {showAllUnread ? 'Show Less' : `Show All (${(not_read || []).length})`}
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y max-h-[400px] overflow-y-auto">
                {(not_read || [])
                  .filter((r: any) => {
                    if (!searchQuery) return true;
                    const q = searchQuery.toLowerCase();
                    return (r.name || '').toLowerCase().includes(q) ||
                      (r.email || '').toLowerCase().includes(q) ||
                      (r.institution_name || '').toLowerCase().includes(q);
                  })
                  .slice(0, showAllUnread ? undefined : 10)
                  .map((person: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{person.name || person.email}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {person.role} · {person.institution_name}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] border-red-200 text-red-500 shrink-0">
                        Not Read
                      </Badge>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Responses Tab ────────────────────── */}
        <TabsContent value="responses" className="mt-4">
          <ResponsesTab notificationId={notificationId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Responses Tab Component ────────────────────────
function ResponsesTab({ notificationId }: { notificationId: string }) {
  const [expandedResponse, setExpandedResponse] = useState<string | null>(null);

  const { data: responses, isLoading: responsesLoading } = useQuery({
    queryKey: ['notification-responses', notificationId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/notifications/${notificationId}/responses`, {
        cache: 'no-store'
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.responses || data || [];
    },
    refetchInterval: 30000
  });

  if (responsesLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!responses || responses.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <MessageSquare className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No responses yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Responses will appear here as recipients submit them.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          {responses.length} response{responses.length !== 1 ? 's' : ''} received
        </span>
      </div>
      {responses.map((response: any) => (
        <Card key={response.id} className="overflow-hidden">
          <CardContent className="p-3 sm:p-4">
            {/* Header: user info + timestamp */}
            <div className="flex items-center justify-between mb-2">
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">
                  {response.user_name || response.user_email || 'Unknown User'}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {response.user_role && <span className="capitalize">{response.user_role}</span>}
                  {response.institution_name && <span> · {response.institution_name}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <ResponseTypeBadge type={response.response_type} />
                <span className="text-[11px] text-muted-foreground">
                  {response.submitted_at
                    ? format(new Date(response.submitted_at), 'MMM d, h:mm a')
                    : ''}
                </span>
              </div>
            </div>

            {/* Response content based on type */}
            <div className="mt-2">
              {response.response_type === 'text' && (
                <div className="text-sm bg-muted/50 rounded-lg p-3">
                  {response.text_response && response.text_response.length > 200 ? (
                    <>
                      <p className="whitespace-pre-wrap">
                        {expandedResponse === response.id
                          ? response.text_response
                          : `${response.text_response.substring(0, 200)}...`}
                      </p>
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-xs mt-1"
                        onClick={() =>
                          setExpandedResponse(
                            expandedResponse === response.id ? null : response.id
                          )
                        }
                      >
                        {expandedResponse === response.id ? 'Show less' : 'Read more'}
                      </Button>
                    </>
                  ) : (
                    <p className="whitespace-pre-wrap">{response.text_response || 'No text provided'}</p>
                  )}
                </div>
              )}

              {response.response_type === 'file' && (
                <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {response.file_name || 'Uploaded file'}
                      </div>
                      {response.file_size && (
                        <div className="text-xs text-muted-foreground">
                          {formatResponseFileSize(response.file_size)}
                        </div>
                      )}
                    </div>
                  </div>
                  {response.file_url && (
                    <Button variant="outline" size="sm" asChild className="shrink-0 ml-2">
                      <a href={response.file_url} target="_blank" rel="noopener noreferrer">
                        <Download className="h-3.5 w-3.5 mr-1" />
                        Download
                      </a>
                    </Button>
                  )}
                </div>
              )}

              {response.response_type === 'form' && (
                <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                  {response.form_response && typeof response.form_response === 'object' ? (
                    Object.entries(response.form_response).map(([itemId, checked]) => (
                      <div key={itemId} className="flex items-center gap-2 text-sm">
                        {checked ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                        )}
                        <span className={cn(!checked && 'text-muted-foreground')}>
                          {itemId}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No form data available</p>
                  )}
                </div>
              )}

              {response.response_type === 'link' && (
                <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-3">
                  <Link2 className="h-4 w-4 shrink-0" />
                  {response.link_confirmed ? (
                    <Badge variant="outline" className="border-green-300 text-green-600">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Confirmed
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-red-200 text-red-500">
                      <XCircle className="h-3 w-3 mr-1" />
                      Not confirmed
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ResponseTypeBadge({ type }: { type: string }) {
  const config: Record<string, { icon: React.ReactNode; label: string; className: string }> = {
    text: {
      icon: <MessageSquare className="h-3 w-3" />,
      label: 'Text',
      className: 'border-blue-200 text-blue-600'
    },
    file: {
      icon: <Paperclip className="h-3 w-3" />,
      label: 'File',
      className: 'border-purple-200 text-purple-600'
    },
    form: {
      icon: <ListChecks className="h-3 w-3" />,
      label: 'Form',
      className: 'border-orange-200 text-orange-600'
    },
    link: {
      icon: <Link2 className="h-3 w-3" />,
      label: 'Link',
      className: 'border-cyan-200 text-cyan-600'
    }
  };

  const c = config[type] || config.text;
  return (
    <Badge variant="outline" className={cn('text-[10px] gap-1', c.className)}>
      {c.icon}
      {c.label}
    </Badge>
  );
}

function formatResponseFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Summary Card Component ─────────────────────────
function SummaryCard({ icon, label, value, subtext, color }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  subtext?: string;
  color: 'blue' | 'green' | 'red' | 'emerald';
}) {
  const colors = {
    blue: 'bg-blue-50 dark:bg-blue-950/30 text-blue-600',
    green: 'bg-green-50 dark:bg-green-950/30 text-green-600',
    red: 'bg-red-50 dark:bg-red-950/30 text-red-600',
    emerald: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600'
  };

  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className={cn('inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs mb-2', colors[color])}>
          {icon}
          {label}
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl sm:text-3xl font-bold">{value.toLocaleString()}</span>
          {subtext && <span className="text-sm text-muted-foreground">{subtext}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
