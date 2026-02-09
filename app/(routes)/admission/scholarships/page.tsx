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
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Award,
  Trophy,
  Users,
  DollarSign,
  Percent,
  GraduationCap,
  Search,
  Filter,
  Plus,
  Download,
  Settings,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  BarChart3,
  FileText,
  Eye,
  Edit,
  Trash2,
  Star,
  Target,
  TrendingUp,
  Sparkles,
  IndianRupee,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { AdmissionErrorBoundary } from '@/components/admission';

// Mock data for scholarships
const mockScholarships = [
  {
    id: 'SCH-001',
    name: 'Merit Excellence Scholarship',
    type: 'merit',
    amount: 100000,
    percentDiscount: 50,
    isPercentage: true,
    eligibilityCriteria: { minScore: 90, minAttendance: 95 },
    totalSlots: 20,
    usedSlots: 12,
    status: 'active',
    programs: ['B.Tech', 'M.Tech'],
    applicationsCount: 45,
    awardedCount: 12,
    description: 'For students with exceptional academic performance'
  },
  {
    id: 'SCH-002',
    name: 'Sports Achievement Award',
    type: 'sports',
    amount: 50000,
    percentDiscount: 25,
    isPercentage: false,
    eligibilityCriteria: { sportLevel: 'state', minScore: 60 },
    totalSlots: 15,
    usedSlots: 8,
    status: 'active',
    programs: ['All Programs'],
    applicationsCount: 28,
    awardedCount: 8,
    description: 'For state/national level sports achievers'
  },
  {
    id: 'SCH-003',
    name: 'Need-Based Financial Aid',
    type: 'need_based',
    amount: 75000,
    percentDiscount: 40,
    isPercentage: true,
    eligibilityCriteria: { maxIncome: 300000, minScore: 70 },
    totalSlots: 50,
    usedSlots: 35,
    status: 'active',
    programs: ['All Programs'],
    applicationsCount: 120,
    awardedCount: 35,
    description: 'For students from economically weaker sections'
  },
  {
    id: 'SCH-004',
    name: 'Women in STEM Scholarship',
    type: 'diversity',
    amount: 60000,
    percentDiscount: 30,
    isPercentage: true,
    eligibilityCriteria: { gender: 'female', minScore: 75, programs: ['B.Tech', 'M.Tech'] },
    totalSlots: 25,
    usedSlots: 18,
    status: 'active',
    programs: ['B.Tech', 'M.Tech'],
    applicationsCount: 55,
    awardedCount: 18,
    description: 'Encouraging women participation in STEM fields'
  }
];

const mockApplications = [
  {
    id: 'SA-001',
    studentName: 'Priya Sharma',
    studentId: 'STU-2026-001',
    scholarshipId: 'SCH-001',
    scholarshipName: 'Merit Excellence Scholarship',
    appliedDate: '2026-01-10',
    status: 'approved',
    academicScore: 94,
    documentsUploaded: true,
    reviewedBy: 'Dr. Anil Kumar',
    approvedAmount: 100000
  },
  {
    id: 'SA-002',
    studentName: 'Rahul Kumar',
    studentId: 'STU-2026-002',
    scholarshipId: 'SCH-002',
    scholarshipName: 'Sports Achievement Award',
    appliedDate: '2026-01-12',
    status: 'pending',
    academicScore: 78,
    documentsUploaded: true,
    reviewedBy: null,
    approvedAmount: null
  },
  {
    id: 'SA-003',
    studentName: 'Ananya Patel',
    studentId: 'STU-2026-003',
    scholarshipId: 'SCH-003',
    scholarshipName: 'Need-Based Financial Aid',
    appliedDate: '2026-01-08',
    status: 'under_review',
    academicScore: 82,
    documentsUploaded: true,
    reviewedBy: 'Mrs. Lakshmi R',
    approvedAmount: null
  },
  {
    id: 'SA-004',
    studentName: 'Vikram Singh',
    studentId: 'STU-2026-004',
    scholarshipId: 'SCH-001',
    scholarshipName: 'Merit Excellence Scholarship',
    appliedDate: '2026-01-11',
    status: 'rejected',
    academicScore: 85,
    documentsUploaded: false,
    reviewedBy: 'Dr. Anil Kumar',
    approvedAmount: null,
    rejectionReason: 'Incomplete documentation'
  }
];

