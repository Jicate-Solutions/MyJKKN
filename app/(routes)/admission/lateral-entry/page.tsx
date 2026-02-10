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
import { useAuth } from '@/hooks/use-auth';
import {
  useLateralEntryApplications,
  useEligibilityRules,
  useLateralEntryVacancies,
  useLateralEntryStats,
  useCreateLateralEntry,
  useUpdateLateralEntryStatus,
} from '@/hooks/admission/use-lateral-entry';
import type { LateralEntryApplication, EligibilityRule, LateralEntryVacancy } from '@/lib/services/admission/lateral-entry-service';

function LateralEntryPageContent() {
  const { profile, isLoading: authLoading } = useAuth();
  const institutionId = profile?.institution_id;

  const [activeTab, setActiveTab] = useState('applications');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [isNewApplicationOpen, setIsNewApplicationOpen] = useState(false);
  const [processingAppId, setProcessingAppId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    application_type: '',
    student_name: '',
    email: '',
    phone: '',
    current_institution: '',
    current_program: '',
    applied_program_name: '',
    academic_score: '',
  });

  // Real data hooks
  const { applications, isLoading: appsLoading, refetch: refetchApps } = useLateralEntryApplications({
    institutionId: institutionId || '',
    type: filterType !== 'all' ? filterType : undefined,
    search: searchTerm || undefined,
  });

  const { rules, isLoading: rulesLoading } = useEligibilityRules(institutionId || '');
  const { vacancies, isLoading: vacanciesLoading } = useLateralEntryVacancies(institutionId || '');
  const { stats, isLoading: statsLoading } = useLateralEntryStats(institutionId || '');

  const createMutation = useCreateLateralEntry();
  const updateStatusMutation = useUpdateLateralEntryStatus();

  // Stats from real data
  const totalApplications = stats?.total ?? 0;
  const lateralCount = stats?.lateralCount ?? 0;
  const branchTransferCount = stats?.branchTransferCount ?? 0;
  const approvedCount = stats?.approved ?? 0;
  const pendingCount = stats?.pending ?? 0;

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

  const handleCreateApplication = async () => {
    if (!institutionId) return;
    if (!formData.application_type || !formData.student_name || !formData.email) {
      toast.error('Please fill in required fields (type, name, email)');
      return;
    }

    createMutation.mutate(
      {
        institution_id: institutionId,
        application_type: formData.application_type,
        student_name: formData.student_name,
        email: formData.email,
        phone: formData.phone,
        current_institution: formData.current_institution,
        current_program: formData.current_program,
        applied_program_name: formData.applied_program_name,
        academic_score: formData.academic_score ? parseFloat(formData.academic_score) : undefined,
      },
      {
        onSuccess: () => {
          setIsNewApplicationOpen(false);
          setFormData({
            application_type: '',
            student_name: '',
            email: '',
            phone: '',
            current_institution: '',
            current_program: '',
            applied_program_name: '',
            academic_score: '',
          });
        },
      }
    );
  };

  const handleApprove = (appId: string) => {
    setProcessingAppId(appId);
    updateStatusMutation.mutate(
      { id: appId, status: 'approved' },
      { onSettled: () => setProcessingAppId(null) }
    );
  };

  const handleReject = (appId: string) => {
    setProcessingAppId(appId);
    updateStatusMutation.mutate(
      { id: appId, status: 'rejected' },
      { onSettled: () => setProcessingAppId(null) }
    );
  };

  const handleExport = () => {
    if (!applications.length) {
      toast.error('No applications to export');
      return;
    }
    const headers = ['Application #', 'Type', 'Student Name', 'Email', 'Phone', 'Current Institution', 'Current Program', 'Applied Program', 'Academic Score', 'Eligibility', 'Status', 'Applied Date'];
    const rows = applications.map((app: LateralEntryApplication) => [
      app.application_number,
      app.application_type,
      app.student_name,
      app.email,
      app.phone,
      app.current_institution,
      app.current_program,
      app.applied_program_name || '',
      app.academic_score ?? '',
      app.eligibility_status,
      app.application_status,
      app.created_at ? new Date(app.created_at).toLocaleDateString() : '',
    ]);
    const csvContent = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lateral-entry-applications-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Applications exported successfully');
  };

  if (authLoading) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!institutionId) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            No institution access found.
          </CardContent>
        </Card>
      </div>
    );
  }

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
          <Button variant="outline" size="sm" onClick={handleExport}>
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
                  <Select value={formData.application_type} onValueChange={(v) => setFormData(prev => ({ ...prev, application_type: v }))}>
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
                    <Input placeholder="Full name" value={formData.student_name} onChange={(e) => setFormData(prev => ({ ...prev, student_name: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" placeholder="email@example.com" value={formData.email} onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input placeholder="+91 98765 43210" value={formData.phone} onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Current Institution</Label>
                    <Input placeholder="Institution name" value={formData.current_institution} onChange={(e) => setFormData(prev => ({ ...prev, current_institution: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Current Program</Label>
                    <Input placeholder="e.g., Diploma in CS" value={formData.current_program} onChange={(e) => setFormData(prev => ({ ...prev, current_program: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Target Program</Label>
                    <Select value={formData.applied_program_name} onValueChange={(v) => setFormData(prev => ({ ...prev, applied_program_name: v }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select program" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="B.Tech Computer Science (2nd Year)">B.Tech Computer Science (2nd Year)</SelectItem>
                        <SelectItem value="B.Tech Electronics (2nd Year)">B.Tech Electronics (2nd Year)</SelectItem>
                        <SelectItem value="B.Tech Mechanical (2nd Year)">B.Tech Mechanical (2nd Year)</SelectItem>
                        <SelectItem value="B.Tech Electrical (2nd Year)">B.Tech Electrical (2nd Year)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Academic Score (%)</Label>
                  <Input type="number" placeholder="e.g., 75" value={formData.academic_score} onChange={(e) => setFormData(prev => ({ ...prev, academic_score: e.target.value }))} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsNewApplicationOpen(false)} disabled={createMutation.isPending}>Cancel</Button>
                <Button
                  onClick={handleCreateApplication}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? (
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
            <div className="text-2xl font-bold">{statsLoading ? '...' : totalApplications}</div>
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
            <div className="text-2xl font-bold">{statsLoading ? '...' : lateralCount}</div>
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
            <div className="text-2xl font-bold">{statsLoading ? '...' : branchTransferCount}</div>
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
            <div className="text-2xl font-bold text-yellow-600">{statsLoading ? '...' : pendingCount}</div>
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
              {appsLoading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : applications.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No applications found</p>
                  <p className="text-sm">Create a new application to get started</p>
                </div>
              ) : (
                <div className="divide-y">
                  {applications.map((app: LateralEntryApplication) => (
                    <div key={app.id} className="flex items-center justify-between p-4 hover:bg-muted/50">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          {getTypeIcon(app.application_type)}
                        </div>
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {app.student_name}
                            <Badge variant="outline" className="text-xs">
                              {app.application_number}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {app.current_program} → {app.applied_program_name || 'Not specified'}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                            <Building2 className="h-3 w-3" />
                            {app.current_institution}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm">Score: {app.academic_score ?? 'N/A'}%</p>
                          <p className="text-xs text-muted-foreground">
                            Applied: {app.created_at ? new Date(app.created_at).toLocaleDateString() : 'N/A'}
                          </p>
                        </div>
                        <div className="flex flex-col gap-1">
                          <Badge className={getStatusBadge(app.application_status)}>
                            {app.application_status.replace(/_/g, ' ')}
                          </Badge>
                          {!app.documents_uploaded && (
                            <Badge variant="outline" className="text-xs text-yellow-600">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Docs missing
                            </Badge>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => toast.info(`Application: ${app.application_number}`)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {app.application_status === 'under_review' && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-green-600"
                                disabled={processingAppId === app.id}
                                onClick={() => handleApprove(app.id)}
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
                                onClick={() => handleReject(app.id)}
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
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="eligibility" className="space-y-4">
          {rulesLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rules.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No eligibility rules configured</p>
                <p className="text-sm">Configure rules to auto-verify applicant eligibility</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {rules.map((rule: EligibilityRule) => (
                <Card key={rule.id}>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      {rule.rule_type === 'lateral_entry' && <ArrowRightLeft className="h-5 w-5 text-blue-500" />}
                      {rule.rule_type === 'branch_transfer' && <GitBranch className="h-5 w-5 text-purple-500" />}
                      {rule.rule_type === 'iti_lateral' && <GraduationCap className="h-5 w-5 text-green-500" />}
                      {!['lateral_entry', 'branch_transfer', 'iti_lateral'].includes(rule.rule_type) && <GraduationCap className="h-5 w-5 text-gray-500" />}
                      <CardTitle className="text-lg">{rule.title}</CardTitle>
                    </div>
                    <CardDescription>Target: {rule.target_year}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {(rule.requirements || []).map((req: { field: string; value: string }, idx: number) => (
                        <li key={idx} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <span>{req.value || req.field}</span>
                        </li>
                      ))}
                      {rule.required_documents && rule.required_documents.length > 0 && (
                        <li className="flex items-start gap-2 text-sm">
                          <FileText className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                          <span>Documents: {rule.required_documents.join(', ')}</span>
                        </li>
                      )}
                      {rule.min_score != null && (
                        <li className="flex items-start gap-2 text-sm">
                          <BarChart3 className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
                          <span>Minimum score: {rule.min_score}%</span>
                        </li>
                      )}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="vacancies" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Available Seats for Lateral Entry</CardTitle>
              <CardDescription>Branch-wise vacancy for lateral admission</CardDescription>
            </CardHeader>
            <CardContent>
              {vacanciesLoading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : vacancies.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No vacancy data available</p>
                  <p className="text-sm">Configure seat vacancies for lateral entry programs</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {vacancies.map((v: LateralEntryVacancy) => {
                    const vacancyPercent = v.total_intake > 0 ? (v.lateral_entry_seats / v.total_intake) * 100 : 0;
                    return (
                      <div key={v.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-4">
                          <BookOpen className="h-5 w-5 text-primary" />
                          <div>
                            <p className="font-medium">{v.program_name}</p>
                            <p className="text-sm text-muted-foreground">
                              {v.regular_filled}/{v.regular_seats} regular seats filled
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-lg font-bold text-green-600">{v.available_lateral}</p>
                            <p className="text-xs text-muted-foreground">Available lateral</p>
                          </div>
                          <Progress value={vacancyPercent} className="w-24" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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
                    {totalApplications > 0 ? ((approvedCount / totalApplications) * 100).toFixed(0) : '0'}%
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
