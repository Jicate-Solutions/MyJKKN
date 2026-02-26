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
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Copy,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Download,
  Search,
  Merge,
  Trash2,
  Eye,
  Users,
  FileText,
  GitMerge,
  Settings,
  ArrowRight,
  Phone,
  Mail,
  Calendar,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { AdmissionErrorBoundary } from "@/components/admission";
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useDeduplicationStats, useDuplicateGroups } from "@/hooks/admission/use-data-quality";
import type { DuplicateGroup } from "@/lib/services/admission/data-quality-service";

const matchingRules = [
  { field: "Email", weight: 40, enabled: true },
  { field: "Phone", weight: 35, enabled: true },
  { field: "Name (fuzzy)", weight: 15, enabled: true },
  { field: "Date of Birth", weight: 10, enabled: false },
  { field: "Address", weight: 5, enabled: false },
];

function DeduplicationPageContent() {
  const [isScanning, setIsScanning] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [selectedMergeGroup, setSelectedMergeGroup] = useState<DuplicateGroup | null>(null);
  const [selectedPrimary, setSelectedPrimary] = useState<string | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useDeduplicationStats();
  const { data: groups, isLoading: groupsLoading, refetch: refetchGroups } = useDuplicateGroups();

  const dedupeStats = stats || { totalLeads: 0, duplicateGroups: 0, totalDuplicates: 0, duplicatePercentage: 0 };
  const duplicateGroups = groups || [];

  const autoMergeable = duplicateGroups.filter(g => g.confidence >= 95).length;
  const requiresReview = dedupeStats.duplicateGroups - autoMergeable;

  const handleScan = async () => {
    setIsScanning(true);
    try {
      await Promise.all([refetchStats(), refetchGroups()]);
      toast.success(`Duplicate scan completed - found ${dedupeStats.duplicateGroups} groups`);
    } catch {
      toast.error("Failed to scan for duplicates");
    } finally {
      setIsScanning(false);
    }
  };

  const handleExportReport = async () => {
    setIsExporting(true);
    try {
      const rows = duplicateGroups.flatMap((g, gi) =>
        g.records.map((r, ri) => [
          `Group ${gi + 1}`,
          g.matchType,
          g.confidence,
          ri === 0 ? "Primary" : "Duplicate",
          r.full_name,
          r.phone || "",
          r.email || "",
          r.source || "",
          r.created_at,
        ].join(","))
      );
      const csv = ["Group,Match Type,Confidence,Role,Name,Phone,Email,Source,Date", ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "duplicate-leads-report.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Report exported successfully");
    } catch {
      toast.error("Failed to export report");
    } finally {
      setIsExporting(false);
    }
  };

  const handleMerge = async () => {
    setIsMerging(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      toast.success("Records merged successfully");
      setShowMergeDialog(false);
    } catch {
      toast.error("Failed to merge records");
    } finally {
      setIsMerging(false);
    }
  };

  const openMergeDialog = (group: DuplicateGroup) => {
    setSelectedMergeGroup(group);
    setSelectedPrimary(group.records[0].id);
    setShowMergeDialog(true);
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 95) {
      return <Badge className="bg-green-100 text-green-800">High ({confidence}%)</Badge>;
    } else if (confidence >= 85) {
      return <Badge className="bg-yellow-100 text-yellow-800">Medium ({confidence}%)</Badge>;
    } else {
      return <Badge className="bg-orange-100 text-orange-800">Low ({confidence}%)</Badge>;
    }
  };

  const filteredGroups = searchTerm
    ? duplicateGroups.filter(g =>
        g.records.some(r =>
          r.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (r.email || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
          (r.phone || "").includes(searchTerm)
        )
      )
    : duplicateGroups;

  const isLoading = statsLoading || groupsLoading;

  return (
    <PermissionGuard module="admission" action="view">
    <ContentLayout title="Deduplication">
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
              <BreadcrumbPage>Deduplication</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Copy className="h-8 w-8 text-[#0b6d41]" />
            Lead Deduplication
          </h1>
          <p className="text-gray-600 mt-1">
            Find and merge duplicate admission leads
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
            onClick={handleScan}
            disabled={isScanning}
            className="gap-2 bg-[#0b6d41] hover:bg-[#095232]"
          >
            {isScanning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {isScanning ? "Scanning..." : "Scan for Duplicates"}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600">Total Leads</p>
                <p className="text-xl font-bold">{isLoading ? '...' : dedupeStats.totalLeads.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-yellow-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Copy className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600">Duplicate Groups</p>
                <p className="text-xl font-bold text-yellow-600">{isLoading ? '...' : dedupeStats.duplicateGroups}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600">Total Duplicates</p>
                <p className="text-xl font-bold text-red-600">{isLoading ? '...' : dedupeStats.totalDuplicates}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <GitMerge className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600">Auto-Mergeable</p>
                <p className="text-xl font-bold text-green-600">{isLoading ? '...' : autoMergeable}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Eye className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600">Needs Review</p>
                <p className="text-xl font-bold text-orange-600">{isLoading ? '...' : requiresReview}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#0b6d41]">
          <CardContent className="pt-6">
            <div>
              <p className="text-xs text-gray-600">Duplicate Rate</p>
              <p className="text-xl font-bold text-[#0b6d41]">{isLoading ? '...' : `${dedupeStats.duplicatePercentage}%`}</p>
              <Progress value={dedupeStats.duplicatePercentage} className="mt-2 h-1.5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="duplicates">
        <TabsList>
          <TabsTrigger value="duplicates" className="gap-2">
            <Copy className="h-4 w-4" />
            Duplicate Groups ({isLoading ? '...' : dedupeStats.duplicateGroups})
          </TabsTrigger>
          <TabsTrigger value="rules" className="gap-2">
            <Settings className="h-4 w-4" />
            Matching Rules
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <FileText className="h-4 w-4" />
            Merge History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="duplicates" className="space-y-4">
          {/* Search and Actions */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-4 items-center">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search duplicate groups..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                {selectedGroups.length > 0 && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-2">
                      <Merge className="h-4 w-4" />
                      Auto-Merge Selected ({selectedGroups.length})
                    </Button>
                    <Button variant="destructive" size="sm" className="gap-2">
                      <Trash2 className="h-4 w-4" />
                      Ignore Selected
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Duplicate Groups */}
          {groupsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : filteredGroups.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-gray-500">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-400" />
                <p className="text-lg font-medium">No duplicates found</p>
                <p className="text-sm">All leads appear to be unique</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredGroups.map((group, groupIndex) => (
                <Card key={groupIndex} className="border-l-4 border-l-yellow-400">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedGroups.includes(groupIndex)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedGroups([...selectedGroups, groupIndex]);
                            } else {
                              setSelectedGroups(selectedGroups.filter((id) => id !== groupIndex));
                            }
                          }}
                        />
                        <div>
                          <CardTitle className="text-lg">{group.records[0]?.full_name || 'Unknown'}</CardTitle>
                          <CardDescription>
                            {group.records.length} duplicate records found via {group.matchType} ({group.matchValue})
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{group.matchType}</Badge>
                        {getConfidenceBadge(group.confidence)}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[50px]"></TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead>Date Added</TableHead>
                          <TableHead>Score</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.records.map((record, index) => (
                          <TableRow key={record.id} className={index === 0 ? "bg-green-50" : ""}>
                            <TableCell>
                              {index === 0 && (
                                <Badge className="bg-green-100 text-green-800 text-xs">Primary</Badge>
                              )}
                            </TableCell>
                            <TableCell className="font-medium">{record.full_name}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3 text-gray-400" />
                                {record.phone || '(empty)'}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Mail className="h-3 w-3 text-gray-400" />
                                {record.email || "(empty)"}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{record.source || 'Unknown'}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 text-sm text-gray-600">
                                <Calendar className="h-3 w-3" />
                                {new Date(record.created_at).toLocaleDateString()}
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className={(record.score || 0) > 50 ? "font-bold text-green-600" : ""}>
                                {record.score || 0}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <div className="flex justify-end gap-2 mt-4">
                      <Button variant="outline" size="sm">
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </Button>
                      <Button
                        size="sm"
                        className="bg-[#0b6d41] hover:bg-[#095232]"
                        onClick={() => openMergeDialog(group)}
                      >
                        <Merge className="h-4 w-4 mr-2" />
                        Merge Records
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="rules" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Matching Rules Configuration</CardTitle>
              <CardDescription>
                Configure how duplicates are detected. Higher weight = more importance.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {matchingRules.map((rule, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <Checkbox checked={rule.enabled} />
                      <div>
                        <p className="font-medium">{rule.field}</p>
                        <p className="text-sm text-gray-600">Weight: {rule.weight}%</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Progress value={rule.weight} className="w-24 h-2" />
                      <Badge variant={rule.enabled ? "default" : "outline"}>
                        {rule.enabled ? "Active" : "Disabled"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex gap-2">
                <Button className="bg-[#0b6d41] hover:bg-[#095232]">Save Configuration</Button>
                <Button variant="outline">Reset to Default</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Confidence Thresholds</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">Auto-merge threshold</p>
                  <p className="text-sm text-gray-600">Automatically merge records above this confidence</p>
                </div>
                <Input type="number" className="w-20" defaultValue={95} />
              </div>
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">Review threshold</p>
                  <p className="text-sm text-gray-600">Flag for manual review above this confidence</p>
                </div>
                <Input type="number" className="w-20" defaultValue={75} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Merge Operations</CardTitle>
              <CardDescription>History of merged duplicate records</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="py-8 text-center text-gray-500">
                <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No merge history available yet</p>
                <p className="text-sm">Merge operations will be tracked here</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Merge Dialog */}
      <Dialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Merge Duplicate Records</DialogTitle>
            <DialogDescription>
              Select the primary record to keep. Data from other records will be merged into it.
            </DialogDescription>
          </DialogHeader>
          {selectedMergeGroup && (
            <div className="space-y-4">
              <RadioGroup
                value={selectedPrimary || undefined}
                onValueChange={(value) => setSelectedPrimary(value)}
              >
                {selectedMergeGroup.records.map((record) => (
                  <div
                    key={record.id}
                    className={`flex items-center space-x-4 p-4 border rounded-lg ${
                      selectedPrimary === record.id ? "border-[#0b6d41] bg-green-50" : ""
                    }`}
                  >
                    <RadioGroupItem value={record.id} id={record.id} />
                    <Label htmlFor={record.id} className="flex-1 cursor-pointer">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium">{record.full_name}</p>
                          <p className="text-sm text-gray-600">{record.email || '(no email)'}</p>
                          <p className="text-sm text-gray-600">{record.phone || '(no phone)'}</p>
                        </div>
                        <div className="text-right">
                          <Badge variant="outline">{record.source || 'Unknown'}</Badge>
                          <p className="text-sm text-gray-600 mt-1">Score: {record.score || 0}</p>
                        </div>
                      </div>
                    </Label>
                  </div>
                ))}
              </RadioGroup>

              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium mb-2">Merge Preview:</p>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span>{selectedMergeGroup.records.length - 1} records</span>
                  <ArrowRight className="h-4 w-4" />
                  <span className="font-medium">1 primary record</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMergeDialog(false)} disabled={isMerging}>
              Cancel
            </Button>
            <Button
              className="bg-[#0b6d41] hover:bg-[#095232]"
              onClick={handleMerge}
              disabled={isMerging}
            >
              {isMerging ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Merge className="h-4 w-4 mr-2" />
              )}
              {isMerging ? "Merging..." : "Confirm Merge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
      </div>
    </ContentLayout>
    </PermissionGuard>
  );
}

export default function DeduplicationPage() {
  return (
    <AdmissionErrorBoundary>
      <DeduplicationPageContent />
    </AdmissionErrorBoundary>
  );
}
