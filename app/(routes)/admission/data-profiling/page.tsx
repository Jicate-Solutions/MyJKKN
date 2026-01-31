"use client";

import { useState } from "react";
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
  Calendar,
  TrendingUp,
  FileText,
  Activity,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { AdmissionErrorBoundary } from "@/components/admission";

// Mock data for data profiling
const dataQualityMetrics = {
  overall: 78,
  completeness: 82,
  accuracy: 75,
  consistency: 81,
  validity: 74,
  uniqueness: 89,
};

const fieldAnalysis = [
  { field: "full_name", completeness: 98, validity: 95, issues: 12, status: "good" },
  { field: "email", completeness: 85, validity: 78, issues: 234, status: "warning" },
  { field: "phone", completeness: 72, validity: 65, issues: 456, status: "critical" },
  { field: "address", completeness: 45, validity: 40, issues: 1234, status: "critical" },
  { field: "date_of_birth", completeness: 88, validity: 92, issues: 89, status: "good" },
  { field: "program_interest", completeness: 92, validity: 98, issues: 23, status: "good" },
  { field: "source", completeness: 67, validity: 85, issues: 345, status: "warning" },
  { field: "counselor_assigned", completeness: 78, validity: 100, issues: 0, status: "good" },
];

const dataIssues = [
  { type: "Invalid Phone", count: 456, severity: "critical", affectedRecords: "12.3%" },
  { type: "Missing Email", count: 234, severity: "warning", affectedRecords: "6.3%" },
  { type: "Incomplete Address", count: 1234, severity: "critical", affectedRecords: "33.2%" },
  { type: "Duplicate Entries", count: 189, severity: "warning", affectedRecords: "5.1%" },
  { type: "Invalid Source Code", count: 67, severity: "low", affectedRecords: "1.8%" },
  { type: "Missing Program Interest", count: 89, severity: "low", affectedRecords: "2.4%" },
];

const recentProfilingRuns = [
  { id: 1, date: "2026-01-16", records: 3712, issues: 2045, duration: "2m 34s", status: "completed" },
  { id: 2, date: "2026-01-15", records: 3698, issues: 2089, duration: "2m 28s", status: "completed" },
  { id: 3, date: "2026-01-14", records: 3654, issues: 2134, duration: "2m 31s", status: "completed" },
  { id: 4, date: "2026-01-13", records: 3621, issues: 2201, duration: "2m 45s", status: "completed" },
];

function DataProfilingPageContent() {
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [isExporting, setIsExporting] = useState(false);

  const handleRunProfiling = async () => {
    setIsRunning(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 3000));
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
      await new Promise((resolve) => setTimeout(resolve, 1500));
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

  return (
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
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleExportReport}
            disabled={isExporting}
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {isExporting ? "Exporting..." : "Export Report"}
          </Button>
          <Button
            onClick={handleRunProfiling}
            disabled={isRunning}
            className="gap-2 bg-[#0b6d41] hover:bg-[#095232]"
          >
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {isRunning ? "Running..." : "Run Profiling"}
          </Button>
        </div>
      </div>

      {/* Overall Quality Score */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <Card className="md:col-span-2 border-l-4 border-l-[#0b6d41]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Overall Data Quality</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-4">
              <span className="text-5xl font-bold text-[#0b6d41]">{dataQualityMetrics.overall}%</span>
              <div className="flex items-center text-green-600 text-sm mb-2">
                <TrendingUp className="h-4 w-4 mr-1" />
                +3% vs last week
              </div>
            </div>
            <Progress value={dataQualityMetrics.overall} className="mt-3 h-2" />
          </CardContent>
        </Card>

        {Object.entries(dataQualityMetrics)
          .filter(([key]) => key !== "overall")
          .map(([key, value]) => (
            <Card key={key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-gray-600 capitalize">
                  {key}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{value}%</div>
                <Progress
                  value={value}
                  className="mt-2 h-1.5"
                />
              </CardContent>
            </Card>
          ))}
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
          <TabsTrigger value="history" className="gap-2">
            <Activity className="h-4 w-4" />
            Profiling History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Field-Level Analysis</CardTitle>
              <CardDescription>
                Quality metrics for each data field in admission leads
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Field Name</TableHead>
                    <TableHead>Completeness</TableHead>
                    <TableHead>Validity</TableHead>
                    <TableHead>Issues Found</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fieldAnalysis.map((field) => (
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
                      <TableCell>
                        <Button variant="ghost" size="sm">
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
                <div className="text-3xl font-bold text-red-600">
                  {dataIssues.filter((i) => i.severity === "critical").reduce((sum, i) => sum + i.count, 0).toLocaleString()}
                </div>
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
                <div className="text-3xl font-bold text-yellow-600">
                  {dataIssues.filter((i) => i.severity === "warning").reduce((sum, i) => sum + i.count, 0).toLocaleString()}
                </div>
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
                <div className="text-3xl font-bold text-green-600">2,734</div>
                <p className="text-sm text-green-700">73.6% of total records</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Issue Breakdown</CardTitle>
              <CardDescription>Detailed list of data quality issues found</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Issue Type</TableHead>
                    <TableHead>Count</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Affected Records</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dataIssues.map((issue, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{issue.type}</TableCell>
                      <TableCell>{issue.count.toLocaleString()}</TableCell>
                      <TableCell>{getSeverityBadge(issue.severity)}</TableCell>
                      <TableCell>{issue.affectedRecords}</TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm">
                          Fix Now
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Profiling History</CardTitle>
              <CardDescription>Recent data profiling runs and their results</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Records Analyzed</TableHead>
                    <TableHead>Issues Found</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentProfilingRuns.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="font-medium">{run.date}</TableCell>
                      <TableCell>{run.records.toLocaleString()}</TableCell>
                      <TableCell>
                        <span className="text-red-600">{run.issues.toLocaleString()}</span>
                      </TableCell>
                      <TableCell>{run.duration}</TableCell>
                      <TableCell>
                        <Badge className="bg-green-100 text-green-800">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          {run.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
                <p className="text-2xl font-bold">3,712</p>
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
                <p className="text-sm text-gray-600">Invalid Phones</p>
                <p className="text-2xl font-bold">456</p>
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
                <p className="text-2xl font-bold">234</p>
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
                <p className="text-2xl font-bold">1,234</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function DataProfilingPage() {
  return (
    <AdmissionErrorBoundary>
      <DataProfilingPageContent />
    </AdmissionErrorBoundary>
  );
}
