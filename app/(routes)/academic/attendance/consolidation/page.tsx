'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { ContentLayout } from '@/components/layout/content-layout';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { ReportGenerationForm } from './_components/report-generation-form';
import { ReportsDataTable } from './_components/reports-data-table';

export default function AttendanceConsolidationPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const { profile, isLoading: authLoading } = useAuth();
  const { isSuperAdmin } = usePermissions([], { waitForLoad: false });
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess({
    isActive: true,
    autoFetch: !!profile
  });

  // Auto-select institution based on role
  useEffect(() => {
    if (!selectedInstitutionId && !institutionsLoading && profile) {
      if (!isSuperAdmin && profile?.institution_id) {
        // Non-super admin: auto-select their institution
        setSelectedInstitutionId(profile.institution_id);
      } else if (isSuperAdmin) {
        // Super admin: can select "All Institutions" or specific one
        // Start with null to show all institutions
        setSelectedInstitutionId(null);
      } else if (!isSuperAdmin && institutions.length > 0 && !profile.institution_id) {
        // User without institution_id but has access to institutions
        setSelectedInstitutionId(institutions[0].id);
      }
    }
  }, [profile, institutions, institutionsLoading, selectedInstitutionId, isSuperAdmin]);

  const isLoading = authLoading || institutionsLoading;

  // Only super admin can see institution selector
  const showInstitutionSelector = isSuperAdmin && institutions.length > 0;

  // Loading state
  if (isLoading) {
    return (
      <ContentLayout title="Attendance Consolidation">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/">Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/academic/attendance">Attendance</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Consolidation</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="mt-6">
          <LoadingSkeleton />
        </div>
      </ContentLayout>
    );
  }

  // No institutions available
  if (institutions.length === 0) {
    return (
      <ContentLayout title="Attendance Consolidation">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/">Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/academic/attendance">Attendance</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Consolidation</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="space-y-6 mt-6">
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-8 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Institution Access</h3>
              <p className="text-sm text-muted-foreground">
                You do not have access to any institutions. Please contact your administrator.
              </p>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  const handleSuccess = () => {
    setShowCreateDialog(false);
    // Trigger data table refresh to show the newly created report
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleCreateClick = () => {
    // Validate that we have a valid institution ID
    const institutionId = selectedInstitutionId || profile?.institution_id;

    if (!institutionId) {
      toast.error('Please select an institution before creating a report');
      return;
    }

    setShowCreateDialog(true);
  };

  // Get current institution name for display
  const currentInstitutionName = selectedInstitutionId
    ? institutions.find((i) => i.id === selectedInstitutionId)?.name
    : 'All Institutions';

  return (
    <ContentLayout title="Attendance Consolidation">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/academic/attendance">Attendance</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Consolidation</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 mt-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Attendance Consolidation Reports</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Generate and view institution-wide attendance consolidation reports
            </p>
          </div>
          {/* Institution Selector - Only visible to super admin */}
          {showInstitutionSelector && (
            <Select
              value={selectedInstitutionId || 'all'}
              onValueChange={(value) => setSelectedInstitutionId(value === 'all' ? null : value)}
            >
              <SelectTrigger className="w-full sm:w-[280px]">
                <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Select institution..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Institutions</SelectItem>
                {institutions.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">About Consolidation Reports</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Consolidation reports provide comprehensive attendance statistics across your institution.
              You can generate reports grouped by program, semester, section, or individual students.
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Select custom date ranges for analysis</li>
              <li>Group data by program, semester, section, or student</li>
              <li>Export reports in PDF, Excel, or CSV formats</li>
              <li>Include detailed absent dates and period-wise breakdowns</li>
              <li>Apply filters for specific programs, semesters, or sections</li>
            </ul>
          </CardContent>
        </Card>

        {/* Reports Data Table */}
        <ReportsDataTable
          institutionId={selectedInstitutionId}
          onCreateClick={handleCreateClick}
          refreshTrigger={refreshTrigger}
        />

        {/* Create Report Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Generate Consolidation Report</DialogTitle>
              <DialogDescription>
                Configure and generate a new attendance consolidation report
                {!isSuperAdmin && selectedInstitutionId && (
                  <span className="block mt-1 text-xs">
                    Report will be generated for: <strong>{currentInstitutionName}</strong>
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            <ReportGenerationForm
              institutionId={selectedInstitutionId || profile?.institution_id!}
              onSuccess={handleSuccess}
            />
          </DialogContent>
        </Dialog>
      </div>
    </ContentLayout>
  );
}
