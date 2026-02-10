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
  Search,
  TrendingUp,
  Users,
  Target,
  BarChart3,
  ExternalLink,
  Copy,
  Megaphone,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { AdmissionErrorBoundary } from "@/components/admission";
import { useSourceBreakdown, useSourceStats } from "@/hooks/admission/use-data-quality";

function SourcesPageContent() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const { data: sourceBreakdown, isLoading: breakdownLoading } = useSourceBreakdown();
  const { data: sourceStats, isLoading: statsLoading } = useSourceStats();

  const sources = sourceBreakdown || [];
  const stats = sourceStats || { totalLeads: 0, totalSources: 0, attributedLeads: 0, attributionRate: 0, topSource: 'N/A' };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("URL copied to clipboard");
  };

  const handleCreateSource = () => {
    // Sources are derived from lead_source values on admission_leads
    // No separate sources table - this is informational only
    toast.info("Sources are automatically tracked from lead entries");
    setShowAddDialog(false);
  };

  const filteredSources = sources.filter((source) =>
    source.source.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isLoading = breakdownLoading || statsLoading;

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
            Track and analyze lead sources for optimization
          </p>
        </div>
        <Button onClick={() => setShowAddDialog(true)} className="gap-2 bg-[#0b6d41] hover:bg-[#095232]">
          <Plus className="h-4 w-4" />
          Add Source
        </Button>
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
                <p className="text-xl font-bold">
                  {isLoading ? '...' : stats.totalLeads.toLocaleString()}
                </p>
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
                <p className="text-xl font-bold">
                  {isLoading ? '...' : stats.totalSources}
                </p>
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
                <p className="text-xl font-bold text-green-600">
                  {isLoading ? '...' : stats.attributedLeads.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#0b6d41]">
          <CardContent className="pt-6">
            <div>
              <p className="text-xs text-gray-600">Attribution Rate</p>
              <p className="text-xl font-bold text-[#0b6d41]">
                {isLoading ? '...' : `${stats.attributionRate}%`}
              </p>
              <Progress value={stats.attributionRate} className="mt-2 h-1.5" />
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
                <p className="text-xl font-bold">
                  {isLoading ? '...' : stats.topSource}
                </p>
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
          <TabsTrigger value="performance" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Performance
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
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead>Leads</TableHead>
                      <TableHead>Conversions</TableHead>
                      <TableHead>Conv. Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSources.map((source, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Globe className="h-4 w-4 text-gray-400" />
                            <span className="font-medium">{source.source}</span>
                          </div>
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
                      </TableRow>
                    ))}
                    {filteredSources.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                          No sources found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="utm" className="space-y-4">
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

        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-l-4 border-l-green-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-500" />
                  Top Performing Sources
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {sources
                      .filter(s => s.conversionRate >= 10)
                      .sort((a, b) => b.conversionRate - a.conversionRate)
                      .slice(0, 5)
                      .map((source, index) => (
                        <div key={index} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Globe className="h-4 w-4 text-gray-400" />
                            <span>{source.source}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-green-600 font-medium">
                              {source.conversionRate.toFixed(1)}% conv.
                            </span>
                            <Badge className="bg-green-100 text-green-800">
                              {source.leads} leads
                            </Badge>
                          </div>
                        </div>
                      ))}
                    {sources.filter(s => s.conversionRate >= 10).length === 0 && (
                      <p className="text-center text-gray-500 py-4">No high-performing sources yet</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-blue-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-blue-500" />
                  Sources by Volume
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {sources.slice(0, 5).map((source, index) => {
                      const maxLeads = sources[0]?.leads || 1;
                      return (
                        <div key={index} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span>{source.source}</span>
                            <span className="font-medium">{source.leads} leads</span>
                          </div>
                          <Progress value={(source.leads / maxLeads) * 100} className="h-2" />
                        </div>
                      );
                    })}
                    {sources.length === 0 && (
                      <p className="text-center text-gray-500 py-4">No source data available</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
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
