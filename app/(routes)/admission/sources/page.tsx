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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Globe,
  Plus,
  Edit,
  Trash2,
  Search,
  TrendingUp,
  TrendingDown,
  Users,
  DollarSign,
  Target,
  BarChart3,
  ExternalLink,
  Copy,
  Facebook,
  Instagram,
  Youtube,
  Newspaper,
  Phone,
  Mail,
  MessageSquare,
  Building,
  Megaphone,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { AdmissionErrorBoundary } from "@/components/admission";

// Mock data for source tracking
const sourceStats = {
  totalLeads: 3712,
  totalSources: 24,
  attributedLeads: 3345,
  attributionRate: 90.1,
  topSource: "Website",
  bestROI: "Referral",
};

const sources = [
  {
    id: 1,
    name: "Website",
    type: "Digital",
    icon: "globe",
    leads: 1245,
    conversions: 156,
    conversionRate: 12.5,
    cost: 50000,
    cpl: 40,
    roi: 3.2,
    trend: "up",
    status: "active",
  },
  {
    id: 2,
    name: "Facebook Ads",
    type: "Paid Social",
    icon: "facebook",
    leads: 678,
    conversions: 68,
    conversionRate: 10.0,
    cost: 120000,
    cpl: 177,
    roi: 1.8,
    trend: "up",
    status: "active",
  },
  {
    id: 3,
    name: "Instagram",
    type: "Paid Social",
    icon: "instagram",
    leads: 456,
    conversions: 41,
    conversionRate: 9.0,
    cost: 80000,
    cpl: 175,
    roi: 1.6,
    trend: "down",
    status: "active",
  },
  {
    id: 4,
    name: "Referral",
    type: "Organic",
    icon: "users",
    leads: 345,
    conversions: 69,
    conversionRate: 20.0,
    cost: 0,
    cpl: 0,
    roi: 999,
    trend: "up",
    status: "active",
  },
  {
    id: 5,
    name: "Walk-in",
    type: "Offline",
    icon: "building",
    leads: 234,
    conversions: 47,
    conversionRate: 20.1,
    cost: 0,
    cpl: 0,
    roi: 999,
    trend: "stable",
    status: "active",
  },
  {
    id: 6,
    name: "YouTube Ads",
    type: "Paid Social",
    icon: "youtube",
    leads: 189,
    conversions: 15,
    conversionRate: 7.9,
    cost: 100000,
    cpl: 529,
    roi: 0.9,
    trend: "down",
    status: "active",
  },
  {
    id: 7,
    name: "Newspaper Ad",
    type: "Traditional",
    icon: "newspaper",
    leads: 123,
    conversions: 10,
    conversionRate: 8.1,
    cost: 200000,
    cpl: 1626,
    roi: 0.4,
    trend: "down",
    status: "paused",
  },
  {
    id: 8,
    name: "WhatsApp Campaign",
    type: "Digital",
    icon: "message",
    leads: 287,
    conversions: 34,
    conversionRate: 11.8,
    cost: 15000,
    cpl: 52,
    roi: 4.1,
    trend: "up",
    status: "active",
  },
];

const utmParameters = [
  { source: "facebook", medium: "paid", campaign: "admission_2026", leads: 678 },
  { source: "instagram", medium: "paid", campaign: "admission_2026", leads: 456 },
  { source: "google", medium: "cpc", campaign: "brand_keywords", leads: 234 },
  { source: "youtube", medium: "video", campaign: "testimonials", leads: 189 },
  { source: "email", medium: "newsletter", campaign: "jan_update", leads: 145 },
];

