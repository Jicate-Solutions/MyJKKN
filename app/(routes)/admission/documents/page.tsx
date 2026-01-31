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
  FileText,
  Upload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Search,
  Filter,
  Eye,
  Download,
  RotateCcw,
  FileImage,
  FileCheck,
  Users,
  Calendar,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { AdmissionErrorBoundary } from "@/components/admission";

// Mock data for document management
const documentStats = {
  totalApplications: 1245,
  pendingVerification: 234,
  verified: 876,
  rejected: 45,
  incomplete: 90,
};

const documentTypes = [
  { id: "10th_marksheet", name: "10th Marksheet", required: true },
  { id: "12th_marksheet", name: "12th Marksheet", required: true },
  { id: "photo", name: "Passport Photo", required: true },
  { id: "id_proof", name: "ID Proof (Aadhar/PAN)", required: true },
  { id: "ug_degree", name: "UG Degree Certificate", required: false },
  { id: "transfer_cert", name: "Transfer Certificate", required: false },
  { id: "migration_cert", name: "Migration Certificate", required: false },
  { id: "income_cert", name: "Income Certificate", required: false },
];

const pendingDocuments = [
  {
    id: 1,
    applicant: "Rajesh Kumar",
    application_id: "ADM-2026-0001",
    document: "10th Marksheet",
    uploaded_at: "2026-01-15 10:30",
    file_type: "PDF",
    file_size: "1.2 MB",
    status: "pending",
  },
  {
    id: 2,
    applicant: "Priya Sharma",
    application_id: "ADM-2026-0002",
    document: "12th Marksheet",
    uploaded_at: "2026-01-15 11:45",
    file_type: "PDF",
    file_size: "2.1 MB",
    status: "pending",
  },
  {
    id: 3,
    applicant: "Amit Patel",
    application_id: "ADM-2026-0003",
    document: "Passport Photo",
    uploaded_at: "2026-01-15 09:15",
    file_type: "JPG",
    file_size: "450 KB",
    status: "pending",
  },
  {
    id: 4,
    applicant: "Sneha Reddy",
    application_id: "ADM-2026-0004",
    document: "ID Proof",
    uploaded_at: "2026-01-14 16:20",
    file_type: "PDF",
    file_size: "890 KB",
    status: "pending",
  },
  {
    id: 5,
    applicant: "Vikram Singh",
    application_id: "ADM-2026-0005",
    document: "UG Degree",
    uploaded_at: "2026-01-14 14:10",
    file_type: "PDF",
    file_size: "1.8 MB",
    status: "pending",
  },
];

const recentVerifications = [
  { id: 1, applicant: "Meera Iyer", document: "10th Marksheet", verified_by: "Admin", status: "approved", date: "2026-01-15" },
  { id: 2, applicant: "Karthik N", document: "Photo", verified_by: "Admin", status: "rejected", date: "2026-01-15", reason: "Photo not clear" },
  { id: 3, applicant: "Deepa M", document: "12th Marksheet", verified_by: "Admin", status: "approved", date: "2026-01-14" },
  { id: 4, applicant: "Ravi Kumar", document: "ID Proof", verified_by: "Admin", status: "approved", date: "2026-01-14" },
];

