'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, FileText, Building2, Loader2 } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { ReportGenerationForm } from './_components/report-generation-form';
import { ReportsList } from './_components/reports-list';

export default function AttendanceConsolidationPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string | null>(null);
  const { profile, isLoading: authLoading } = useAuth();
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess({
    isActive: true,
    autoFetch: !!profile
  });

  // Auto-select institution: prefer profile's institution, otherwise first available
  useEffect(() => {
    if (!selectedInstitutionId && !institutionsLoading) {
      if (profile?.institution_id) {
        setSelectedInstitutionId(profile.institution_id);
      } else if (institutions.length > 0) {
        setSelectedInstitutionId(institutions[0].id);
      }
    }
  }, [profile?.institution_id, institutions, institutionsLoading, selectedInstitutionId]);

  const isLoading = authLoading || institutionsLoading;
  const showInstitutionSelector = institutions.length > 1 || !profile?.institution_id;
  const selectedInstitution = institutions.find(i => i.id === selectedInstitutionId);

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

        <div className="space-y-6 mt-6">
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-8 text-center">
              <Loader2 className="h-12 w-12 text-muted-foreground mb-4 animate-spin" />
              <h3 className="text-lg font-semibold mb-2">Loading...</h3>
              <p className="text-sm text-muted-foreground">
                Please wait while we load your institutions.
              </p>
            </CardContent>
          </Card>
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
                You don't have access to any institutions. Please contact your administrator.
              </p>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  // No institution selected yet
  if (!selectedInstitutionId) {
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
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Select an Institution</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Please select an institution to access attendance consolidation reports.
              </p>
              <Select onValueChange={setSelectedInstitutionId}>
                <SelectTrigger className="w-[300px]">
                  <SelectValue placeholder="Select institution..." />
                </SelectTrigger>
                <SelectContent>
                  {institutions.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  const handleSuccess = () => {
    setShowCreateDialog(false);
  };

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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* Institution Selector - shown when user has access to multiple institutions */}
          {showInstitutionSelector && (
            <Select value={selectedInstitutionId} onValueChange={setSelectedInstitutionId}>
              <SelectTrigger className="w-full sm:w-[250px]">
                <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Select institution..." />
              </SelectTrigger>
              <SelectContent>
                {institutions.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Generate New Report
          </Button>
        </div>
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

      {/* Reports List */}
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All Reports</TabsTrigger>
          <TabsTrigger value="recent">Recent</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          <ReportsList institutionId={selectedInstitutionId} />
        </TabsContent>

        <TabsContent value="recent" className="space-y-4">
          <ReportsList institutionId={selectedInstitutionId} />
        </TabsContent>
      </Tabs>

      {/* Create Report Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generate Consolidation Report</DialogTitle>
            <DialogDescription>
              Configure and generate a new attendance consolidation report
            </DialogDescription>
          </DialogHeader>
          <ReportGenerationForm
            institutionId={selectedInstitutionId}
            onSuccess={handleSuccess}
          />
        </DialogContent>
      </Dialog>
      </div>
    </ContentLayout>
  );
}
