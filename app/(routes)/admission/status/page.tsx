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
  FileText,
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

// Mock data for application status tracking
const statusStats = {
  total: 1245,
  lead: 456,
  applied: 345,
  documentsUploaded: 234,
  underReview: 123,
  interviewed: 67,
  offered: 45,
  enrolled: 34,
};

const statusFlow = [
  { id: "lead", name: "Lead", count: 456, color: "bg-gray-200" },
  { id: "applied", name: "Applied", count: 345, color: "bg-blue-200" },
  { id: "documents", name: "Documents", count: 234, color: "bg-yellow-200" },
  { id: "review", name: "Under Review", count: 123, color: "bg-orange-200" },
  { id: "interview", name: "Interviewed", count: 67, color: "bg-purple-200" },
  { id: "offered", name: "Offered", count: 45, color: "bg-green-200" },
  { id: "enrolled", name: "Enrolled", count: 34, color: "bg-[#0b6d41] text-white" },
];

const applications = [
  {
    id: "ADM-2026-0001",
    name: "Rajesh Kumar",
    email: "rajesh@email.com",
    phone: "9876543210",
    program: "B.Tech Computer Science",
    status: "Under Review",
    stage: 4,
    lastActivity: "Document verification pending",
    updatedAt: "2026-01-15 14:30",
  },
  {
    id: "ADM-2026-0002",
    name: "Priya Sharma",
    email: "priya@email.com",
    phone: "8765432109",
    program: "MBA Finance",
    status: "Interviewed",
    stage: 5,
    lastActivity: "Interview completed",
    updatedAt: "2026-01-15 11:00",
  },
  {
    id: "ADM-2026-0003",
    name: "Amit Patel",
    email: "amit@email.com",
    phone: "7654321098",
    program: "B.Tech Mechanical",
    status: "Documents Submitted",
    stage: 3,
    lastActivity: "All documents uploaded",
    updatedAt: "2026-01-14 16:45",
  },
  {
    id: "ADM-2026-0004",
    name: "Sneha Reddy",
    email: "sneha@email.com",
    phone: "6543210987",
    program: "BBA",
    status: "Offered",
    stage: 6,
    lastActivity: "Offer letter sent",
    updatedAt: "2026-01-14 10:20",
  },
  {
    id: "ADM-2026-0005",
    name: "Vikram Singh",
    email: "vikram@email.com",
    phone: "5432109876",
    program: "B.Tech Electronics",
    status: "Applied",
    stage: 2,
    lastActivity: "Application submitted",
    updatedAt: "2026-01-13 09:15",
  },
];

const activityLog = [
  { time: "2026-01-15 14:30", applicant: "Rajesh Kumar", action: "Document uploaded", type: "document" },
  { time: "2026-01-15 11:00", applicant: "Priya Sharma", action: "Interview completed", type: "interview" },
  { time: "2026-01-15 10:45", applicant: "Amit Patel", action: "Status changed to Under Review", type: "status" },
  { time: "2026-01-14 16:45", applicant: "Sneha Reddy", action: "Offer letter generated", type: "offer" },
  { time: "2026-01-14 15:30", applicant: "Vikram Singh", action: "Application submitted", type: "application" },
];

