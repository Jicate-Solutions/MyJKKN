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
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowRightLeft,
  GitBranch,
  Users,
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
  Upload,
  AlertCircle,
  ArrowRight,
  Building2,
  BookOpen,
  Calendar,
  User,
  Mail,
  Phone,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { AdmissionErrorBoundary } from '@/components/admission';

// Mock data for lateral entry applications
const mockApplications = [
  {
    id: 'LE-2026-001',
    studentName: 'Amit Kumar',
    email: 'amit.kumar@email.com',
    phone: '+91 98765 43210',
    currentInstitution: 'Polytechnic College, Chennai',
    currentProgram: 'Diploma in Computer Science',
    currentYear: '3rd Year',
    appliedProgram: 'B.Tech Computer Science (2nd Year)',
    eligibilityStatus: 'eligible',
    academicScore: 78,
    documentsUploaded: true,
    applicationDate: '2026-01-10',
    status: 'under_review',
    type: 'lateral_entry'
  },
  {
    id: 'LE-2026-002',
    studentName: 'Sneha Reddy',
    email: 'sneha.reddy@email.com',
    phone: '+91 98765 43211',
    currentInstitution: 'ABC Engineering College',
    currentProgram: 'B.Tech ECE (1st Year)',
    currentYear: '1st Year',
    appliedProgram: 'B.Tech CSE (1st Year)',
    eligibilityStatus: 'eligible',
    academicScore: 85,
    documentsUploaded: true,
    applicationDate: '2026-01-12',
    status: 'approved',
    type: 'branch_transfer'
  },
  {
    id: 'LE-2026-003',
    studentName: 'Vikram Singh',
    email: 'vikram.singh@email.com',
    phone: '+91 98765 43212',
    currentInstitution: 'ITI, Coimbatore',
    currentProgram: 'ITI Electrician',
    currentYear: 'Completed',
    appliedProgram: 'B.Tech Electrical (2nd Year)',
    eligibilityStatus: 'pending_verification',
    academicScore: 72,
    documentsUploaded: false,
    applicationDate: '2026-01-14',
    status: 'documents_pending',
    type: 'lateral_entry'
  },
  {
    id: 'BT-2026-001',
    studentName: 'Priya Sharma',
    email: 'priya.sharma@email.com',
    phone: '+91 98765 43213',
    currentInstitution: 'JKKN College of Engineering',
    currentProgram: 'B.Tech Mechanical (2nd Year)',
    currentYear: '2nd Year',
    appliedProgram: 'B.Tech Mechatronics (2nd Year)',
    eligibilityStatus: 'eligible',
    academicScore: 82,
    documentsUploaded: true,
    applicationDate: '2026-01-08',
    status: 'under_review',
    type: 'branch_transfer'
  }
];

const eligibilityRules = [
  {
    type: 'lateral_entry',
    title: 'Lateral Entry (Diploma Holders)',
    requirements: [
      'Diploma in relevant branch with 60%+',
      'No backlog at time of admission',
      'State-level entrance exam clearance (if applicable)',
      'Transfer Certificate from previous institution'
    ],
    targetYear: '2nd Year B.Tech'
  },
  {
    type: 'branch_transfer',
    title: 'Branch Transfer (Within Institution)',
    requirements: [
      'Completed 1st year with 70%+ CGPA',
      'No disciplinary issues',
      'Vacancy in target branch',
      'NOC from current department'
    ],
    targetYear: 'Same year, different branch'
  },
  {
    type: 'iti_lateral',
    title: 'ITI Lateral Entry',
    requirements: [
      'ITI with 2 years National/State Trade Certificate',
      'Passed 10th with Science and Math',
      'Relevant trade for engineering branch',
      'Age limit: Below 25 years'
    ],
    targetYear: '2nd Year B.Tech'
  }
];