function DocumentsPageContent() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDocType, setFilterDocType] = useState("all");
  const [isExporting, setIsExporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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

  const handleSyncDocuments = async () => {
    setIsSyncing(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      toast.success("Documents synced successfully");
    } catch {
      toast.error("Failed to sync documents");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      toast.success("Configuration saved successfully");
    } catch {
      toast.error("Failed to save configuration");
    } finally {
      setIsSaving(false);
    }
  };

  const handleApproveDocument = (applicant: string) => {
    toast.success(`Document approved for ${applicant}`);
  };

  const handleRejectDocument = (applicant: string) => {
    toast.error(`Document rejected for ${applicant}`);
  };

  const handleRequestReupload = (applicant: string) => {
    toast.info(`Re-upload requested from ${applicant}`);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge className="bg-yellow-100 text-yellow-800">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      case "approved":
        return (
          <Badge className="bg-green-100 text-green-800">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Approved
          </Badge>
        );
      case "rejected":
        return (
          <Badge className="bg-red-100 text-red-800">
            <XCircle className="h-3 w-3 mr-1" />
            Rejected
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="h-8 w-8 text-[#0b6d41]" />
            Document Verification Portal
          </h1>
          <p className="text-gray-600 mt-1">
            Verify and manage applicant documents
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
            className="gap-2 bg-[#0b6d41] hover:bg-[#095232]"
            onClick={handleSyncDocuments}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {isSyncing ? "Syncing..." : "Sync Documents"}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600">Total Applications</p>
                <p className="text-xl font-bold">{documentStats.totalApplications.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-yellow-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600">Pending Verification</p>
                <p className="text-xl font-bold text-yellow-600">{documentStats.pendingVerification}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600">Verified</p>
                <p className="text-xl font-bold text-green-600">{documentStats.verified}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600">Rejected</p>
                <p className="text-xl font-bold text-red-600">{documentStats.rejected}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600">Incomplete</p>
                <p className="text-xl font-bold text-orange-600">{documentStats.incomplete}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending" className="gap-2">
            <Clock className="h-4 w-4" />
            Pending Verification ({documentStats.pendingVerification})
          </TabsTrigger>
          <TabsTrigger value="verified" className="gap-2">
            <FileCheck className="h-4 w-4" />
            Recent Verifications
          </TabsTrigger>
          <TabsTrigger value="requirements" className="gap-2">
            <FileText className="h-4 w-4" />
            Document Requirements
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-4 items-center">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search by name or application ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={filterDocType} onValueChange={setFilterDocType}>
                  <SelectTrigger className="w-[200px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Document type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Documents</SelectItem>
                    {documentTypes.map((doc) => (
                      <SelectItem key={doc.id} value={doc.id}>
                        {doc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Pending Documents Table */}
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Applicant</TableHead>
                    <TableHead>Application ID</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead>File Info</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingDocuments.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium">{doc.applicant}</TableCell>
                      <TableCell>
                        <code className="bg-gray-100 px-2 py-1 rounded text-sm">
                          {doc.application_id}
                        </code>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {doc.file_type === "PDF" ? (
                            <FileText className="h-4 w-4 text-red-500" />
                          ) : (
                            <FileImage className="h-4 w-4 text-blue-500" />
                          )}
                          {doc.document}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {doc.uploaded_at}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600">
                          {doc.file_type} • {doc.file_size}
                        </span>
                      </TableCell>
                      <TableCell>{getStatusBadge(doc.status)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" title="View document">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            title="Approve"
                            onClick={() => handleApproveDocument(doc.applicant)}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            title="Reject"
                            onClick={() => handleRejectDocument(doc.applicant)}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Request re-upload"
                            onClick={() => handleRequestReupload(doc.applicant)}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="verified" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Verification Activity</CardTitle>
              <CardDescription>Documents verified in the last 7 days</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Applicant</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>Verified By</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentVerifications.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-sm text-gray-600">{item.date}</TableCell>
                      <TableCell className="font-medium">{item.applicant}</TableCell>
                      <TableCell>{item.document}</TableCell>
                      <TableCell>{item.verified_by}</TableCell>
                      <TableCell>{getStatusBadge(item.status)}</TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {item.reason || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requirements" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Document Requirements</CardTitle>
              <CardDescription>
                Configure required documents for admission applications
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {documentTypes.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="font-medium">{doc.name}</p>
                        <p className="text-sm text-gray-600">
                          {doc.required ? "Required for all applications" : "Optional document"}
                        </p>
                      </div>
                    </div>
                    <Badge variant={doc.required ? "destructive" : "outline"}>
                      {doc.required ? "Required" : "Optional"}
                    </Badge>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex gap-2">
                <Button
                  className="bg-[#0b6d41] hover:bg-[#095232]"
                  onClick={handleSaveConfig}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  {isSaving ? "Saving..." : "Save Configuration"}
                </Button>
                <Button variant="outline">Add Document Type</Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Upload Guidelines</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="font-medium">File Size</p>
                  <p className="text-sm text-gray-600">Maximum 5 MB per document</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="font-medium">Supported Formats</p>
                  <p className="text-sm text-gray-600">PDF, JPG, PNG</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="font-medium">Image Quality</p>
                  <p className="text-sm text-gray-600">Minimum 300 DPI for scanned documents</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Verification SLA</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Target turnaround</span>
                  <span className="font-bold">24 hours</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Current average</span>
                  <span className="font-bold text-green-600">18 hours</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Within SLA</span>
                  <span className="font-bold text-green-600">94%</span>
                </div>
                <Progress value={94} className="mt-2 h-2" />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function DocumentsPage() {
  return (
    <AdmissionErrorBoundary>
      <DocumentsPageContent />
    </AdmissionErrorBoundary>
  );
}