function StatusPageContent() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterProgram, setFilterProgram] = useState("all");
  const [isExporting, setIsExporting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

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
    setIsRefreshing(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      toast.success("Data refreshed successfully");
    } catch {
      toast.error("Failed to refresh");
    } finally {
      setIsRefreshing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Lead":
        return <Badge variant="outline">Lead</Badge>;
      case "Applied":
        return <Badge className="bg-blue-100 text-blue-800">Applied</Badge>;
      case "Documents Submitted":
        return <Badge className="bg-yellow-100 text-yellow-800">Documents Submitted</Badge>;
      case "Under Review":
        return <Badge className="bg-orange-100 text-orange-800">Under Review</Badge>;
      case "Interviewed":
        return <Badge className="bg-purple-100 text-purple-800">Interviewed</Badge>;
      case "Offered":
        return <Badge className="bg-green-100 text-green-800">Offered</Badge>;
      case "Enrolled":
        return <Badge className="bg-[#0b6d41] text-white">Enrolled</Badge>;
      case "Rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "document":
        return <FileText className="h-4 w-4 text-blue-500" />;
      case "interview":
        return <Users className="h-4 w-4 text-purple-500" />;
      case "status":
        return <Activity className="h-4 w-4 text-orange-500" />;
      case "offer":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "application":
        return <GraduationCap className="h-4 w-4 text-blue-500" />;
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
                    {((stage.count / statusStats.total) * 100).toFixed(1)}%
                  </p>
                </div>
                {index < statusFlow.length - 1 && (
                  <ArrowRight className="h-5 w-5 text-gray-300 mx-2" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <Tabs defaultValue="applications">
        <TabsList>
          <TabsTrigger value="applications" className="gap-2">
            <Users className="h-4 w-4" />
            All Applications ({statusStats.total})
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
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="applied">Applied</SelectItem>
                    <SelectItem value="documents">Documents Submitted</SelectItem>
                    <SelectItem value="review">Under Review</SelectItem>
                    <SelectItem value="interviewed">Interviewed</SelectItem>
                    <SelectItem value="offered">Offered</SelectItem>
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
                  {applications.map((app) => (
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
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {app.email}
                            </span>
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {app.phone}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building className="h-4 w-4 text-gray-400" />
                          {app.program}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="w-32">
                          <Progress value={(app.stage / 7) * 100} className="h-2" />
                          <p className="text-xs text-gray-500 mt-1">Stage {app.stage} of 7</p>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(app.status)}</TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm">{app.lastActivity}</p>
                          <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                            <Calendar className="h-3 w-3" />
                            {app.updatedAt}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="gap-1">
                          <Eye className="h-4 w-4" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
              <div className="space-y-4">
                {activityLog.map((log, index) => (
                  <div key={index} className="flex items-start gap-4 p-3 border rounded-lg">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      {getActivityIcon(log.type)}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{log.action}</p>
                      <p className="text-sm text-gray-600">{log.applicant}</p>
                    </div>
                    <p className="text-sm text-gray-500">{log.time}</p>
                  </div>
                ))}
              </div>
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
                <p className="text-3xl font-bold text-red-600">78</p>
                <p className="text-gray-600">Applications pending &gt; 48 hours</p>
                <div className="mt-4">
                  <Progress value={78} className="h-2 bg-red-100" />
                  <p className="text-sm text-gray-500 mt-2">33% of pending documents</p>
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
                  Interview Scheduling Backlog
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-orange-600">45</p>
                <p className="text-gray-600">Applications awaiting interview slot</p>
                <div className="mt-4">
                  <Progress value={45} className="h-2 bg-orange-100" />
                  <p className="text-sm text-gray-500 mt-2">37% of reviewed applications</p>
                </div>
                <Button variant="outline" className="mt-4 w-full">
                  Schedule Interviews
                </Button>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-yellow-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-yellow-500" />
                  Incomplete Applications
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-yellow-600">123</p>
                <p className="text-gray-600">Applications with missing documents</p>
                <div className="mt-4">
                  <Progress value={35} className="h-2 bg-yellow-100" />
                  <p className="text-sm text-gray-500 mt-2">35% of total applications</p>
                </div>
                <Button variant="outline" className="mt-4 w-full">
                  Send Reminders
                </Button>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-purple-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-purple-500" />
                  Offer Acceptance Pending
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-purple-600">28</p>
                <p className="text-gray-600">Offers not yet accepted</p>
                <div className="mt-4">
                  <Progress value={62} className="h-2 bg-purple-100" />
                  <p className="text-sm text-gray-500 mt-2">62% of offers sent</p>
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
