"use client";

import { useState } from "react";
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

// Mock data for deduplication
const dedupeStats = {
  totalLeads: 3712,
  duplicateGroups: 89,
  totalDuplicates: 189,
  autoMergeable: 45,
  requiresReview: 44,
  duplicatePercentage: 5.1,
};

const duplicateGroups = [
  {
    id: 1,
    primaryName: "Rajesh Kumar",
    matchType: "Phone + Email",
    confidence: 98,
    records: [
      { id: 101, name: "Rajesh Kumar", phone: "9876543210", email: "rajesh@gmail.com", source: "Website", date: "2026-01-10", interactions: 5 },
      { id: 102, name: "Rajesh K", phone: "9876543210", email: "rajesh@gmail.com", source: "Walk-in", date: "2026-01-12", interactions: 2 },
    ],
  },
  {
    id: 2,
    primaryName: "Priya Sharma",
    matchType: "Email",
    confidence: 95,
    records: [
      { id: 201, name: "Priya Sharma", phone: "8765432109", email: "priya.sharma@email.com", source: "Website", date: "2026-01-08", interactions: 8 },
      { id: 202, name: "Priya S", phone: "8765432100", email: "priya.sharma@email.com", source: "Referral", date: "2026-01-14", interactions: 1 },
    ],
  },
  {
    id: 3,
    primaryName: "Amit Patel",
    matchType: "Phone",
    confidence: 90,
    records: [
      { id: 301, name: "Amit Patel", phone: "7654321098", email: "amit@email.com", source: "Social Media", date: "2026-01-05", interactions: 12 },
      { id: 302, name: "Amit P", phone: "7654321098", email: "amitp@email.com", source: "Website", date: "2026-01-11", interactions: 3 },
      { id: 303, name: "A Patel", phone: "7654321098", email: "", source: "Walk-in", date: "2026-01-15", interactions: 0 },
    ],
  },
  {
    id: 4,
    primaryName: "Sneha Reddy",
    matchType: "Name + DOB",
    confidence: 85,
    records: [
      { id: 401, name: "Sneha Reddy", phone: "6543210987", email: "sneha@email.com", source: "Website", date: "2026-01-02", interactions: 15 },
      { id: 402, name: "Sneha Reddy", phone: "6543210900", email: "snehareddy@email.com", source: "Email Campaign", date: "2026-01-13", interactions: 2 },
    ],
  },
];

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
  const [selectedMergeGroup, setSelectedMergeGroup] = useState<typeof duplicateGroups[0] | null>(null);
  const [selectedPrimary, setSelectedPrimary] = useState<number | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleScan = async () => {
    setIsScanning(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      toast.success("Duplicate scan completed - found 89 groups");
    } catch {
      toast.error("Failed to scan for duplicates");
    } finally {
      setIsScanning(false);
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

  const openMergeDialog = (group: typeof duplicateGroups[0]) => {
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

  return (
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
                <p className="text-xl font-bold">{dedupeStats.totalLeads.toLocaleString()}</p>
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
                <p className="text-xl font-bold text-yellow-600">{dedupeStats.duplicateGroups}</p>
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
                <p className="text-xl font-bold text-red-600">{dedupeStats.totalDuplicates}</p>
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
                <p className="text-xl font-bold text-green-600">{dedupeStats.autoMergeable}</p>
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
                <p className="text-xl font-bold text-orange-600">{dedupeStats.requiresReview}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#0b6d41]">
          <CardContent className="pt-6">
            <div>
              <p className="text-xs text-gray-600">Duplicate Rate</p>
              <p className="text-xl font-bold text-[#0b6d41]">{dedupeStats.duplicatePercentage}%</p>
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
            Duplicate Groups ({dedupeStats.duplicateGroups})
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
          <div className="space-y-4">
            {duplicateGroups.map((group) => (
              <Card key={group.id} className="border-l-4 border-l-yellow-400">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={selectedGroups.includes(group.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedGroups([...selectedGroups, group.id]);
                          } else {
                            setSelectedGroups(selectedGroups.filter((id) => id !== group.id));
                          }
                        }}
                      />
                      <div>
                        <CardTitle className="text-lg">{group.primaryName}</CardTitle>
                        <CardDescription>
                          {group.records.length} duplicate records found
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
                        <TableHead>Interactions</TableHead>
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
                          <TableCell className="font-medium">{record.name}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Phone className="h-3 w-3 text-gray-400" />
                              {record.phone}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Mail className="h-3 w-3 text-gray-400" />
                              {record.email || "(empty)"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{record.source}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <Calendar className="h-3 w-3" />
                              {record.date}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className={record.interactions > 5 ? "font-bold text-green-600" : ""}>
                              {record.interactions}
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Primary Record</TableHead>
                    <TableHead>Merged Records</TableHead>
                    <TableHead>Match Type</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Merged By</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>2026-01-15</TableCell>
                    <TableCell className="font-medium">Vikram Singh</TableCell>
                    <TableCell>2 records</TableCell>
                    <TableCell><Badge variant="outline">Phone + Email</Badge></TableCell>
                    <TableCell>98%</TableCell>
                    <TableCell>System (Auto)</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm">Undo</Button>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>2026-01-14</TableCell>
                    <TableCell className="font-medium">Meera Iyer</TableCell>
                    <TableCell>3 records</TableCell>
                    <TableCell><Badge variant="outline">Email</Badge></TableCell>
                    <TableCell>92%</TableCell>
                    <TableCell>Admin User</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm">Undo</Button>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>2026-01-13</TableCell>
                    <TableCell className="font-medium">Deepa M</TableCell>
                    <TableCell>2 records</TableCell>
                    <TableCell><Badge variant="outline">Name + DOB</Badge></TableCell>
                    <TableCell>88%</TableCell>
                    <TableCell>Admin User</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm">Undo</Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
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
                value={selectedPrimary?.toString()}
                onValueChange={(value) => setSelectedPrimary(parseInt(value))}
              >
                {selectedMergeGroup.records.map((record) => (
                  <div
                    key={record.id}
                    className={`flex items-center space-x-4 p-4 border rounded-lg ${
                      selectedPrimary === record.id ? "border-[#0b6d41] bg-green-50" : ""
                    }`}
                  >
                    <RadioGroupItem value={record.id.toString()} id={record.id.toString()} />
                    <Label htmlFor={record.id.toString()} className="flex-1 cursor-pointer">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium">{record.name}</p>
                          <p className="text-sm text-gray-600">{record.email}</p>
                          <p className="text-sm text-gray-600">{record.phone}</p>
                        </div>
                        <div className="text-right">
                          <Badge variant="outline">{record.source}</Badge>
                          <p className="text-sm text-gray-600 mt-1">{record.interactions} interactions</p>
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
  );
}

export default function DeduplicationPage() {
  return (
    <AdmissionErrorBoundary>
      <DeduplicationPageContent />
    </AdmissionErrorBoundary>
  );
}
