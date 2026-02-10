'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Award,
  Trophy,
  Users,
  GraduationCap,
  Search,
  Plus,
  Download,
  Settings,
  CheckCircle2,
  XCircle,
  FileText,
  Eye,
  Edit,
  Star,
  Target,
  Sparkles,
  IndianRupee,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { AdmissionErrorBoundary } from '@/components/admission';
import { useScholarships, useScholarshipApplications } from '@/hooks/admission/use-data-quality';

function ScholarshipsPageContent() {
  const [activeTab, setActiveTab] = useState('scholarships');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const { data: scholarships, isLoading: scholarshipsLoading } = useScholarships();
  const { data: applications, isLoading: applicationsLoading } = useScholarshipApplications();

  const schList = scholarships || [];
  const appList = applications || [];

  const totalBudget = schList.reduce((sum, s) => sum + ((s.total_slots || 0) * (s.benefit_value || 0)), 0) || 1;
  const disbursedAmount = schList.reduce((sum, s) => sum + ((s.used_slots || 0) * (s.benefit_value || 0)), 0);
  const totalApplications = appList.length;
  const totalAwarded = appList.filter(a => a.status === 'approved').length;
  const pendingCount = appList.filter(a => a.status === 'pending').length;
  const activeSchemes = schList.filter(s => s.is_active).length;
  const remainingSlots = schList.reduce((sum, s) => sum + ((s.total_slots || 0) - (s.used_slots || 0)), 0);

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-800',
      approved: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      under_review: 'bg-blue-100 text-blue-800',
      rejected: 'bg-red-100 text-red-800'
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'merit': return <Trophy className="h-4 w-4 text-yellow-500" />;
      case 'sports': return <Target className="h-4 w-4 text-blue-500" />;
      case 'need_based': return <Users className="h-4 w-4 text-purple-500" />;
      case 'diversity': return <Sparkles className="h-4 w-4 text-pink-500" />;
      default: return <Award className="h-4 w-4 text-gray-500" />;
    }
  };

  const filteredScholarships = schList.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || s.scholarship_type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Award className="h-6 w-6 text-yellow-500" />
            Scholarship Management
          </h1>
          <p className="text-muted-foreground">Manage scholarships, applications, and awards</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => toast.success('Scholarship report exported successfully')}>
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Create Scholarship
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create New Scholarship</DialogTitle>
                <DialogDescription>Define scholarship criteria and allocate budget</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Scholarship Name</Label>
                    <Input placeholder="e.g., Merit Excellence Award" />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="merit">Merit-Based</SelectItem>
                        <SelectItem value="sports">Sports Achievement</SelectItem>
                        <SelectItem value="need_based">Need-Based</SelectItem>
                        <SelectItem value="diversity">Diversity</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Benefit Value</Label>
                    <Input type="number" placeholder="50000" />
                  </div>
                  <div className="space-y-2">
                    <Label>Total Slots</Label>
                    <Input type="number" placeholder="20" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Eligibility Criteria</Label>
                  <Textarea placeholder="Minimum academic score, attendance requirements, etc." />
                </div>
                <div className="space-y-2">
                  <Label>Applicable Programs</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select programs" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Programs</SelectItem>
                      <SelectItem value="btech">B.Tech</SelectItem>
                      <SelectItem value="mtech">M.Tech</SelectItem>
                      <SelectItem value="mba">MBA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} disabled={isCreating}>Cancel</Button>
                <Button
                  disabled={isCreating}
                  onClick={async () => {
                    setIsCreating(true);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    setIsCreating(false);
                    setIsCreateDialogOpen(false);
                    toast.success('Scholarship created successfully');
                  }}
                >
                  {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {isCreating ? 'Creating...' : 'Create Scholarship'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Budget</CardTitle>
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {scholarshipsLoading ? '...' : `₹${(totalBudget / 100000).toFixed(1)}L`}
            </div>
            <Progress value={totalBudget > 0 ? (disbursedAmount / totalBudget) * 100 : 0} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {scholarshipsLoading ? '...' : `₹${(disbursedAmount / 100000).toFixed(1)}L disbursed`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Applications</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{applicationsLoading ? '...' : totalApplications}</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-yellow-600">{applicationsLoading ? '' : `${pendingCount} pending review`}</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Scholarships Awarded</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{applicationsLoading ? '...' : totalAwarded}</div>
            <p className="text-xs text-muted-foreground">
              {totalApplications > 0 ? ((totalAwarded / totalApplications) * 100).toFixed(0) : '0'}% approval rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Schemes</CardTitle>
            <Award className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{scholarshipsLoading ? '...' : activeSchemes}</div>
            <p className="text-xs text-muted-foreground">
              {scholarshipsLoading ? '' : `${remainingSlots} slots remaining`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="scholarships">Scholarship Schemes</TabsTrigger>
          <TabsTrigger value="applications">Applications</TabsTrigger>
          <TabsTrigger value="awarded">Awarded</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="scholarships" className="space-y-4">
          {/* Filters */}
          <div className="flex gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search scholarships..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="merit">Merit-Based</SelectItem>
                <SelectItem value="sports">Sports</SelectItem>
                <SelectItem value="need_based">Need-Based</SelectItem>
                <SelectItem value="diversity">Diversity</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Scholarship Cards */}
          {scholarshipsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredScholarships.map((scholarship) => (
                <Card key={scholarship.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {getTypeIcon(scholarship.scholarship_type)}
                        <CardTitle className="text-lg">{scholarship.name}</CardTitle>
                      </div>
                      <Badge className={getStatusBadge(scholarship.is_active ? 'active' : 'inactive')}>
                        {scholarship.is_active ? 'active' : 'inactive'}
                      </Badge>
                    </div>
                    <CardDescription>{scholarship.description || 'No description'}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Benefit</p>
                        <p className="font-semibold">
                          {scholarship.benefit_type === 'percentage'
                            ? `${scholarship.benefit_value}% discount`
                            : `₹${(scholarship.benefit_value || 0).toLocaleString()}`
                          }
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Type</p>
                        <p className="font-semibold capitalize">{(scholarship.scholarship_type || '').replace('_', ' ')}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Applications</p>
                        <p className="font-semibold">{scholarship.applicationsCount || 0}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Awarded</p>
                        <p className="font-semibold">{scholarship.used_slots || 0} / {scholarship.total_slots || 0}</p>
                      </div>
                    </div>
                    <Progress
                      value={(scholarship.total_slots || 0) > 0 ? ((scholarship.used_slots || 0) / scholarship.total_slots) * 100 : 0}
                      className="h-2"
                    />
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => toast.success('Opening scholarship details')}>
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => toast.success('Opening scholarship editor')}>
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => toast.success('Opening scholarship settings')}>
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filteredScholarships.length === 0 && (
                <div className="col-span-2 text-center py-12 text-gray-500">
                  No scholarships found
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="applications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Scholarship Applications</CardTitle>
              <CardDescription>Review and process student scholarship applications</CardDescription>
            </CardHeader>
            <CardContent>
              {applicationsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="space-y-4">
                  {appList.map((app) => (
                    <div key={app.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <GraduationCap className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{app.application_id || app.id}</p>
                          <p className="text-sm text-muted-foreground">{app.scholarship?.name || 'Unknown Scholarship'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm">Amount: ₹{(app.approved_amount || 0).toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">Applied: {new Date(app.applied_at).toLocaleDateString()}</p>
                        </div>
                        <Badge className={getStatusBadge(app.status)}>
                          {(app.status || '').replace('_', ' ')}
                        </Badge>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => toast.success('Opening application details')}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {app.status === 'pending' && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-green-600"
                                disabled={approvingId === app.id || rejectingId === app.id}
                                onClick={async () => {
                                  setApprovingId(app.id);
                                  await new Promise(resolve => setTimeout(resolve, 800));
                                  setApprovingId(null);
                                  toast.success('Application approved successfully');
                                }}
                              >
                                {approvingId === app.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600"
                                disabled={approvingId === app.id || rejectingId === app.id}
                                onClick={async () => {
                                  setRejectingId(app.id);
                                  await new Promise(resolve => setTimeout(resolve, 800));
                                  setRejectingId(null);
                                  toast.error('Application rejected');
                                }}
                              >
                                {rejectingId === app.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <XCircle className="h-4 w-4" />
                                )}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {appList.length === 0 && (
                    <div className="text-center py-8 text-gray-500">No applications found</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="awarded" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Awarded Scholarships</CardTitle>
              <CardDescription>Students who have received scholarship awards</CardDescription>
            </CardHeader>
            <CardContent>
              {applicationsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="space-y-4">
                  {appList.filter(a => a.status === 'approved').map((app) => (
                    <div key={app.id} className="flex items-center justify-between p-4 border rounded-lg bg-green-50">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                          <Trophy className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                          <p className="font-medium">{app.application_id || app.id}</p>
                          <p className="text-sm text-muted-foreground">{app.scholarship?.name || 'Unknown Scholarship'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-semibold text-green-600">₹{(app.approved_amount || 0).toLocaleString()}</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => toast.success('Scholarship certificate downloaded')}>
                          <FileText className="h-4 w-4 mr-1" />
                          Certificate
                        </Button>
                      </div>
                    </div>
                  ))}
                  {appList.filter(a => a.status === 'approved').length === 0 && (
                    <div className="text-center py-8 text-gray-500">No awarded scholarships yet</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Distribution by Type</CardTitle>
              </CardHeader>
              <CardContent>
                {scholarshipsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {['merit', 'sports', 'need_based', 'diversity'].map((type) => {
                      const count = schList.filter(s => s.scholarship_type === type).reduce((sum, s) => sum + (s.used_slots || 0), 0);
                      const totalUsed = schList.reduce((sum, s) => sum + (s.used_slots || 0), 0);
                      const percentage = totalUsed > 0 ? (count / totalUsed) * 100 : 0;
                      return (
                        <div key={type} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              {getTypeIcon(type)}
                              <span className="capitalize">{type.replace('_', ' ')}</span>
                            </div>
                            <span>{count} ({percentage.toFixed(0)}%)</span>
                          </div>
                          <Progress value={percentage} className="h-2" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Budget Utilization</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="text-center py-4">
                    <div className="text-4xl font-bold text-primary">
                      {scholarshipsLoading ? '...' : `${totalBudget > 0 ? ((disbursedAmount / totalBudget) * 100).toFixed(0) : '0'}%`}
                    </div>
                    <p className="text-sm text-muted-foreground">of budget utilized</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-lg font-semibold">₹{(disbursedAmount / 100000).toFixed(1)}L</p>
                      <p className="text-xs text-muted-foreground">Disbursed</p>
                    </div>
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-lg font-semibold">₹{((totalBudget - disbursedAmount) / 100000).toFixed(1)}L</p>
                      <p className="text-xs text-muted-foreground">Remaining</p>
                    </div>
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

export default function ScholarshipsPage() {
  return (
    <AdmissionErrorBoundary>
      <ScholarshipsPageContent />
    </AdmissionErrorBoundary>
  );
}
