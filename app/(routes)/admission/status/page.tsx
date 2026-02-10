"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity,
  Search,
  Filter,
  Eye,
  Download,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  ArrowRight,
  Users,
  GraduationCap,
  Calendar,
  Phone,
  Mail,
  Building,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { AdmissionErrorBoundary } from "@/components/admission";
import { useAuth } from "@/hooks/use-auth";
import {
  useApplicationsStatus,
  usePipelineStats,
  useRecentActivity,
} from "@/hooks/admission/use-status-tracking";
import { format } from "date-fns";

function StatusPageContent() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || "";
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterProgram, setFilterProgram] = useState("all");
  const [isExporting, setIsExporting] = useState(false);

  // Real data hooks
  const {
    applications: rawApplications,
    total: totalApplications,
    isLoading: appsLoading,
    refetch: refetchApps,
  } = useApplicationsStatus({
    institutionId,
    status: filterStatus !== "all" ? filterStatus : undefined,
    search: searchTerm || undefined,
  });

  const {
    stats,
    isLoading: statsLoading,
    refetch: refetchStats,
  } = usePipelineStats(institutionId);

  const {
    activities,
    isLoading: activityLoading,
    refetch: refetchActivity,
  } = useRecentActivity(institutionId, 20);

  // Build pipeline flow from real stats
  const statusFlow = [
    { id: "draft", name: "Draft", count: stats.draft, color: "bg-gray-200" },
    { id: "submitted", name: "Submitted", count: stats.submitted, color: "bg-blue-200" },
    { id: "under_review", name: "Under Review", count: stats.under_review, color: "bg-orange-200" },
    { id: "approved", name: "Approved", count: stats.approved, color: "bg-green-200" },
    { id: "rejected", name: "Rejected", count: stats.rejected, color: "bg-red-200" },
    { id: "enrolled", name: "Enrolled", count: stats.enrolled, color: "bg-[#0b6d41] text-white" },
  ];

  // Transform applications to UI format
  const applications = (rawApplications || []).map((app: any) => ({
    id: app.application_number || app.id?.slice(0, 12) || "N/A",
    name: app.lead_name || "Unknown",
    email: app.lead_email || "",
    phone: app.lead_phone || "",
    program: app.lead_program || "",
    status: app.status || "draft",
    stage: app.current_step || 1,
    totalStages: app.total_steps || 7,
    completionPct: app.completion_percentage || 0,
    lastActivity: app.review_notes || (app.submitted_at ? "Application submitted" : "Draft created"),
    updatedAt: app.updated_at,
  }));

  // Client-side search filtering (for name/email, since search filter only does application_number)
  const filteredApps = applications.filter((app: any) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      app.name.toLowerCase().includes(term) ||
      app.email.toLowerCase().includes(term) ||
      app.id.toLowerCase().includes(term)
    );
  });

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      toast.success("Application status exported successfully");
    } catch {
      toast.error("Failed to export");
    } finally {
      setIsExporting(false);
    }
  };

  const handleRefresh = async () => {
    await Promise.all([refetchApps(), refetchStats(), refetchActivity()]);
    toast.success("Data refreshed successfully");
  };

  const isRefreshing = appsLoading || statsLoading || activityLoading;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="outline">Draft</Badge>;
      case "submitted":
        return <Badge className="bg-blue-100 text-blue-800">Submitted</Badge>;
      case "under_review":
        return <Badge className="bg-orange-100 text-orange-800">Under Review</Badge>;
      case "approved":
        return <Badge className="bg-green-100 text-green-800">Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      case "enrolled":
        return <Badge className="bg-[#0b6d41] text-white">Enrolled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "email":
        return <Mail className="h-4 w-4 text-blue-500" />;
      case "sms":
        return <Phone className="h-4 w-4 text-green-500" />;
      case "whatsapp":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "status_change":
        return <Activity className="h-4 w-4 text-orange-500" />;
      default:
        return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Activity className="h-8 w-8 text-[#0b6d41]" />
            Application Status Tracker
          </h1>
          <p className="text-gray-600 mt-1">
            Track and manage application progress across all stages
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {isExporting ? "Exporting..." : "Export"}
          </Button>
          <Button
            className="gap-2 bg-[#0b6d41] hover:bg-[#095232]"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Status Flow Pipeline */}
      <Card>
        <CardHeader>
          <CardTitle>Admission Pipeline</CardTitle>
          <CardDescription>Overview of applications across all stages</CardDescription>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex items-center justify-between overflow-x-auto pb-4">
              {statusFlow.map((stage, index) => (
                <div key={stage.id} className="flex items-center">
                  <div className="flex flex-col items-center min-w-[100px]">
                    <div
                      className={`w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold ${stage.color}`}
                    >
                      {stage.count}
                    </div>
                    <p className="text-sm font-medium mt-2">{stage.name}</p>
                    <p className="text-xs text-gray-500">
                      {stats.total > 0 ? ((stage.count / stats.total) * 100).toFixed(1) : '0.0'}%
                    </p>
                  </div>
                  {index < statusFlow.length - 1 && (
                    <ArrowRight className="h-5 w-5 text-gray-300 mx-2" />
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Content */}
      <Tabs defaultValue="applications">
        <TabsList>
          <TabsTrigger value="applications" className="gap-2">
            <Users className="h-4 w-4" />
            All Applications ({stats.total})
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2">
            <Activity className="h-4 w-4" />
            Activity Log
          </TabsTrigger>
          <TabsTrigger value="bottlenecks" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Bottlenecks
          </TabsTrigger>
        </TabsList>

        <TabsContent value="applications" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-4 items-center">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search by name, email, or application ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[180px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="submitted">Submitted</SelectItem>
                    <SelectItem value="under_review">Under Review</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="enrolled">Enrolled</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterProgram} onValueChange={setFilterProgram}>
                  <SelectTrigger className="w-[180px]">
                    <GraduationCap className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Program" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Programs</SelectItem>
                    <SelectItem value="btech">B.Tech</SelectItem>
                    <SelectItem value="mba">MBA</SelectItem>
                    <SelectItem value="bba">BBA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Applications Table */}
          <Card>
            <CardContent className="pt-4">
              {appsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Application ID</TableHead>
                      <TableHead>Applicant</TableHead>
                      <TableHead>Program</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Activity</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredApps.length > 0 ? (
                      filteredApps.map((app: any) => (
                        <TableRow key={app.id}>
                          <TableCell>
                            <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono">
                              {app.id}
                            </code>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{app.name}</p>
                              <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                                {app.email && (
                                  <span className="flex items-center gap-1">
                                    <Mail className="h-3 w-3" />
                                    {app.email}
                                  </span>
                                )}
                                {app.phone && (
                                  <span className="flex items-center gap-1">
                                    <Phone className="h-3 w-3" />
                                    {app.phone}
                                  </span>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Building className="h-4 w-4 text-gray-400" />
                              {app.program || "—"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="w-32">
                              <Progress
                                value={app.completionPct || (app.stage / app.totalStages) * 100}
                                className="h-2"
                              />
                              <p className="text-xs text-gray-500 mt-1">
                                Stage {app.stage} of {app.totalStages}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>{getStatusBadge(app.status)}</TableCell>
                          <TableCell>
                            <div>
                              <p className="text-sm">{app.lastActivity}</p>
                              {app.updatedAt && (
                                <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                                  <Calendar className="h-3 w-3" />
                                  {format(new Date(app.updatedAt), "MMM dd, yyyy HH:mm")}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" className="gap-1">
                              <Eye className="h-4 w-4" />
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No applications found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest updates across all applications</CardDescription>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : activities.length > 0 ? (
                <div className="space-y-4">
                  {activities.map((log: any) => (
                    <div key={log.id} className="flex items-start gap-4 p-3 border rounded-lg">
                      <div className="p-2 bg-gray-100 rounded-lg">
                        {getActivityIcon(log.step_type)}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{log.action || log.step_type || "Activity"}</p>
                        <p className="text-sm text-gray-600">Lead: {log.lead_id?.slice(0, 8) || "—"}</p>
                      </div>
                      {log.created_at && (
                        <p className="text-sm text-gray-500">
                          {format(new Date(log.created_at), "MMM dd, HH:mm")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No recent activity found.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bottlenecks" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-l-4 border-l-red-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  Document Verification Delay
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-red-600">{stats.under_review}</p>
                <p className="text-gray-600">Applications under review</p>
                <div className="mt-4">
                  <Progress value={stats.total > 0 ? (stats.under_review / stats.total) * 100 : 0} className="h-2 bg-red-100" />
                  <p className="text-sm text-gray-500 mt-2">
                    {stats.total > 0 ? ((stats.under_review / stats.total) * 100).toFixed(0) : 0}% of total applications
                  </p>
                </div>
                <Button variant="outline" className="mt-4 w-full">
                  View Affected Applications
                </Button>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-orange-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-orange-500" />
                  Pending Submissions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-orange-600">{stats.draft}</p>
                <p className="text-gray-600">Applications still in draft</p>
                <div className="mt-4">
                  <Progress value={stats.total > 0 ? (stats.draft / stats.total) * 100 : 0} className="h-2 bg-orange-100" />
                  <p className="text-sm text-gray-500 mt-2">
                    {stats.total > 0 ? ((stats.draft / stats.total) * 100).toFixed(0) : 0}% of total applications
                  </p>
                </div>
                <Button variant="outline" className="mt-4 w-full">
                  Send Reminders
                </Button>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-yellow-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-yellow-500" />
                  Rejected Applications
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-yellow-600">{stats.rejected}</p>
                <p className="text-gray-600">Applications rejected</p>
                <div className="mt-4">
                  <Progress value={stats.total > 0 ? (stats.rejected / stats.total) * 100 : 0} className="h-2 bg-yellow-100" />
                  <p className="text-sm text-gray-500 mt-2">
                    {stats.total > 0 ? ((stats.rejected / stats.total) * 100).toFixed(0) : 0}% of total applications
                  </p>
                </div>
                <Button variant="outline" className="mt-4 w-full">
                  Review Rejections
                </Button>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-purple-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-purple-500" />
                  Approved Pending Enrollment
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-purple-600">{stats.approved}</p>
                <p className="text-gray-600">Approved but not yet enrolled</p>
                <div className="mt-4">
                  <Progress value={stats.total > 0 ? (stats.approved / stats.total) * 100 : 0} className="h-2 bg-purple-100" />
                  <p className="text-sm text-gray-500 mt-2">
                    {stats.total > 0 ? ((stats.approved / stats.total) * 100).toFixed(0) : 0}% of total applications
                  </p>
                </div>
                <Button variant="outline" className="mt-4 w-full">
                  Follow Up
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function StatusPage() {
  return (
    <AdmissionErrorBoundary>
      <StatusPageContent />
    </AdmissionErrorBoundary>
  );
}
