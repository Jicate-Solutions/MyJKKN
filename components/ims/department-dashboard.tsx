'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ClipboardList,
  FileText,
  CheckCircle2,
  CalendarDays,
  DollarSign,
  ArrowRight,
  RefreshCw,
  Building2,
  ShieldAlert,
} from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import { ImsIndentService } from '@/lib/services/ims/indent-service';
import { ImsReportsService } from '@/lib/services/ims/reports-service';
import type { ImsIndentRequest } from '@/types/ims';

// Indent status groupings (mirror reports-service.getIndentSummary semantics).
const PENDING_STATUSES = ['pending_approval', 'pending_local_approval'];
const COMPLETED_STATUSES = ['approved', 'issued', 'partially_issued', 'delivered'];

function StatCard({
  icon: Icon,
  title,
  value,
  description,
  iconClassName,
}: {
  icon: React.ElementType;
  title: string;
  value: string | number;
  description?: string;
  iconClassName?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${iconClassName || 'text-muted-foreground'}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (PENDING_STATUSES.includes(status)) return 'secondary';
  if (status === 'rejected' || status === 'cancelled') return 'destructive';
  if (COMPLETED_STATUSES.includes(status)) return 'default';
  return 'outline';
}

export function DepartmentDashboard({ departmentId }: { departmentId: string | null }) {
  const router = useRouter();
  const { storeId, institutionId } = useImsStoreContext();

  // Department name — small reference lookup (departments are readable to authed users).
  const { data: departmentName } = useQuery({
    queryKey: ['ims-dept-name', departmentId],
    queryFn: async () => {
      if (!departmentId) return null;
      const supabase = createClientSupabaseClient();
      const { data } = await supabase
        .from('departments')
        .select('department_name')
        .eq('id', departmentId)
        .single();
      return (data as { department_name: string } | null)?.department_name ?? null;
    },
    enabled: !!departmentId,
    staleTime: 10 * 60 * 1000,
  });

  // Indents — RLS already restricts these rows to the user's department, so no
  // client-side department filter is needed (single source of truth = the policy).
  const {
    data: indents,
    isLoading: indentsLoading,
    refetch: refetchIndents,
  } = useQuery({
    queryKey: ['ims-dept-indents', departmentId],
    queryFn: async () => {
      const res = await ImsIndentService.getIndents({ limit: 1000 });
      return res.data;
    },
    enabled: !!departmentId,
    staleTime: 2 * 60 * 1000,
  });

  // Consumption — current month-to-date, for this department only.
  const {
    data: consumptionValue,
    refetch: refetchConsumption,
  } = useQuery({
    queryKey: ['ims-dept-consumption-card', departmentId, storeId, institutionId],
    queryFn: async () => {
      if (!departmentId) return 0;
      try {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const rows = await ImsReportsService.getDepartmentConsumption(
          storeId || '',
          monthStart,
          undefined,
          institutionId,
        );
        const mine = rows.find((r) => r.department_id === departmentId);
        return mine?.total_value ?? 0;
      } catch {
        // Consumption is best-effort; never block the dashboard on it.
        return 0;
      }
    },
    enabled: !!departmentId,
    staleTime: 2 * 60 * 1000,
  });

  // Fail-closed state: scoped role but no department assigned on the profile.
  if (!departmentId) {
    return (
      <ContentLayout title="IMS Dashboard">
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center">
          <ShieldAlert className="h-12 w-12 text-muted-foreground" />
          <div>
            <h2 className="text-xl font-semibold">No department assigned</h2>
            <p className="text-muted-foreground text-sm max-w-md mt-1">
              Your role is scoped to a single department, but no department is set on
              your profile. Please contact your administrator to assign one.
            </p>
          </div>
        </div>
      </ContentLayout>
    );
  }

  const rows = indents ?? [];
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const total = rows.length;
  const pending = rows.filter((i) => PENDING_STATUSES.includes(i.status)).length;
  const completed = rows.filter((i) => COMPLETED_STATUSES.includes(i.status)).length;
  const thisMonth = rows.filter((i) => i.created_at && new Date(i.created_at) >= monthStart).length;

  const recent = [...rows]
    .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
    .slice(0, 8);

  const handleRefresh = () => {
    refetchIndents();
    refetchConsumption();
  };

  return (
    <ContentLayout title="IMS Dashboard">
      <div className="space-y-6">
        {/* Header with department context pill */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">IMS Dashboard</h1>
              <p className="text-muted-foreground mt-1">
                Your department&apos;s requisitions and consumption
              </p>
            </div>
            <Badge
              variant="outline"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border-primary/30 bg-primary/5"
            >
              <Building2 className="h-3.5 w-3.5 text-primary" />
              {departmentName ?? 'My Department'}
            </Badge>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {indentsLoading ? (
          <div className="flex items-center justify-center py-12">
            <BeatLoader color="#6366f1" size={12} />
          </div>
        ) : (
          <>
            {/* Department stat row */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={ClipboardList}
                title="Total Indents"
                value={total}
                description="All requisitions for your department"
              />
              <StatCard
                icon={FileText}
                title="Pending"
                value={pending}
                description="Awaiting approval"
                iconClassName={pending > 0 ? 'text-orange-600' : undefined}
              />
              <StatCard
                icon={CheckCircle2}
                title="Approved / Issued"
                value={completed}
                description="Approved, issued or delivered"
                iconClassName={completed > 0 ? 'text-green-600' : undefined}
              />
              <StatCard
                icon={CalendarDays}
                title="This Month"
                value={thisMonth}
                description="Raised since the 1st"
              />
            </div>

            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={DollarSign}
                title="Consumption (This Month)"
                value={formatCurrency(consumptionValue ?? 0)}
                description="Value issued to your department"
              />
            </div>

            {/* Recent indents + quick action */}
            <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">Recent Indents</CardTitle>
                      <CardDescription>
                        Latest requisitions raised for your department
                      </CardDescription>
                    </div>
                    {total > 0 && <Badge variant="outline">{total} total</Badge>}
                  </div>
                </CardHeader>
                <CardContent>
                  {recent.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-40" />
                      <p>No indents yet for your department</p>
                      <Button
                        variant="link"
                        size="sm"
                        className="mt-2"
                        onClick={() => router.push('/ims/indents/new')}
                      >
                        Raise your first indent
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Indent #</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Raised</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {recent.map((indent: ImsIndentRequest) => (
                            <TableRow
                              key={indent.id}
                              className="cursor-pointer"
                              onClick={() => router.push(`/ims/indents/${indent.id}`)}
                            >
                              <TableCell className="font-medium text-sm">
                                {indent.indent_number}
                              </TableCell>
                              <TableCell>
                                <Badge variant={statusBadgeVariant(indent.status)}>
                                  {indent.status.replace(/_/g, ' ')}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground text-sm">
                                {indent.created_at
                                  ? new Date(indent.created_at).toLocaleDateString('en-IN', {
                                      day: '2-digit',
                                      month: 'short',
                                    })
                                  : '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <div className="pt-3 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => router.push('/ims/indents')}
                        >
                          View all indents
                          <ArrowRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Quick Actions</CardTitle>
                  <CardDescription>What you can do</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-3">
                    <Button onClick={() => router.push('/ims/indents/new')}>
                      <ClipboardList className="h-4 w-4 mr-2" />
                      New Indent
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => router.push('/ims/indents')}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      My Indents
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </ContentLayout>
  );
}