function ScholarshipsPageContent() {
  const [activeTab, setActiveTab] = useState('scholarships');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const totalBudget = 5000000; // 50 Lakhs
  const disbursedAmount = mockScholarships.reduce((sum, s) => sum + (s.usedSlots * s.amount), 0);
  const totalApplications = mockScholarships.reduce((sum, s) => sum + s.applicationsCount, 0);
  const totalAwarded = mockScholarships.reduce((sum, s) => sum + s.awardedCount, 0);

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
                    <Label>Amount (₹) or Percentage</Label>
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
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
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
            <div className="text-2xl font-bold">₹50,00,000</div>
            <Progress value={totalBudget > 0 ? (disbursedAmount / totalBudget) * 100 : 0} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              ₹{(disbursedAmount / 100000).toFixed(1)}L disbursed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Applications</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalApplications}</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-yellow-600">{mockApplications.filter(a => a.status === 'pending').length} pending review</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Scholarships Awarded</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAwarded}</div>
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
            <div className="text-2xl font-bold">{mockScholarships.filter(s => s.status === 'active').length}</div>
            <p className="text-xs text-muted-foreground">
              {mockScholarships.reduce((sum, s) => sum + (s.totalSlots - s.usedSlots), 0)} slots remaining
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mockScholarships.map((scholarship) => (
              <Card key={scholarship.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      {getTypeIcon(scholarship.type)}
                      <CardTitle className="text-lg">{scholarship.name}</CardTitle>
                    </div>
                    <Badge className={getStatusBadge(scholarship.status)}>
                      {scholarship.status}
                    </Badge>
                  </div>
                  <CardDescription>{scholarship.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Amount</p>
                      <p className="font-semibold">
                        {scholarship.isPercentage
                          ? `${scholarship.percentDiscount}% discount`
                          : `₹${scholarship.amount.toLocaleString()}`
                        }
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Programs</p>
                      <p className="font-semibold">{scholarship.programs.join(', ')}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Applications</p>
                      <p className="font-semibold">{scholarship.applicationsCount}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Awarded</p>
                      <p className="font-semibold">{scholarship.awardedCount} / {scholarship.totalSlots}</p>
                    </div>
                  </div>
                  <Progress
                    value={scholarship.totalSlots > 0 ? (scholarship.usedSlots / scholarship.totalSlots) * 100 : 0}
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
          </div>
        </TabsContent>

        <TabsContent value="applications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Scholarship Applications</CardTitle>
              <CardDescription>Review and process student scholarship applications</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockApplications.map((app) => (
                  <div key={app.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <GraduationCap className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{app.studentName}</p>
                        <p className="text-sm text-muted-foreground">{app.scholarshipName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm">Score: {app.academicScore}%</p>
                        <p className="text-xs text-muted-foreground">Applied: {app.appliedDate}</p>
                      </div>
                      <Badge className={getStatusBadge(app.status)}>
                        {app.status.replace('_', ' ')}
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
                                await new Promise(resolve => setTimeout(resolve, 800)); // Simulate API call
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
                                await new Promise(resolve => setTimeout(resolve, 800)); // Simulate API call
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
              </div>
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
              <div className="space-y-4">
                {mockApplications.filter(a => a.status === 'approved').map((app) => (
                  <div key={app.id} className="flex items-center justify-between p-4 border rounded-lg bg-green-50">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                        <Trophy className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium">{app.studentName}</p>
                        <p className="text-sm text-muted-foreground">{app.scholarshipName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-semibold text-green-600">₹{app.approvedAmount?.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">Reviewed by: {app.reviewedBy}</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => toast.success('Scholarship certificate downloaded')}>
                        <FileText className="h-4 w-4 mr-1" />
                        Certificate
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
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
                <div className="space-y-4">
                  {['merit', 'sports', 'need_based', 'diversity'].map((type) => {
                    const count = mockScholarships.filter(s => s.type === type).reduce((sum, s) => sum + s.awardedCount, 0);
                    const percentage = totalAwarded > 0 ? (count / totalAwarded) * 100 : 0;
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
                      {totalBudget > 0 ? ((disbursedAmount / totalBudget) * 100).toFixed(0) : '0'}%
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