function SourcesPageContent() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("URL copied to clipboard");
  };

  const handleCreateSource = async () => {
    setIsCreating(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success("Source added successfully");
      setShowAddDialog(false);
    } catch {
      toast.error("Failed to add source");
    } finally {
      setIsCreating(false);
    }
  };

  const getSourceIcon = (icon: string) => {
    switch (icon) {
      case "globe":
        return <Globe className="h-5 w-5 text-blue-500" />;
      case "facebook":
        return <Facebook className="h-5 w-5 text-blue-600" />;
      case "instagram":
        return <Instagram className="h-5 w-5 text-pink-500" />;
      case "youtube":
        return <Youtube className="h-5 w-5 text-red-500" />;
      case "users":
        return <Users className="h-5 w-5 text-green-500" />;
      case "building":
        return <Building className="h-5 w-5 text-gray-500" />;
      case "newspaper":
        return <Newspaper className="h-5 w-5 text-gray-600" />;
      case "message":
        return <MessageSquare className="h-5 w-5 text-green-600" />;
      default:
        return <Globe className="h-5 w-5 text-gray-400" />;
    }
  };

  const getTrendIcon = (trend: string) => {
    if (trend === "up") return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (trend === "down") return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <span className="text-gray-400">-</span>;
  };

  const filteredSources = sources.filter((source) =>
    source.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Globe className="h-8 w-8 text-[#0b6d41]" />
            Source Attribution
          </h1>
          <p className="text-gray-600 mt-1">
            Track and analyze lead sources for ROI optimization
          </p>
        </div>
        <Button onClick={() => setShowAddDialog(true)} className="gap-2 bg-[#0b6d41] hover:bg-[#095232]">
          <Plus className="h-4 w-4" />
          Add Source
        </Button>
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
                <p className="text-xl font-bold">{sourceStats.totalLeads.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Globe className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600">Active Sources</p>
                <p className="text-xl font-bold">{sourceStats.totalSources}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Target className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600">Attributed</p>
                <p className="text-xl font-bold text-green-600">{sourceStats.attributedLeads.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#0b6d41]">
          <CardContent className="pt-6">
            <div>
              <p className="text-xs text-gray-600">Attribution Rate</p>
              <p className="text-xl font-bold text-[#0b6d41]">{sourceStats.attributionRate}%</p>
              <Progress value={sourceStats.attributionRate} className="mt-2 h-1.5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Megaphone className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600">Top Source</p>
                <p className="text-xl font-bold">{sourceStats.topSource}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <DollarSign className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600">Best ROI</p>
                <p className="text-xl font-bold">{sourceStats.bestROI}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="sources">
        <TabsList>
          <TabsTrigger value="sources" className="gap-2">
            <Globe className="h-4 w-4" />
            All Sources
          </TabsTrigger>
          <TabsTrigger value="utm" className="gap-2">
            <ExternalLink className="h-4 w-4" />
            UTM Tracking
          </TabsTrigger>
          <TabsTrigger value="roi" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            ROI Analysis
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sources" className="space-y-4">
          {/* Search */}
          <Card>
            <CardContent className="pt-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search sources..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </CardContent>
          </Card>

          {/* Sources Table */}
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Leads</TableHead>
                    <TableHead>Conversions</TableHead>
                    <TableHead>Conv. Rate</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead>CPL</TableHead>
                    <TableHead>ROI</TableHead>
                    <TableHead>Trend</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSources.map((source) => (
                    <TableRow key={source.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getSourceIcon(source.icon)}
                          <span className="font-medium">{source.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{source.type}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{source.leads.toLocaleString()}</TableCell>
                      <TableCell>{source.conversions}</TableCell>
                      <TableCell>
                        <span
                          className={
                            source.conversionRate >= 15
                              ? "text-green-600 font-medium"
                              : source.conversionRate >= 10
                              ? "text-yellow-600"
                              : "text-red-600"
                          }
                        >
                          {source.conversionRate.toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell>
                        {source.cost > 0 ? `₹${(source.cost / 1000).toFixed(0)}K` : "-"}
                      </TableCell>
                      <TableCell>
                        {source.cpl > 0 ? `₹${source.cpl}` : "-"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={
                            source.roi >= 3
                              ? "text-green-600 font-bold"
                              : source.roi >= 1.5
                              ? "text-yellow-600 font-medium"
                              : source.roi > 0
                              ? "text-red-600"
                              : "text-gray-400"
                          }
                        >
                          {source.roi === 999 ? "∞" : `${source.roi.toFixed(1)}x`}
                        </span>
                      </TableCell>
                      <TableCell>{getTrendIcon(source.trend)}</TableCell>
                      <TableCell>
                        <Badge variant={source.status === "active" ? "default" : "secondary"}>
                          {source.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-red-500">
                            <Trash2 className="h-4 w-4" />
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

        <TabsContent value="utm" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>UTM Parameter Tracking</CardTitle>
              <CardDescription>
                Track campaign performance using UTM parameters
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Medium</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Leads</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {utmParameters.map((utm, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <code className="bg-gray-100 px-2 py-1 rounded text-sm">
                          {utm.source}
                        </code>
                      </TableCell>
                      <TableCell>
                        <code className="bg-gray-100 px-2 py-1 rounded text-sm">
                          {utm.medium}
                        </code>
                      </TableCell>
                      <TableCell>
                        <code className="bg-gray-100 px-2 py-1 rounded text-sm">
                          {utm.campaign}
                        </code>
                      </TableCell>
                      <TableCell className="font-medium">{utm.leads}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-2"
                          onClick={() => handleCopyUrl(`https://jkkn.edu.in/apply?utm_source=${utm.source}&utm_medium=${utm.medium}&utm_campaign=${utm.campaign}`)}
                        >
                          <Copy className="h-4 w-4" />
                          Copy URL
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>UTM Builder</CardTitle>
              <CardDescription>Generate trackable URLs for your campaigns</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Base URL</Label>
                  <Input placeholder="https://jkkn.edu.in/apply" />
                </div>
                <div className="space-y-2">
                  <Label>Source</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="facebook">Facebook</SelectItem>
                      <SelectItem value="instagram">Instagram</SelectItem>
                      <SelectItem value="google">Google</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Medium</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select medium" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="organic">Organic</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="referral">Referral</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Campaign Name</Label>
                <Input placeholder="admission_2026_january" />
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <Label className="text-sm text-gray-600">Generated URL:</Label>
                <div className="flex items-center gap-2 mt-2">
                  <code className="flex-1 bg-white p-2 rounded border text-sm break-all">
                    https://jkkn.edu.in/apply?utm_source=facebook&utm_medium=paid&utm_campaign=admission_2026_january
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleCopyUrl("https://jkkn.edu.in/apply?utm_source=facebook&utm_medium=paid&utm_campaign=admission_2026_january")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roi" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-l-4 border-l-green-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-500" />
                  Top Performing Sources
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {sources
                    .filter((s) => s.roi >= 3 || s.roi === 999)
                    .sort((a, b) => b.conversionRate - a.conversionRate)
                    .slice(0, 5)
                    .map((source, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getSourceIcon(source.icon)}
                          <span>{source.name}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-green-600 font-medium">
                            {source.conversionRate.toFixed(1)}% conv.
                          </span>
                          <Badge className="bg-green-100 text-green-800">
                            {source.roi === 999 ? "∞" : `${source.roi.toFixed(1)}x`} ROI
                          </Badge>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-red-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-red-500" />
                  Underperforming Sources
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {sources
                    .filter((s) => s.roi < 1.5 && s.roi > 0)
                    .sort((a, b) => a.roi - b.roi)
                    .slice(0, 5)
                    .map((source, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getSourceIcon(source.icon)}
                          <span>{source.name}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-red-600 font-medium">
                            ₹{source.cpl} CPL
                          </span>
                          <Badge variant="destructive">
                            {source.roi.toFixed(1)}x ROI
                          </Badge>
                        </div>
                      </div>
                    ))}
                </div>
                <Button variant="outline" className="w-full mt-4">
                  Review Budget Allocation
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Budget Recommendations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="font-medium text-green-800">Increase Budget</p>
                  <p className="text-sm text-green-700 mt-1">
                    WhatsApp Campaign and Referral program show excellent ROI. Consider increasing investment.
                  </p>
                </div>
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="font-medium text-yellow-800">Optimize</p>
                  <p className="text-sm text-yellow-700 mt-1">
                    Instagram ads have declining performance. Review targeting and creatives.
                  </p>
                </div>
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="font-medium text-red-800">Consider Pausing</p>
                  <p className="text-sm text-red-700 mt-1">
                    Newspaper ads show poor ROI (0.4x). Consider reallocating budget to digital channels.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Source Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Source</DialogTitle>
            <DialogDescription>
              Configure a new lead source for tracking
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Source Name</Label>
              <Input placeholder="e.g., LinkedIn Ads" />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="digital">Digital</SelectItem>
                  <SelectItem value="paid_social">Paid Social</SelectItem>
                  <SelectItem value="organic">Organic</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                  <SelectItem value="traditional">Traditional</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Monthly Budget (optional)</Label>
              <Input type="number" placeholder="₹" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} disabled={isCreating}>
              Cancel
            </Button>
            <Button className="bg-[#0b6d41] hover:bg-[#095232]" onClick={handleCreateSource} disabled={isCreating}>
              {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Source
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function SourcesPage() {
  return (
    <AdmissionErrorBoundary>
      <SourcesPageContent />
    </AdmissionErrorBoundary>
  );
}
