'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, FileText } from 'lucide-react';

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { ReportGenerationForm } from './_components/report-generation-form';
import { ReportsList } from './_components/reports-list';

export default function AttendanceConsolidationPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const { profile } = useAuth();
  const institutionId = profile?.institution_id;

  if (!institutionId) {
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
              <h3 className="text-lg font-semibold mb-2">No Institution Selected</h3>
              <p className="text-sm text-muted-foreground">
                Please select an institution to access attendance consolidation reports.
              </p>
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold py-1">Attendance Consolidation Reports</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Generate and view institution-wide attendance consolidation reports
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Generate New Report
        </Button>
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
          <ReportsList institutionId={institutionId} />
        </TabsContent>

        <TabsContent value="recent" className="space-y-4">
          <ReportsList institutionId={institutionId} />
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
            institutionId={institutionId}
            onSuccess={handleSuccess}
          />
        </DialogContent>
      </Dialog>
      </div>
    </ContentLayout>
  );
}
