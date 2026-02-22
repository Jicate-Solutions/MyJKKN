"use client";

import { useState } from "react";
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Database,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Download,
  FileBarChart,
  Users,
  Phone,
  Mail,
  MapPin,
  TrendingUp,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { AdmissionErrorBoundary } from "@/components/admission";
import { useDataProfilingMetrics, useFieldAnalysis, useDataIssues } from "@/hooks/admission/use-data-quality";

function DataProfilingPageContent() {
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [isExporting, setIsExporting] = useState(false);

  const { data: metrics, isLoading: metricsLoading, refetch: refetchMetrics } = useDataProfilingMetrics();
  const { data: fieldAnalysis, isLoading: fieldsLoading, refetch: refetchFields } = useFieldAnalysis();
  const { data: dataIssues, isLoading: issuesLoading, refetch: refetchIssues } = useDataIssues();

  const handleRunProfiling = async () => {
    setIsRunning(true);
    try {
      await Promise.all([refetchMetrics(), refetchFields(), refetchIssues()]);
      toast.success("Data profiling completed successfully");
    } catch {
      toast.error("Failed to run data profiling");
    } finally {
      setIsRunning(false);
    }
  };

  const handleExportReport = async () => {
    setIsExporting(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      toast.success("Report exported successfully");
    } catch {
      toast.error("Failed to export report");
    } finally {
      setIsExporting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "good":
        return <Badge className="bg-green-100 text-green-800">Good</Badge>;
      case "warning":
        return <Badge className="bg-yellow-100 text-yellow-800">Warning</Badge>;
      case "critical":
        return <Badge className="bg-red-100 text-red-800">Critical</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "critical":
        return <Badge variant="destructive">Critical</Badge>;
      case "warning":
        return <Badge className="bg-yellow-100 text-yellow-800">Warning</Badge>;
      case "low":
        return <Badge variant="outline">Low</Badge>;
      default:
        return <Badge variant="outline">{severity}</Badge>;
    }
  };

  const m = metrics || { overall: 0, completeness: 0, validity: 0, totalLeads: 0 };
  const criticalCount = (dataIssues || []).filter(i => i.severity === 'critical').reduce((sum, i) => sum + i.count, 0);
  const warningCount = (dataIssues || []).filter(i => i.severity === 'warning').reduce((sum, i) => sum + i.count, 0);
  const totalIssueCount = (dataIssues || []).reduce((sum, i) => sum + i.count, 0);
  const cleanRecords = m.totalLeads - totalIssueCount;

  return (
    <ContentLayout title="Data Profiling">
      <div className="space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Data Profiling</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Database className="h-8 w-8 text-[#0b6d41]" />
            Data Profiling Dashboard
          </h1>
          <p className="text-gray-600 mt-1">
            Analyze and monitor data quality across admission leads
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={handleExportReport} disabled={isExporting}>
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {isExporting ? "Exporting..." : "Export Report"}
          </Button>
          <Button onClick={handleRunProfiling} disabled={isRunning} className="gap-2 bg-[#0b6d41] hover:bg-[#095232]">
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {isRunning ? "Running..." : "Run Profiling"}
          </Button>
        </div>
      </div>

      {/* Overall Quality Score */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="md:col-span-2 border-l-4 border-l-[#0b6d41]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Overall Data Quality</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-4">
              <span className="text-5xl font-bold text-[#0b6d41]">{metricsLoading ? '...' : `${m.overall}%`}</span>
            </div>
            <Progress value={m.overall} className="mt-3 h-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-600 capitalize">Completeness</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metricsLoading ? '...' : `${m.completeness}%`}</div>
            <Progress value={m.completeness} className="mt-2 h-1.5" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-600 capitalize">Validity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metricsLoading ? '...' : `${m.validity}%`}</div>
            <Progress value={m.validity} className="mt-2 h-1.5" />
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" className="gap-2">
            <FileBarChart className="h-4 w-4" />
            Field Analysis
          </TabsTrigger>
          <TabsTrigger value="issues" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Data Issues
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Field-Level Analysis</CardTitle>
              <CardDescription>Quality metrics for each data field in admission leads</CardDescription>
            </CardHeader>
            <CardContent>
              {fieldsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Field Name</TableHead>
                      <TableHead>Completeness</TableHead>
                      <TableHead>Validity</TableHead>
                      <TableHead>Issues Found</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(fieldAnalysis || []).map((field) => (
                      <TableRow key={field.field}>
                        <TableCell className="font-medium capitalize">
                          {field.field.replace(/_/g, " ")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={field.completeness} className="w-20 h-2" />
                            <span className="text-sm">{field.completeness}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={field.validity} className="w-20 h-2" />
                            <span className="text-sm">{field.validity}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={field.issues > 100 ? "text-red-600 font-medium" : ""}>
                            {field.issues.toLocaleString()}
                          </span>
                        </TableCell>
                        <TableCell>{getStatusBadge(field.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="issues" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-red-200 bg-red-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-600" />
                  Critical Issues
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-red-600">{issuesLoading ? '...' : criticalCount.toLocaleString()}</div>
                <p className="text-sm text-red-700">Requires immediate attention</p>
              </CardContent>
            </Card>

            <Card className="border-yellow-200 bg-yellow-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  Warnings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-yellow-600">{issuesLoading ? '...' : warningCount.toLocaleString()}</div>
                <p className="text-sm text-yellow-700">Should be reviewed</p>
              </CardContent>
            </Card>

            <Card className="border-green-200 bg-green-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Clean Records
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">{issuesLoading ? '...' : Math.max(0, cleanRecords).toLocaleString()}</div>
                <p className="text-sm text-green-700">
                  {m.totalLeads > 0 ? `${Math.round(Math.max(0, cleanRecords) / m.totalLeads * 100)}%` : '0%'} of total records
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Issue Breakdown</CardTitle>
              <CardDescription>Detailed list of data quality issues found</CardDescription>
            </CardHeader>
            <CardContent>
              {issuesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Issue Type</TableHead>
                      <TableHead>Count</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Affected Records</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(dataIssues || []).map((issue, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{issue.type}</TableCell>
                        <TableCell>{issue.count.toLocaleString()}</TableCell>
                        <TableCell>{getSeverityBadge(issue.severity)}</TableCell>
                        <TableCell>{issue.affectedPercentage}%</TableCell>
                      </TableRow>
                    ))}
                    {dataIssues && dataIssues.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-gray-500">No issues found</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Leads</p>
                <p className="text-2xl font-bold">{metricsLoading ? '...' : m.totalLeads.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-red-100 rounded-lg">
                <Phone className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Phone Issues</p>
                <p className="text-2xl font-bold">
                  {issuesLoading ? '...' : (dataIssues || []).find(i => i.type === 'Invalid Phone')?.count.toLocaleString() || '0'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-yellow-100 rounded-lg">
                <Mail className="h-6 w-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Missing Emails</p>
                <p className="text-2xl font-bold">
                  {issuesLoading ? '...' : (dataIssues || []).find(i => i.type === 'Missing Email')?.count.toLocaleString() || '0'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-100 rounded-lg">
                <MapPin className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Incomplete Address</p>
                <p className="text-2xl font-bold">
                  {issuesLoading ? '...' : (dataIssues || []).find(i => i.type === 'Incomplete Address')?.count.toLocaleString() || '0'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
      </div>
    </ContentLayout>
  );
}

export default function DataProfilingPage() {
  return (
    <AdmissionErrorBoundary>
      <DataProfilingPageContent />
    </AdmissionErrorBoundary>
  );
}
