"use client";

import { useState } from "react";
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
  Shield,
  Clock,
  Users,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { AdmissionErrorBoundary } from "@/components/admission";

// Mock data for phone validation
const phoneStats = {
  total: 3712,
  valid: 2890,
  invalid: 456,
  pending: 366,
  validPercentage: 77.8,
};

const invalidPhones = [
  { id: 1, name: "Rajesh Kumar", phone: "9876543", email: "rajesh@email.com", issue: "Too short", source: "Website", date: "2026-01-15" },
  { id: 2, name: "Priya Sharma", phone: "12345678901234", email: "priya@email.com", issue: "Too long", source: "Walk-in", date: "2026-01-15" },
  { id: 3, name: "Amit Patel", phone: "abc1234567", email: "amit@email.com", issue: "Contains letters", source: "Referral", date: "2026-01-14" },
  { id: 4, name: "Sneha Reddy", phone: "0000000000", email: "sneha@email.com", issue: "Invalid pattern", source: "Website", date: "2026-01-14" },
  { id: 5, name: "Vikram Singh", phone: "+1-555-1234", email: "vikram@email.com", issue: "Non-Indian number", source: "Social Media", date: "2026-01-13" },
  { id: 6, name: "Meera Iyer", phone: "9999999999", email: "meera@email.com", issue: "Repeated digits", source: "Website", date: "2026-01-13" },
  { id: 7, name: "Karthik N", phone: "", email: "karthik@email.com", issue: "Missing phone", source: "Email Campaign", date: "2026-01-12" },
  { id: 8, name: "Deepa M", phone: "landline-0422", email: "deepa@email.com", issue: "Landline format", source: "Walk-in", date: "2026-01-12" },
];

const validationRules = [
  { rule: "10-digit Indian mobile", description: "Must be exactly 10 digits starting with 6-9", enabled: true },
  { rule: "No repeated digits", description: "Block numbers like 9999999999", enabled: true },
  { rule: "Valid area code", description: "First 4 digits must be valid operator code", enabled: false },
  { rule: "No landlines", description: "Block landline number patterns", enabled: true },
  { rule: "International format", description: "Allow +91 prefix for Indian numbers", enabled: true },
];

const issueBreakdown = [
  { issue: "Too short", count: 89, percentage: 19.5 },
  { issue: "Too long", count: 45, percentage: 9.9 },
  { issue: "Contains letters", count: 67, percentage: 14.7 },
  { issue: "Invalid pattern", count: 123, percentage: 27.0 },
  { issue: "Non-Indian number", count: 34, percentage: 7.5 },
  { issue: "Missing phone", count: 98, percentage: 21.5 },
];

function PhoneValidationPageContent() {
  const [isValidating, setIsValidating] = useState(false);
  const [selectedPhones, setSelectedPhones] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterIssue, setFilterIssue] = useState("all");
  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleValidateAll = async () => {
    setIsValidating(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 3000));
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
      await new Promise((resolve) => setTimeout(resolve, 1500));
      toast.success("Invalid phones exported successfully");
    } catch {
      toast.error("Failed to export");
    } finally {
      setIsExporting(false);
    }
  };

  const handleSaveRules = async () => {
    setIsSaving(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      toast.success("Validation rules saved successfully");
    } catch {
      toast.error("Failed to save rules");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedPhones((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedPhones.length === invalidPhones.length) {
      setSelectedPhones([]);
    } else {
      setSelectedPhones(invalidPhones.map((p) => p.id));
    }
  };

  const filteredPhones = invalidPhones.filter((phone) => {
    const matchesSearch =
      phone.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      phone.phone.includes(searchTerm) ||
      phone.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterIssue === "all" || phone.issue === filterIssue;
    return matchesSearch && matchesFilter;
  });

  return (
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
                <p className="text-xl font-bold">{phoneStats.total.toLocaleString()}</p>
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
                <p className="text-xl font-bold text-green-600">{phoneStats.valid.toLocaleString()}</p>
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
                <p className="text-xl font-bold text-red-600">{phoneStats.invalid.toLocaleString()}</p>
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
                <p className="text-xs text-gray-600">Pending Review</p>
                <p className="text-xl font-bold text-yellow-600">{phoneStats.pending.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#0b6d41]">
          <CardContent className="pt-6">
            <div>
              <p className="text-xs text-gray-600">Validation Rate</p>
              <p className="text-xl font-bold text-[#0b6d41]">{phoneStats.validPercentage}%</p>
              <Progress value={phoneStats.validPercentage} className="mt-2 h-1.5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="invalid">
        <TabsList>
          <TabsTrigger value="invalid" className="gap-2">
            <PhoneOff className="h-4 w-4" />
            Invalid Numbers ({phoneStats.invalid})
          </TabsTrigger>
          <TabsTrigger value="rules" className="gap-2">
            <Shield className="h-4 w-4" />
            Validation Rules
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
                    <SelectItem value="Non-Indian number">Non-Indian number</SelectItem>
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={selectedPhones.length === invalidPhones.length}
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
                  {filteredPhones.map((phone) => (
                    <TableRow key={phone.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedPhones.includes(phone.id)}
                          onCheckedChange={() => toggleSelect(phone.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{phone.name}</TableCell>
                      <TableCell>
                        <code className="bg-red-50 text-red-700 px-2 py-1 rounded text-sm">
                          {phone.phone || "(empty)"}
                        </code>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">{phone.email}</TableCell>
                      <TableCell>
                        <Badge variant="destructive" className="font-normal">
                          {phone.issue}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{phone.source}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">{phone.date}</TableCell>
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
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rules" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Validation Rules</CardTitle>
              <CardDescription>
                Configure rules for phone number validation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {validationRules.map((rule, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <Checkbox checked={rule.enabled} />
                      <div>
                        <p className="font-medium">{rule.rule}</p>
                        <p className="text-sm text-gray-600">{rule.description}</p>
                      </div>
                    </div>
                    <Badge variant={rule.enabled ? "default" : "outline"}>
                      {rule.enabled ? "Active" : "Disabled"}
                    </Badge>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex gap-2">
                <Button
                  className="bg-[#0b6d41] hover:bg-[#095232]"
                  onClick={handleSaveRules}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  {isSaving ? "Saving..." : "Save Rules"}
                </Button>
                <Button variant="outline">Reset to Default</Button>
              </div>
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
              <div className="space-y-4">
                {issueBreakdown.map((item, index) => (
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
              </div>
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
                    <span className="font-bold">{phoneStats.invalid}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Can be auto-fixed</span>
                    <span className="font-bold text-green-600">89</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Requires manual review</span>
                    <span className="font-bold text-yellow-600">234</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Unreachable (remove)</span>
                    <span className="font-bold text-red-600">133</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function PhoneValidationPage() {
  return (
    <AdmissionErrorBoundary>
      <PhoneValidationPageContent />
    </AdmissionErrorBoundary>
  );
}
