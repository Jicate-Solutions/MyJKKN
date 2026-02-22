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
  Phone,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Download,
  Search,
  Filter,
  Trash2,
  Edit,
  PhoneOff,
  PhoneCall,
  MessageSquare,
  Clock,
  Users,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { AdmissionErrorBoundary } from "@/components/admission";
import { usePhoneValidationStats, useInvalidPhones, usePhoneIssueBreakdown } from "@/hooks/admission/use-data-quality";

function PhoneValidationPageContent() {
  const [isValidating, setIsValidating] = useState(false);
  const [selectedPhones, setSelectedPhones] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterIssue, setFilterIssue] = useState("all");
  const [isExporting, setIsExporting] = useState(false);

  const { data: phoneStats, isLoading: statsLoading, refetch: refetchStats } = usePhoneValidationStats();
  const { data: invalidPhones, isLoading: phonesLoading, refetch: refetchPhones } = useInvalidPhones({ search: searchTerm, issueFilter: filterIssue });
  const { data: issueBreakdown, isLoading: breakdownLoading, refetch: refetchBreakdown } = usePhoneIssueBreakdown();

  const handleValidateAll = async () => {
    setIsValidating(true);
    try {
      await Promise.all([refetchStats(), refetchPhones(), refetchBreakdown()]);
      toast.success("Phone validation completed successfully");
    } catch {
      toast.error("Failed to validate phones");
    } finally {
      setIsValidating(false);
    }
  };

  const handleExportInvalid = async () => {
    setIsExporting(true);
    try {
      if (!invalidPhones || invalidPhones.length === 0) {
        toast.info("No invalid phones to export");
        return;
      }
      const csv = [
        ['Name', 'Phone', 'Email', 'Issue', 'Source', 'Date'].join(','),
        ...invalidPhones.map(p =>
          [p.full_name, p.phone || '', p.email || '', p.issue, p.source || '', p.created_at?.split('T')[0] || ''].join(',')
        ),
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'invalid-phones.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Invalid phones exported successfully");
    } catch {
      toast.error("Failed to export");
    } finally {
      setIsExporting(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedPhones((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (!invalidPhones) return;
    if (selectedPhones.length === invalidPhones.length) {
      setSelectedPhones([]);
    } else {
      setSelectedPhones(invalidPhones.map((p) => p.id));
    }
  };

  const stats = phoneStats || { total: 0, valid: 0, invalid: 0, missing: 0, validPercentage: 0 };
  const pendingCount = stats.missing;

  return (
    <ContentLayout title="Phone Validation">
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
              <BreadcrumbPage>Phone Validation</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Phone className="h-8 w-8 text-[#0b6d41]" />
            Phone Validation
          </h1>
          <p className="text-gray-600 mt-1">
            Validate and clean phone numbers for admission leads
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleExportInvalid}
            disabled={isExporting}
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {isExporting ? "Exporting..." : "Export Invalid"}
          </Button>
          <Button
            onClick={handleValidateAll}
            disabled={isValidating}
            className="gap-2 bg-[#0b6d41] hover:bg-[#095232]"
          >
            {isValidating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {isValidating ? "Validating..." : "Validate All"}
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
                <p className="text-xs text-gray-600">Total Leads</p>
                <p className="text-xl font-bold">{statsLoading ? '...' : stats.total.toLocaleString()}</p>
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
                <p className="text-xs text-gray-600">Valid Phones</p>
                <p className="text-xl font-bold text-green-600">{statsLoading ? '...' : stats.valid.toLocaleString()}</p>
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
                <p className="text-xs text-gray-600">Invalid Phones</p>
                <p className="text-xl font-bold text-red-600">{statsLoading ? '...' : stats.invalid.toLocaleString()}</p>
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
                <p className="text-xs text-gray-600">Missing Phone</p>
                <p className="text-xl font-bold text-yellow-600">{statsLoading ? '...' : pendingCount.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#0b6d41]">
          <CardContent className="pt-6">
            <div>
              <p className="text-xs text-gray-600">Validation Rate</p>
              <p className="text-xl font-bold text-[#0b6d41]">{statsLoading ? '...' : `${stats.validPercentage}%`}</p>
              <Progress value={stats.validPercentage} className="mt-2 h-1.5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="invalid">
        <TabsList>
          <TabsTrigger value="invalid" className="gap-2">
            <PhoneOff className="h-4 w-4" />
            Invalid Numbers ({stats.invalid + stats.missing})
          </TabsTrigger>
          <TabsTrigger value="breakdown" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Issue Breakdown
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invalid" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-4 items-center">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search by name, phone, or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={filterIssue} onValueChange={setFilterIssue}>
                  <SelectTrigger className="w-[200px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filter by issue" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Issues</SelectItem>
                    <SelectItem value="Too short">Too short</SelectItem>
                    <SelectItem value="Too long">Too long</SelectItem>
                    <SelectItem value="Contains letters">Contains letters</SelectItem>
                    <SelectItem value="Invalid pattern">Invalid pattern</SelectItem>
                    <SelectItem value="Repeated digits">Repeated digits</SelectItem>
                    <SelectItem value="Missing phone">Missing phone</SelectItem>
                  </SelectContent>
                </Select>
                {selectedPhones.length > 0 && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-2">
                      <Edit className="h-4 w-4" />
                      Edit Selected ({selectedPhones.length})
                    </Button>
                    <Button variant="destructive" size="sm" className="gap-2">
                      <Trash2 className="h-4 w-4" />
                      Remove Selected
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Invalid Numbers Table */}
          <Card>
            <CardContent className="pt-4">
              {phonesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">
                        <Checkbox
                          checked={invalidPhones && invalidPhones.length > 0 && selectedPhones.length === invalidPhones.length}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone Number</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Issue</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Date Added</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(invalidPhones || []).slice(0, 50).map((phone) => (
                      <TableRow key={phone.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedPhones.includes(phone.id)}
                            onCheckedChange={() => toggleSelect(phone.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{phone.full_name}</TableCell>
                        <TableCell>
                          <code className="bg-red-50 text-red-700 px-2 py-1 rounded text-sm">
                            {phone.phone || "(empty)"}
                          </code>
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">{phone.email || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="destructive" className="font-normal">
                            {phone.issue}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{phone.source || 'Unknown'}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">{phone.created_at?.split('T')[0]}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" title="Edit">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" title="Call to verify">
                              <PhoneCall className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" title="Send message">
                              <MessageSquare className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {invalidPhones && invalidPhones.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                          No invalid phone numbers found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="breakdown" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Issue Breakdown</CardTitle>
              <CardDescription>
                Distribution of phone validation issues
              </CardDescription>
            </CardHeader>
            <CardContent>
              {breakdownLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="space-y-4">
                  {(issueBreakdown || []).map((item, index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{item.issue}</span>
                        <span className="text-sm text-gray-600">
                          {item.count} ({item.percentage}%)
                        </span>
                      </div>
                      <Progress value={item.percentage} className="h-2" />
                    </div>
                  ))}
                  {issueBreakdown && issueBreakdown.length === 0 && (
                    <p className="text-center text-gray-500 py-4">No issues found - all phones are valid!</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" className="w-full justify-start gap-2">
                  <Trash2 className="h-4 w-4" />
                  Remove all missing phones
                </Button>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <Edit className="h-4 w-4" />
                  Bulk edit short numbers
                </Button>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Request phone update via email
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Validation Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total invalid records</span>
                    <span className="font-bold">{stats.invalid + stats.missing}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Invalid format</span>
                    <span className="font-bold text-red-600">{stats.invalid}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Missing phone</span>
                    <span className="font-bold text-yellow-600">{stats.missing}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Valid phones</span>
                    <span className="font-bold text-green-600">{stats.valid}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
      </div>
      </div>
    </ContentLayout>
  );
}

export default function PhoneValidationPage() {
  return (
    <AdmissionErrorBoundary>
      <PhoneValidationPageContent />
    </AdmissionErrorBoundary>
  );
}
