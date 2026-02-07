'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  Users,
  UserCheck,
  KeyRound,
  MessageSquare,
  Mail,
  MailOpen,
  Plus,
  ArrowRight,
  Shield,
  Activity,
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BeatLoader } from 'react-spinners';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { usePermissions } from '@/hooks/use-permissions';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import {
  useParentAccessStats,
  useAdminCommunicationStats,
  useParentAccessRecords,
} from '@/hooks/parent-portal';
import type { ParentPortalAccess, AccessRelationship } from '@/types/parent-portal';
import { ACCESS_RELATIONSHIP_LABELS } from '@/types/parent-portal';

export default function ParentPortalDashboardPage() {
  const { canAccess, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const { institutions, loading: institutionsLoading } = useUserInstitutionAccess();
  const institutionId = institutions?.[0]?.institution_id || '';

  const canView = isSuperAdmin || canAccess('tqm.parent_portal', 'view');

  const { data: accessStats, isLoading: accessStatsLoading } = useParentAccessStats(institutionId);
  const { data: commStats, isLoading: commStatsLoading } = useAdminCommunicationStats(institutionId);

  // Recent access records for the dashboard
  const recentFilters = useMemo(() => ({
    institution_id: institutionId,
    page: 1,
    limit: 5,
  }), [institutionId]);
  const { data: recentAccess, isLoading: recentLoading } = useParentAccessRecords(recentFilters);

  const recentRecords = recentAccess?.data || [];
  const statsLoading = accessStatsLoading || commStatsLoading;

  if (permissionsLoading || institutionsLoading) {
    return (
      <ContentLayout title="Parent Portal">
        <div className="flex items-center justify-center min-h-[400px]">
          <BeatLoader color="#00e902" />
        </div>
      </ContentLayout>
    );
  }

  if (!canView) {
    return (
      <ContentLayout title="Parent Portal">
        <div className="text-center py-8">
          <p className="text-destructive">
            You don&apos;t have permission to view the parent portal.
          </p>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Parent Portal Dashboard">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Parent Portal', href: '/parent-portal' },
        ]}
      />
      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1">Parent Portal Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Overview of parent access management and communications
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/parent-portal/communications/new">
                <Mail className="mr-2 h-4 w-4" />
                Send Message
              </Link>
            </Button>
            <Button asChild>
              <Link href="/parent-portal/access/new">
                <Plus className="mr-2 h-4 w-4" />
                Create Access
              </Link>
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        {statsLoading ? (
          <div className="flex justify-center p-8">
            <BeatLoader color="#00e902" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Parents</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{accessStats?.total_access_records || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Registered parent access records
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Access</CardTitle>
                <UserCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {accessStats?.active_count || 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {accessStats?.inactive_count || 0} inactive
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Communications</CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{commStats?.total || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Total messages sent
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Recently Active</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {accessStats?.recently_active || 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Logged in within 30 days
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Two-column layout for details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Access Overview */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Access Management</CardTitle>
                  <CardDescription>
                    Parent access codes and permissions
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/parent-portal/access">
                    View All
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Relationship breakdown */}
              {accessStats?.by_relationship && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {Object.entries(accessStats.by_relationship).map(([rel, count]) =>
                    count > 0 ? (
                      <Badge key={rel} variant="outline">
                        {ACCESS_RELATIONSHIP_LABELS[rel as AccessRelationship] || rel}: {count}
                      </Badge>
                    ) : null
                  )}
                </div>
              )}

              {/* Recent records */}
              {recentLoading ? (
                <div className="flex justify-center p-4">
                  <BeatLoader color="#00e902" size={8} />
                </div>
              ) : recentRecords.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Shield className="mx-auto h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">No parent access records yet.</p>
                  <Button asChild className="mt-3" size="sm" variant="outline">
                    <Link href="/parent-portal/access/new">Create First Access</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentRecords.map((record: ParentPortalAccess) => (
                    <Link
                      key={record.id}
                      href={`/parent-portal/${record.id}`}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <div>
                        <div className="font-medium text-sm">{record.parent_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {record.parent_email || record.parent_phone || 'No contact info'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="bg-muted px-2 py-0.5 rounded text-xs font-mono">
                          {record.access_code}
                        </code>
                        <Badge
                          variant={record.is_active ? 'default' : 'destructive'}
                          className="text-xs"
                        >
                          {record.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Communications Overview */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Communications</CardTitle>
                  <CardDescription>
                    Messages and announcements to parents
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/parent-portal/communications">
                    View All
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <MessageSquare className="mx-auto h-5 w-5 text-muted-foreground mb-1" />
                  <div className="text-lg font-bold">{commStats?.total || 0}</div>
                  <div className="text-xs text-muted-foreground">Total Sent</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <Mail className="mx-auto h-5 w-5 text-orange-500 mb-1" />
                  <div className="text-lg font-bold text-orange-600">{commStats?.unread || 0}</div>
                  <div className="text-xs text-muted-foreground">Unread</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <MailOpen className="mx-auto h-5 w-5 text-green-500 mb-1" />
                  <div className="text-lg font-bold text-green-600">{commStats?.read || 0}</div>
                  <div className="text-xs text-muted-foreground">Read</div>
                </div>
              </div>

              {/* By type breakdown */}
              {commStats?.by_type && Object.entries(commStats.by_type).some(([, count]) => (count as number) > 0) ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">By Type</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(commStats.by_type).map(([type, count]) =>
                      (count as number) > 0 ? (
                        <Badge key={type} variant="outline" className="text-xs">
                          {type}: {count as number}
                        </Badge>
                      ) : null
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <MessageSquare className="mx-auto h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">No communications sent yet.</p>
                  <Button asChild className="mt-3" size="sm" variant="outline">
                    <Link href="/parent-portal/communications/new">Send First Message</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" asChild>
                <Link href="/parent-portal/access/new">
                  <KeyRound className="h-5 w-5" />
                  <span className="text-sm">Create Access Code</span>
                </Link>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" asChild>
                <Link href="/parent-portal/communications/new">
                  <Mail className="h-5 w-5" />
                  <span className="text-sm">Send Communication</span>
                </Link>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" asChild>
                <Link href="/parent-portal/access">
                  <Users className="h-5 w-5" />
                  <span className="text-sm">Manage Access</span>
                </Link>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" asChild>
                <Link href="/parent-portal/feedback">
                  <MessageSquare className="h-5 w-5" />
                  <span className="text-sm">View Feedback</span>
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
