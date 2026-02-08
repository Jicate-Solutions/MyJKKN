'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  KeyRound,
  Copy,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  Trash2,
  MessageSquare,
  Calendar,
  Shield,
  Plus,
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BeatLoader } from 'react-spinners';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { usePermissions } from '@/hooks/use-permissions';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import {
  useParentAccessRecord,
  useToggleParentAccess,
  useRegenerateAccessCode,
  useDeleteParentAccess,
  useAdminCommunications,
} from '@/hooks/parent-portal';
import type {
  ParentCommunication,
  AccessRelationship,
  AccessLevel,
} from '@/types/parent-portal';
import {
  ACCESS_RELATIONSHIP_LABELS,
  ACCESS_LEVEL_LABELS,
  COMMUNICATION_TYPE_LABELS,
  PRIORITY_LABELS,
  getPriorityColor,
} from '@/types/parent-portal';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import toast from 'react-hot-toast';

export default function ParentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { canAccess, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const { institutions, loading: institutionsLoading } = useUserInstitutionAccess();
  const institutionId = institutions?.[0]?.institution_id || '';

  const canView = isSuperAdmin || canAccess('tqm.parent_portal', 'view');

  const { data: record, isLoading: recordLoading } = useParentAccessRecord(id);
  const toggleMutation = useToggleParentAccess();
  const regenerateMutation = useRegenerateAccessCode();
  const deleteMutation = useDeleteParentAccess();

  // Communications sent to/about this parent
  const commFilters = useMemo(
    () => ({
      institution_id: institutionId,
      parent_id: record?.learner_id || undefined,
      page: 1,
      limit: 50,
    }),
    [institutionId, record?.learner_id]
  );
  const { data: commData, isLoading: commLoading } = useAdminCommunications(commFilters);
  const communications = (commData as { data?: unknown[] } | undefined)?.data || [];

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success('Access code copied to clipboard');
  };

  const handleToggle = () => {
    if (!record) return;
    toggleMutation.mutate(
      { id: record.id, isActive: !record.is_active },
      {
        onSuccess: () => {
          toast.success(
            record.is_active ? 'Access deactivated' : 'Access activated'
          );
        },
      }
    );
  };

  const handleRegenerate = () => {
    if (!record) return;
    regenerateMutation.mutate(record.id);
  };

  const handleDelete = () => {
    if (!record) return;
    if (
      window.confirm(
        'Are you sure you want to delete this parent access record? This action cannot be undone.'
      )
    ) {
      deleteMutation.mutate(record.id, {
        onSuccess: () => {
          router.push('/parent-portal/access');
        },
      });
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (permissionsLoading || institutionsLoading || recordLoading) {
    return (
      <ContentLayout title="Parent Detail">
        <div className="flex items-center justify-center min-h-[400px]">
          <BeatLoader color="#00e902" />
        </div>
      </ContentLayout>
    );
  }

  if (!canView) {
    return (
      <ContentLayout title="Parent Detail">
        <div className="text-center py-8">
          <p className="text-destructive">
            You don&apos;t have permission to view parent details.
          </p>
        </div>
      </ContentLayout>
    );
  }

  if (!record) {
    return (
      <ContentLayout title="Parent Detail">
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Parent Portal', href: '/parent-portal' },
            { label: 'Not Found' },
          ]}
        />
        <div className="text-center py-12">
          <Shield className="mx-auto h-12 w-12 mb-4 text-muted-foreground opacity-50" />
          <h2 className="text-xl font-semibold mb-2">Record Not Found</h2>
          <p className="text-muted-foreground mb-4">
            The parent access record you are looking for does not exist or has
            been deleted.
          </p>
          <Button asChild>
            <Link href="/parent-portal/access">Back to Access Management</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`Parent: ${record.parent_name}`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Parent Portal', href: '/parent-portal' },
          { label: 'Access Management', href: '/parent-portal/access' },
          { label: record.parent_name },
        ]}
      />
      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/parent-portal/access">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{record.parent_name}</h1>
              <Badge
                variant={record.is_active ? 'default' : 'destructive'}
              >
                {record.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {ACCESS_RELATIONSHIP_LABELS[record.relationship as AccessRelationship] ||
                record.relationship}{' '}
              - Created {formatDate(record.created_at)}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggle}
              disabled={toggleMutation.isPending}
            >
              {record.is_active ? (
                <>
                  <ToggleRight className="mr-2 h-4 w-4 text-green-600" />
                  Deactivate
                </>
              ) : (
                <>
                  <ToggleLeft className="mr-2 h-4 w-4" />
                  Activate
                </>
              )}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>

        {/* Detail Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Parent Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Parent Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Name
                  </p>
                  <p className="font-medium">{record.parent_name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Relationship
                  </p>
                  <Badge variant="outline">
                    {ACCESS_RELATIONSHIP_LABELS[record.relationship as AccessRelationship] ||
                      record.relationship}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    Email
                  </p>
                  <p>{record.parent_email || '--'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    Phone
                  </p>
                  <p>{record.parent_phone || '--'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Access Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                Access Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Access Code
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="bg-muted px-3 py-1.5 rounded text-sm font-mono font-bold">
                      {record.access_code}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleCopyCode(record.access_code)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={handleRegenerate}
                      disabled={regenerateMutation.isPending}
                      title="Regenerate code"
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${
                          regenerateMutation.isPending ? 'animate-spin' : ''
                        }`}
                      />
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Access Level
                  </p>
                  <Badge
                    variant={
                      record.access_level === 'interact'
                        ? 'default'
                        : 'secondary'
                    }
                    className="mt-1"
                  >
                    {ACCESS_LEVEL_LABELS[record.access_level as AccessLevel] ||
                      record.access_level}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Total Logins
                  </p>
                  <p className="text-lg font-bold">{record.login_count}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Last Login
                  </p>
                  <p className="text-sm">
                    {record.last_access
                      ? formatDate(record.last_access)
                      : 'Never'}
                  </p>
                </div>
              </div>

              {/* Notification Preferences */}
              <div className="border-t pt-4">
                <p className="text-sm font-medium text-muted-foreground mb-2">
                  Notification Preferences
                </p>
                <div className="flex gap-2">
                  <Badge
                    variant={
                      record.notification_preferences?.email
                        ? 'default'
                        : 'outline'
                    }
                    className="text-xs"
                  >
                    Email:{' '}
                    {record.notification_preferences?.email ? 'On' : 'Off'}
                  </Badge>
                  <Badge
                    variant={
                      record.notification_preferences?.sms
                        ? 'default'
                        : 'outline'
                    }
                    className="text-xs"
                  >
                    SMS:{' '}
                    {record.notification_preferences?.sms ? 'On' : 'Off'}
                  </Badge>
                  <Badge
                    variant={
                      record.notification_preferences?.push
                        ? 'default'
                        : 'outline'
                    }
                    className="text-xs"
                  >
                    Push:{' '}
                    {record.notification_preferences?.push ? 'On' : 'Off'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Communications Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Communications
                </CardTitle>
                <CardDescription>
                  Messages and announcements related to this parent
                </CardDescription>
              </div>
              <Button asChild size="sm">
                <Link href="/parent-portal/communications/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Send Message
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {commLoading ? (
              <div className="flex justify-center p-8">
                <BeatLoader color="#00e902" />
              </div>
            ) : communications.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="mx-auto h-10 w-10 mb-3 opacity-50" />
                <p className="text-sm">
                  No communications found for this parent.
                </p>
                <Button
                  asChild
                  className="mt-3"
                  size="sm"
                  variant="outline"
                >
                  <Link href="/parent-portal/communications/new">
                    Send First Message
                  </Link>
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {communications.map((comm: ParentCommunication) => (
                    <TableRow key={comm.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{comm.subject}</div>
                          <div className="text-xs text-muted-foreground line-clamp-1">
                            {comm.content}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {COMMUNICATION_TYPE_LABELS[comm.communication_type] || comm.communication_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          Normal
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {comm.read_at ? (
                          <Badge
                            variant="default"
                            className="bg-blue-100 text-blue-700"
                          >
                            Read
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Sent</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(comm.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Metadata */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Record Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Record ID</p>
                <p className="font-mono text-xs">{record.id}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Learner ID</p>
                <p className="font-mono text-xs">{record.learner_id}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Created</p>
                <p>{formatDate(record.created_at)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Updated</p>
                <p>{formatDate(record.updated_at)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