function LateralEntryPageContent() {
  const [activeTab, setActiveTab] = useState('applications');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [isNewApplicationOpen, setIsNewApplicationOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [processingAppId, setProcessingAppId] = useState<string | null>(null);

  const totalApplications = mockApplications.length;
  const lateralCount = mockApplications.filter(a => a.type === 'lateral_entry').length;
  const branchTransferCount = mockApplications.filter(a => a.type === 'branch_transfer').length;
  const approvedCount = mockApplications.filter(a => a.status === 'approved').length;
  const pendingCount = mockApplications.filter(a => a.status === 'under_review' || a.status === 'documents_pending').length;

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      approved: 'bg-green-100 text-green-800',
      under_review: 'bg-blue-100 text-blue-800',
      documents_pending: 'bg-yellow-100 text-yellow-800',
      rejected: 'bg-red-100 text-red-800',
      eligible: 'bg-green-100 text-green-800',
      pending_verification: 'bg-yellow-100 text-yellow-800',
      not_eligible: 'bg-red-100 text-red-800'
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'lateral_entry': return <ArrowRightLeft className="h-4 w-4 text-blue-500" />;
      case 'branch_transfer': return <GitBranch className="h-4 w-4 text-purple-500" />;
      default: return <GraduationCap className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ArrowRightLeft className="h-6 w-6 text-blue-500" />
            Lateral Entry & Branch Transfer
          </h1>
          <p className="text-muted-foreground">Manage non-fresh admissions and internal transfers</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => toast.success('Applications exported successfully')}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Dialog open={isNewApplicationOpen} onOpenChange={setIsNewApplicationOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                New Application
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>New Lateral Entry / Transfer Application</DialogTitle>
                <DialogDescription>Enter student details and verify eligibility</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>Application Type</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lateral_entry">Lateral Entry (Diploma/ITI)</SelectItem>
                      <SelectItem value="branch_transfer">Branch Transfer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Student Name</Label>
                    <Input placeholder="Full name" />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" placeholder="email@example.com" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input placeholder="+91 98765 43210" />
                  </div>
                  <div className="space-y-2">
                    <Label>Current Institution</Label>
                    <Input placeholder="Institution name" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Current Program</Label>
                    <Input placeholder="e.g., Diploma in CS" />
                  </div>
                  <div className="space-y-2">
                    <Label>Target Program</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select program" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="btech_cse">B.Tech Computer Science (2nd Year)</SelectItem>
                        <SelectItem value="btech_ece">B.Tech Electronics (2nd Year)</SelectItem>
                        <SelectItem value="btech_mech">B.Tech Mechanical (2nd Year)</SelectItem>
                        <SelectItem value="btech_eee">B.Tech Electrical (2nd Year)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Academic Score (%)</Label>
                  <Input type="number" placeholder="e.g., 75" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsNewApplicationOpen(false)} disabled={isSubmitting}>Cancel</Button>
                <Button
                  onClick={async () => {
                    setIsSubmitting(true);
                    // Simulate async operation
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    toast.success('Application submitted successfully');
                    setIsSubmitting(false);
                    setIsNewApplicationOpen(false);
                  }}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Check Eligibility & Submit
                    </>
                  )}
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
            <CardTitle className="text-sm font-medium">Total Applications</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalApplications}</div>
            <p className="text-xs text-muted-foreground">
              This admission cycle
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Lateral Entry</CardTitle>
            <ArrowRightLeft className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lateralCount}</div>
            <p className="text-xs text-muted-foreground">
              Diploma/ITI candidates
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Branch Transfer</CardTitle>
            <GitBranch className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{branchTransferCount}</div>
            <p className="text-xs text-muted-foreground">
              Internal transfers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
            <p className="text-xs text-muted-foreground">
              Awaiting decision
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="applications">Applications</TabsTrigger>
          <TabsTrigger value="eligibility">Eligibility Rules</TabsTrigger>
          <TabsTrigger value="vacancies">Seat Vacancies</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="applications" className="space-y-4">
          {/* Filters */}
          <div className="flex gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search applications..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="lateral_entry">Lateral Entry</SelectItem>
                <SelectItem value="branch_transfer">Branch Transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Applications List */}
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {mockApplications.map((app) => (
                  <div key={app.id} className="flex items-center justify-between p-4 hover:bg-muted/50">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        {getTypeIcon(app.type)}
                      </div>
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {app.studentName}
                          <Badge variant="outline" className="text-xs">
                            {app.id}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {app.currentProgram} → {app.appliedProgram}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                          <Building2 className="h-3 w-3" />
                          {app.currentInstitution}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm">Score: {app.academicScore}%</p>
                        <p className="text-xs text-muted-foreground">
                          Applied: {app.applicationDate}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Badge className={getStatusBadge(app.status)}>
                          {app.status.replace('_', ' ')}
                        </Badge>
                        {!app.documentsUploaded && (
                          <Badge variant="outline" className="text-xs text-yellow-600">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Docs missing
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => toast.success('Loading application details')}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {app.status === 'under_review' && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-green-600"
                              disabled={processingAppId === app.id}
                              onClick={async () => {
                                setProcessingAppId(app.id);
                                await new Promise(resolve => setTimeout(resolve, 1000));
                                toast.success('Application approved successfully');
                                setProcessingAppId(null);
                              }}
                            >
                              {processingAppId === app.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600"
                              disabled={processingAppId === app.id}
                              onClick={async () => {
                                setProcessingAppId(app.id);
                                await new Promise(resolve => setTimeout(resolve, 1000));
                                toast.error('Application rejected');
                                setProcessingAppId(null);
                              }}
                            >
                              {processingAppId === app.id ? (
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

        <TabsContent value="eligibility" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {eligibilityRules.map((rule, index) => (
              <Card key={index}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    {rule.type === 'lateral_entry' && <ArrowRightLeft className="h-5 w-5 text-blue-500" />}
                    {rule.type === 'branch_transfer' && <GitBranch className="h-5 w-5 text-purple-500" />}
                    {rule.type === 'iti_lateral' && <GraduationCap className="h-5 w-5 text-green-500" />}
                    <CardTitle className="text-lg">{rule.title}</CardTitle>
                  </div>
                  <CardDescription>Target: {rule.targetYear}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {rule.requirements.map((req, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span>{req}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="vacancies" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Available Seats for Lateral Entry</CardTitle>
              <CardDescription>Branch-wise vacancy for 2nd year admission</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { branch: 'B.Tech Computer Science', total: 120, filled: 108, lateral: 10 },
                  { branch: 'B.Tech Electronics', total: 60, filled: 52, lateral: 6 },
                  { branch: 'B.Tech Mechanical', total: 60, filled: 48, lateral: 6 },
                  { branch: 'B.Tech Electrical', total: 60, filled: 55, lateral: 4 },
                  { branch: 'B.Tech Civil', total: 60, filled: 42, lateral: 6 }
                ].map((branch, index) => {
                  const vacancyPercent = ((branch.lateral) / branch.total) * 100;
                  return (
                    <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <BookOpen className="h-5 w-5 text-primary" />
                        <div>
                          <p className="font-medium">{branch.branch}</p>
                          <p className="text-sm text-muted-foreground">
                            {branch.filled}/{branch.total} regular seats filled
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-lg font-bold text-green-600">{branch.lateral}</p>
                          <p className="text-xs text-muted-foreground">Lateral seats</p>
                        </div>
                        <Progress value={vacancyPercent} className="w-24" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Application Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>Lateral Entry</span>
                    <span className="font-bold">{lateralCount}</span>
                  </div>
                  <Progress value={totalApplications > 0 ? (lateralCount / totalApplications) * 100 : 0} className="h-2" />
                  <div className="flex justify-between items-center">
                    <span>Branch Transfer</span>
                    <span className="font-bold">{branchTransferCount}</span>
                  </div>
                  <Progress value={totalApplications > 0 ? (branchTransferCount / totalApplications) * 100 : 0} className="h-2" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Conversion Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-4">
                  <div className="text-4xl font-bold text-green-600">
                    {((approvedCount / totalApplications) * 100).toFixed(0)}%
                  </div>
                  <p className="text-sm text-muted-foreground">Applications approved</p>
                </div>
                <div className="grid grid-cols-2 gap-4 text-center mt-4">
                  <div className="p-3 bg-green-50 rounded-lg">
                    <p className="text-lg font-semibold text-green-600">{approvedCount}</p>
                    <p className="text-xs text-muted-foreground">Approved</p>
                  </div>
                  <div className="p-3 bg-yellow-50 rounded-lg">
                    <p className="text-lg font-semibold text-yellow-600">{pendingCount}</p>
                    <p className="text-xs text-muted-foreground">Pending</p>
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

export default function LateralEntryPage() {
  return (
    <AdmissionErrorBoundary>
      <LateralEntryPageContent />
    </AdmissionErrorBoundary>
  );
}
