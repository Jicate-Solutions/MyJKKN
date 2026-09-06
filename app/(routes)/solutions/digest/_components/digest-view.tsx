'use client';

/**
 * /solutions/digest — renders the shared digest compute (GET /api/solutions/digest).
 * Same numbers as the weekly Monday notification; sections that failed server-side
 * arrive as empty + an entry in `errors` and are surfaced, never hidden.
 */

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertCircle,
  Workflow,
  Users,
  FolderKanban,
  MessageSquare,
  IndianRupee,
  FileText,
  CalendarClock,
} from 'lucide-react';
import { ApiError, apiClient } from '@/lib/api/client';
import type { SolutionsDigest } from '@/lib/solutions/digest';

const PIPELINE_ORDER = ['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost', 'dormant'];

const fmtINR = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

function useSolutionsDigest() {
  return useQuery<SolutionsDigest>({
    queryKey: ['solutions', 'digest'],
    queryFn: () => apiClient.get('/api/solutions/digest'),
    staleTime: 60_000,
  });
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Workflow;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-muted p-2">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-bold leading-tight">{value}</div>
            <div className="text-xs text-muted-foreground truncate">{label}</div>
            {hint ? <div className="text-xs text-muted-foreground/70 truncate">{hint}</div> : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const ragBadgeClass: Record<string, string> = {
  red: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
};

export function DigestView() {
  const { data, isLoading, error } = useSolutionsDigest();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  // A permission refusal is a decision, not a glitch. GET /api/solutions/digest is gated on
  // solutions.dashboard.view and answers 403 to anyone without it; apiClient carries that status
  // through on ApiError. Telling those users to "try refreshing" sent them round a loop they had
  // no way to diagnose — name the situation and who can fix it instead (rule 27).
  if (error instanceof ApiError && error.status === 403) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          You do not have access to the Director Digest. Ask a super admin to grant you the{' '}
          <code className="rounded bg-muted px-1 py-0.5">solutions.dashboard.view</code> permission
          in Users → Role Management. Refreshing this page will not change it.
        </AlertDescription>
      </Alert>
    );
  }

  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Could not load the digest{error instanceof Error ? `: ${error.message}` : ''}. Try refreshing the page.
        </AlertDescription>
      </Alert>
    );
  }

  const overdueMilestones = data.clientProjects.reduce((a, p) => a + p.overdueMilestones, 0);
  const pendingPayments = data.paymentsByStatus['pending'];
  const stages = [
    ...PIPELINE_ORDER.filter((s) => s in data.pipelineByStage),
    ...Object.keys(data.pipelineByStage).filter((s) => !PIPELINE_ORDER.includes(s)),
  ];

  return (
    <div className="space-y-6">
      {data.errors.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {data.errors.length} section{data.errors.length === 1 ? '' : 's'} could not be computed and show as
            empty: {data.errors.map((e) => e.section).join(', ')}.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile icon={Workflow} label="Active prospects" value={data.prospectCount} />
        <StatTile
          icon={FolderKanban}
          label="Client-linked projects"
          value={data.clientProjects.length}
          hint={overdueMilestones ? `${overdueMilestones} overdue milestone${overdueMilestones === 1 ? '' : 's'}` : undefined}
        />
        <StatTile icon={Users} label="Clients quiet >14 days" value={data.quietClients.length} />
        <StatTile icon={MessageSquare} label="Communications, last 7 days" value={data.commsLast7d} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Workflow className="h-4 w-4" /> Pipeline by stage
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active prospects.</p>
            ) : (
              <ul className="space-y-2">
                {stages.map((stage) => (
                  <li key={stage} className="flex items-center justify-between text-sm">
                    <span className="capitalize">{stage}</span>
                    <Badge variant="secondary">{data.pipelineByStage[stage]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" /> Proposals by status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!data.proposals.available ? (
              <p className="text-sm text-muted-foreground">
                Proposal tracking is not available yet — this section lights up once the proposals module ships.
              </p>
            ) : data.proposals.count === 0 ? (
              <p className="text-sm text-muted-foreground">No proposals recorded.</p>
            ) : (
              <ul className="space-y-2">
                {Object.entries(data.proposals.byStatus).map(([status, count]) => (
                  <li key={status} className="flex items-center justify-between text-sm">
                    <span className="capitalize">{status.replace(/_/g, ' ')}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4" /> Quiet clients (no contact in {'>'}14 days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.quietClients.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Every active client with delivery underway has been contacted within 14 days.
            </p>
          ) : (
            <ul className="divide-y">
              {data.quietClients.map((qc) => (
                <li key={qc.clientId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{qc.clientName}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {qc.projects.join(', ') || 'client-linked project'}
                    </div>
                  </div>
                  <Badge variant={qc.quietDays === null || qc.quietDays > 30 ? 'destructive' : 'secondary'}>
                    {qc.quietDays === null ? 'never contacted' : `${qc.quietDays} days quiet`}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderKanban className="h-4 w-4" /> Client delivery
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.clientProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No client-linked projects yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Project</th>
                    <th className="py-2 pr-3 font-medium">Client</th>
                    <th className="py-2 pr-3 font-medium">Progress</th>
                    <th className="py-2 pr-3 font-medium">RAG</th>
                    <th className="py-2 pr-3 font-medium">Tasks</th>
                    <th className="py-2 font-medium">Overdue milestones</th>
                  </tr>
                </thead>
                <tbody>
                  {data.clientProjects.map((p) => (
                    <tr key={p.projectId} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <span className="font-medium">{p.title}</span>
                        {p.code ? <span className="ml-1 text-xs text-muted-foreground">{p.code}</span> : null}
                      </td>
                      <td className="py-2 pr-3">{p.clientName}</td>
                      <td className="py-2 pr-3">{Math.round(p.percentComplete)}%</td>
                      <td className="py-2 pr-3">
                        <Badge className={ragBadgeClass[p.ragStatus] ?? ''} variant="secondary">
                          {p.ragStatus}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">
                        {p.taskCount === 0
                          ? '—'
                          : Object.entries(p.tasksByStatus)
                              .map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`)
                              .join(' · ')}
                      </td>
                      <td className="py-2">
                        {p.overdueMilestones > 0 ? (
                          <Badge variant="destructive">{p.overdueMilestones}</Badge>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <IndianRupee className="h-4 w-4" /> Payments by status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(data.paymentsByStatus).length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded.</p>
          ) : (
            <ul className="space-y-2">
              {Object.entries(data.paymentsByStatus).map(([status, v]) => (
                <li key={status} className="flex items-center justify-between text-sm">
                  <span className="capitalize">{status}</span>
                  <span className="tabular-nums">
                    {fmtINR(v.amount)} <span className="text-xs text-muted-foreground">({v.count})</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {pendingPayments ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {fmtINR(pendingPayments.amount)} across {pendingPayments.count} pending payment
              {pendingPayments.count === 1 ? '' : 's'}.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Generated {new Date(data.generatedAt).toLocaleString('en-IN')} · the Monday 08:07 IST notification to the
        Director carries these same numbers.
      </p>
    </div>
  );
}
