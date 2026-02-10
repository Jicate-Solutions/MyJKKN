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
import {
  useDocumentTypes,
  useDocumentStats,
  usePendingDocuments,
  useRecentVerifications,
  useUpdateDocumentVerification,
} from "@/hooks/admission/use-data-quality";

function DocumentsPageContent() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDocType, setFilterDocType] = useState("all");
  const [isExporting, setIsExporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const { data: docTypes, isLoading: typesLoading } = useDocumentTypes();
  const { data: docStats, isLoading: statsLoading } = useDocumentStats();
  const { data: pendingDocs, isLoading: pendingLoading } = usePendingDocuments();
  const { data: recentVer, isLoading: verLoading } = useRecentVerifications();
  const updateVerification = useUpdateDocumentVerification();

  const documentTypes = docTypes || [];
  const stats = docStats || { totalDocuments: 0, pendingVerification: 0, verified: 0, rejected: 0, incomplete: 0 };
  const pendingDocuments = pendingDocs || [];
  const recentVerifications = recentVer || [];

  const isLoading = typesLoading || statsLoading || pendingLoading || verLoading;

  const handleExportReport = () => {
    const allDocs = [...pendingDocuments, ...recentVerifications];
    if (!allDocs.length) { toast.info('No documents to export'); return; }
    setIsExporting(true);
    try {
      const headers = ['Document Type','Application ID','File Name','Status','Uploaded','Rejection Reason'];
      const rows = allDocs.map(d => [
        d.document_type_name, d.application_id || '', d.file_name || '',
        d.verification_status || 'pending', d.uploaded_at ? new Date(d.uploaded_at).toLocaleDateString() : '',
        d.rejection_reason || '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `documents-report-${new Date().toISOString().slice(0,10)}.csv`; a.click();
      URL.revokeObjectURL(url);
      toast.success("Report exported successfully");
    } catch {
      toast.error("Failed to export report");
    } finally {
      setIsExporting(false);
    }
  };

  const handleSyncDocuments = () => {
    setIsSyncing(true);
    // Refetch all document data
    Promise.all([
      // useQueryClient would be needed to invalidate; for now trigger reloads by toggling state
    ]).finally(() => {
      setIsSyncing(false);
      toast.success("Documents synced successfully");
      window.location.reload();
    });
  };

  const handleApproveDocument = async (docId: string, docName: string) => {
    try {
      await updateVerification.mutateAsync({ docId, status: 'verified' });
      toast.success(`Document approved: ${docName}`);
    } catch {
      toast.error(`Failed to approve: ${docName}`);
    }
  };

  const handleRejectDocument = async (docId: string, docName: string) => {
    try {
      await updateVerification.mutateAsync({ docId, status: 'rejected', rejectionReason: 'Rejected by reviewer' });
      toast.error(`Document rejected: ${docName}`);
    } catch {
      toast.error(`Failed to reject: ${docName}`);
    }
  };

  const handleRequestReupload = async (docId: string, docName: string) => {
    try {
      await updateVerification.mutateAsync({ docId, status: 'pending', rejectionReason: 'Re-upload requested' });
      toast.info(`Re-upload requested for: ${docName}`);
    } catch {
      toast.error(`Failed to request re-upload: ${docName}`);
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "pending":
        return (
          <Badge className="bg-yellow-100 text-yellow-800">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      case "verified":
        return (
          <Badge className="bg-green-100 text-green-800">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Verified
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
        return (
          <Badge className="bg-yellow-100 text-yellow-800">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
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
                <p className="text-xs text-gray-600">Total Documents</p>
                <p className="text-xl font-bold">
                  {statsLoading ? '...' : stats.totalDocuments.toLocaleString()}
                </p>
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
                <p className="text-xl font-bold text-yellow-600">
                  {statsLoading ? '...' : stats.pendingVerification}
                </p>
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
                <p className="text-xl font-bold text-green-600">
                  {statsLoading ? '...' : stats.verified}
                </p>
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
                <p className="text-xl font-bold text-red-600">
                  {statsLoading ? '...' : stats.rejected}
                </p>
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
                <p className="text-xl font-bold text-orange-600">
                  {statsLoading ? '...' : stats.incomplete}
                </p>
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
            Pending Verification ({statsLoading ? '...' : stats.pendingVerification})
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
                    placeholder="Search by file name or application ID..."
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
                      <SelectItem key={doc.id} value={doc.code}>
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
              {pendingLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document Type</TableHead>
                      <TableHead>Application ID</TableHead>
                      <TableHead>File Name</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead>File Info</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingDocuments
                      .filter(doc => {
                        const matchesSearch = !searchTerm ||
                          (doc.file_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (doc.application_id || '').toLowerCase().includes(searchTerm.toLowerCase());
                        const matchesType = filterDocType === 'all' || doc.document_type_code === filterDocType;
                        return matchesSearch && matchesType;
                      })
                      .map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {(doc.mime_type || '').includes('pdf') ? (
                              <FileText className="h-4 w-4 text-red-500" />
                            ) : (
                              <FileImage className="h-4 w-4 text-blue-500" />
                            )}
                            {doc.document_type_name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <code className="bg-gray-100 px-2 py-1 rounded text-sm">
                            {doc.application_id || 'N/A'}
                          </code>
                        </TableCell>
                        <TableCell className="text-sm">{doc.file_name || 'Unknown'}</TableCell>
                        <TableCell className="text-sm text-gray-600">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : 'N/A'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-gray-600">
                            {(doc.mime_type || '').split('/').pop()?.toUpperCase() || 'N/A'} - {formatFileSize(doc.file_size)}
                          </span>
                        </TableCell>
                        <TableCell>{getStatusBadge(doc.verification_status)}</TableCell>
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
                              onClick={() => handleApproveDocument(doc.id, doc.document_type_name)}
                              disabled={updateVerification.isPending}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              title="Reject"
                              onClick={() => handleRejectDocument(doc.id, doc.document_type_name)}
                              disabled={updateVerification.isPending}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Request re-upload"
                              onClick={() => handleRequestReupload(doc.id, doc.document_type_name)}
                              disabled={updateVerification.isPending}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {pendingDocuments.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                          No pending documents
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="verified" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Verification Activity</CardTitle>
              <CardDescription>Recently verified or rejected documents</CardDescription>
            </CardHeader>
            <CardContent>
              {verLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document Type</TableHead>
                      <TableHead>Application ID</TableHead>
                      <TableHead>File</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentVerifications.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.document_type_name}</TableCell>
                        <TableCell>
                          <code className="bg-gray-100 px-2 py-1 rounded text-sm">
                            {item.application_id || 'N/A'}
                          </code>
                        </TableCell>
                        <TableCell className="text-sm">{item.file_name || 'Unknown'}</TableCell>
                        <TableCell>{getStatusBadge(item.verification_status)}</TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {item.rejection_reason || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {recentVerifications.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                          No recent verifications
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
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
              {typesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : (
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
                            {doc.is_required ? "Required for all applications" : "Optional document"}
                            {doc.allowed_extensions && ` - ${doc.allowed_extensions.join(', ')}`}
                            {doc.max_file_size_mb && ` - Max ${doc.max_file_size_mb}MB`}
                          </p>
                        </div>
                      </div>
                      <Badge variant={doc.is_required ? "destructive" : "outline"}>
                        {doc.is_required ? "Required" : "Optional"}
                      </Badge>
                    </div>
                  ))}
                  {documentTypes.length === 0 && (
                    <div className="text-center py-8 text-gray-500">No document types configured</div>
                  )}
                </div>
              )}
              <div className="mt-6 flex gap-2">
                <Button variant="outline" onClick={() => toast.info('Contact your institution admin to add or manage document types')}>
                  Add Document Type
                </Button>
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
                  <span className="text-gray-600">Documents verified</span>
                  <span className="font-bold text-green-600">{stats.verified}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Pending review</span>
                  <span className="font-bold text-yellow-600">{stats.pendingVerification}</span>
                </div>
                <Progress
                  value={stats.totalDocuments > 0 ? (stats.verified / stats.totalDocuments) * 100 : 0}
                  className="mt-2 h-2"
                />
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
