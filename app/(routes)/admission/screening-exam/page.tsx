'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  BookOpen,
  FileQuestion,
  Clock,
  Users,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Settings,
  Play,
  Pause,
  Square,
  Eye,
  Download,
  Mail,
  BarChart3,
  PieChart,
  TrendingUp,
  Target,
  Shield,
  Calendar,
  Timer,
  Trophy,
  Search,
  Filter,
  Plus,
  Edit,
  Trash2,
  Copy,
  RefreshCw,
  Monitor,
  Smartphone,
  Video,
  AlertCircle,
  Send,
  FileText,
  ListChecks,
  Percent,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { AdmissionErrorBoundary } from '@/components/admission';

// Mock data for exams
const mockExams = [
  {
    id: 'EX-2026-001',
    name: 'B.Tech Entrance Exam 2026',
    program: 'B.Tech',
    status: 'active',
    scheduledDate: '2026-01-20',
    duration: 180, // minutes
    totalQuestions: 100,
    sections: [
      { name: 'Mathematics', questions: 30, marks: 30, cutoff: 12 },
      { name: 'Physics', questions: 25, marks: 25, cutoff: 10 },
      { name: 'Chemistry', questions: 25, marks: 25, cutoff: 10 },
      { name: 'English', questions: 10, marks: 10, cutoff: 4 },
      { name: 'Logical Reasoning', questions: 10, marks: 10, cutoff: 4 }
    ],
    totalMarks: 100,
    passingScore: 40,
    negativeMarking: true,
    negativeMarkValue: 0.25,
    registeredCandidates: 245,
    completedCandidates: 198,
    qualifiedCandidates: 156
  },
  {
    id: 'EX-2026-002',
    name: 'MBA Aptitude Test 2026',
    program: 'MBA',
    status: 'scheduled',
    scheduledDate: '2026-01-25',
    duration: 120,
    totalQuestions: 80,
    sections: [
      { name: 'Quantitative Ability', questions: 25, marks: 25, cutoff: 10 },
      { name: 'Data Interpretation', questions: 20, marks: 20, cutoff: 8 },
      { name: 'Verbal Ability', questions: 20, marks: 20, cutoff: 8 },
      { name: 'General Awareness', questions: 15, marks: 15, cutoff: 6 }
    ],
    totalMarks: 80,
    passingScore: 32,
    negativeMarking: true,
    negativeMarkValue: 0.33,
    registeredCandidates: 156,
    completedCandidates: 0,
    qualifiedCandidates: 0
  }
];

// Mock candidate results
const mockResults = [
  {
    id: 'APP-2026-001',
    name: 'Priya Sharma',
    email: 'priya.sharma@email.com',
    examId: 'EX-2026-001',
    status: 'completed',
    totalScore: 78,
    sectionScores: { Mathematics: 26, Physics: 22, Chemistry: 18, English: 8, 'Logical Reasoning': 4 },
    qualified: true,
    percentile: 92.5,
    rank: 12,
    timeTaken: 165,
    proctoringFlags: 0,
    submittedAt: '2026-01-20T11:45:00'
  },
  {
    id: 'APP-2026-002',
    name: 'Rahul Kumar',
    email: 'rahul.kumar@email.com',
    examId: 'EX-2026-001',
    status: 'completed',
    totalScore: 72,
    sectionScores: { Mathematics: 24, Physics: 20, Chemistry: 16, English: 7, 'Logical Reasoning': 5 },
    qualified: true,
    percentile: 88.2,
    rank: 28,
    timeTaken: 175,
    proctoringFlags: 1,
    submittedAt: '2026-01-20T11:52:00'
  },
  {
    id: 'APP-2026-003',
    name: 'Ananya Patel',
    email: 'ananya.patel@email.com',
    examId: 'EX-2026-001',
    status: 'completed',
    totalScore: 65,
    sectionScores: { Mathematics: 20, Physics: 18, Chemistry: 15, English: 8, 'Logical Reasoning': 4 },
    qualified: true,
    percentile: 78.5,
    rank: 56,
    timeTaken: 178,
    proctoringFlags: 0,
    submittedAt: '2026-01-20T11:58:00'
  },
  {
    id: 'APP-2026-004',
    name: 'Mohammed Arif',
    email: 'mohammed.arif@email.com',
    examId: 'EX-2026-001',
    status: 'completed',
    totalScore: 35,
    sectionScores: { Mathematics: 10, Physics: 8, Chemistry: 8, English: 5, 'Logical Reasoning': 4 },
    qualified: false,
    percentile: 32.1,
    rank: 145,
    timeTaken: 180,
    proctoringFlags: 0,
    submittedAt: '2026-01-20T12:00:00'
  },
  {
    id: 'APP-2026-005',
    name: 'Sneha Reddy',
    email: 'sneha.reddy@email.com',
    examId: 'EX-2026-001',
    status: 'in_progress',
    totalScore: 0,
    sectionScores: {},
    qualified: false,
    percentile: 0,
    rank: 0,
    timeTaken: 45,
    proctoringFlags: 2,
    submittedAt: null
  },
  {
    id: 'APP-2026-006',
    name: 'Vikram Singh',
    email: 'vikram.singh@email.com',
    examId: 'EX-2026-001',
    status: 'not_started',
    totalScore: 0,
    sectionScores: {},
    qualified: false,
    percentile: 0,
    rank: 0,
    timeTaken: 0,
    proctoringFlags: 0,
    submittedAt: null
  }
];

function ScreeningExamPageContent() {
  const [activeTab, setActiveTab] = useState('exams');
  const [selectedExam, setSelectedExam] = useState<string | null>('EX-2026-001');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isCreateExamDialogOpen, setIsCreateExamDialogOpen] = useState(false);
  const [isCutoffDialogOpen, setIsCutoffDialogOpen] = useState(false);
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);

  // Loading states
  const [isCreatingExam, setIsCreatingExam] = useState(false);
  const [isSavingCutoffs, setIsSavingCutoffs] = useState(false);
  const [isStartingExam, setIsStartingExam] = useState(false);
  const [isPausingExam, setIsPausingExam] = useState(false);
  const [isEndingExam, setIsEndingExam] = useState(false);
  const [isSendingResults, setIsSendingResults] = useState(false);
  const [isExportingResults, setIsExportingResults] = useState(false);

  const currentExam = mockExams.find(e => e.id === selectedExam) || mockExams[0];

  // Filter results based on selected exam
  const examResults = mockResults.filter(r => r.examId === selectedExam);
  const filteredResults = examResults.filter(result => {
    const matchesSearch = result.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          result.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || result.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Stats
  const completedCount = examResults.filter(r => r.status === 'completed').length;
  const qualifiedCount = examResults.filter(r => r.qualified).length;
  const inProgressCount = examResults.filter(r => r.status === 'in_progress').length;
  const notStartedCount = examResults.filter(r => r.status === 'not_started').length;
  const avgScore = examResults.filter(r => r.status === 'completed').reduce((acc, r) => acc + r.totalScore, 0) / (completedCount || 1);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-700 border-green-200">Completed</Badge>;
      case 'in_progress':
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200">In Progress</Badge>;
      case 'not_started':
        return <Badge className="bg-gray-100 text-gray-700 border-gray-200">Not Started</Badge>;
      case 'disqualified':
        return <Badge className="bg-red-100 text-red-700 border-red-200">Disqualified</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-700">{status}</Badge>;
    }
  };

  const getExamStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-700 border-green-200">Live</Badge>;
      case 'scheduled':
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Scheduled</Badge>;
      case 'completed':
        return <Badge className="bg-gray-100 text-gray-700 border-gray-200">Completed</Badge>;
      case 'draft':
        return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">Draft</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getQualifiedBadge = (qualified: boolean, status: string) => {
    if (status !== 'completed') return null;
    return qualified ? (
      <Badge className="bg-green-100 text-green-700">Qualified</Badge>
    ) : (
      <Badge className="bg-red-100 text-red-700">Not Qualified</Badge>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-7 w-7 text-primary" />
            Screening Online Exam
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage entrance exams, cutoffs, and candidate results
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => {
            setIsCutoffDialogOpen(true);
            toast.info('Opening cutoff settings');
          }}>
            <Target className="mr-2 h-4 w-4" />
            Set Cutoffs
          </Button>
          <Button onClick={() => {
            setIsCreateExamDialogOpen(true);
            toast.info('Opening exam creation form');
          }}>
            <Plus className="mr-2 h-4 w-4" />
            Create Exam
          </Button>
        </div>
      </div>

      {/* Exam Selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <Select value={selectedExam || ''} onValueChange={setSelectedExam}>
              <SelectTrigger className="w-[350px]">
                <SelectValue placeholder="Select an exam" />
              </SelectTrigger>
              <SelectContent>
                {mockExams.map((exam) => (
                  <SelectItem key={exam.id} value={exam.id}>
                    <div className="flex items-center gap-2">
                      <span>{exam.name}</span>
                      {getExamStatusBadge(exam.status)}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>{format(new Date(currentExam.scheduledDate), 'MMM dd, yyyy')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4" />
                <span>{currentExam.duration} mins</span>
              </div>
              <div className="flex items-center gap-2">
                <FileQuestion className="h-4 w-4" />
                <span>{currentExam.totalQuestions} questions</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Registered</p>
                <p className="text-2xl font-bold">{currentExam.registeredCandidates}</p>
              </div>
              <Users className="h-8 w-8 text-blue-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold text-green-600">{completedCount}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">In Progress</p>
                <p className="text-2xl font-bold text-blue-600">{inProgressCount}</p>
              </div>
              <Clock className="h-8 w-8 text-blue-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Qualified</p>
                <p className="text-2xl font-bold text-purple-600">{qualifiedCount}</p>
              </div>
              <Trophy className="h-8 w-8 text-purple-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg. Score</p>
                <p className="text-2xl font-bold text-primary">{avgScore.toFixed(1)}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-primary opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
          <TabsTrigger value="exams">
            <ListChecks className="mr-2 h-4 w-4" />
            Exam Details
          </TabsTrigger>
          <TabsTrigger value="results">
            <FileText className="mr-2 h-4 w-4" />
            Results
          </TabsTrigger>
          <TabsTrigger value="proctoring">
            <Shield className="mr-2 h-4 w-4" />
            Proctoring
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <BarChart3 className="mr-2 h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        {/* Exam Details Tab */}
        <TabsContent value="exams" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Exam Info */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{currentExam.name}</CardTitle>
                    <CardDescription>Exam configuration and sections</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => {
                    toast.info('Opening exam editor');
                  }}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground">Total Questions</p>
                    <p className="text-xl font-bold">{currentExam.totalQuestions}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground">Total Marks</p>
                    <p className="text-xl font-bold">{currentExam.totalMarks}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground">Passing Score</p>
                    <p className="text-xl font-bold">{currentExam.passingScore}%</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground">Negative Marking</p>
                    <p className="text-xl font-bold">
                      {currentExam.negativeMarking ? `-${currentExam.negativeMarkValue}` : 'No'}
                    </p>
                  </div>
                </div>

                {/* Sections */}
                <div className="space-y-3">
                  <h4 className="font-medium">Exam Sections</h4>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="p-3 text-left text-sm font-medium">Section</th>
                          <th className="p-3 text-center text-sm font-medium">Questions</th>
                          <th className="p-3 text-center text-sm font-medium">Marks</th>
                          <th className="p-3 text-center text-sm font-medium">Cutoff</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentExam.sections.map((section) => (
                          <tr key={section.name} className="border-t">
                            <td className="p-3 font-medium">{section.name}</td>
                            <td className="p-3 text-center">{section.questions}</td>
                            <td className="p-3 text-center">{section.marks}</td>
                            <td className="p-3 text-center">
                              <Badge variant="outline">{section.cutoff}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    disabled={isStartingExam}
                    onClick={async () => {
                      setIsStartingExam(true);
                      try {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        toast.success('Exam started successfully');
                      } finally {
                        setIsStartingExam(false);
                      }
                    }}
                  >
                    {isStartingExam ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="mr-2 h-4 w-4 text-green-600" />
                    )}
                    Start Exam
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    disabled={isPausingExam}
                    onClick={async () => {
                      setIsPausingExam(true);
                      try {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        toast.warning('Exam paused');
                      } finally {
                        setIsPausingExam(false);
                      }
                    }}
                  >
                    {isPausingExam ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Pause className="mr-2 h-4 w-4 text-yellow-600" />
                    )}
                    Pause Exam
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    disabled={isEndingExam}
                    onClick={async () => {
                      setIsEndingExam(true);
                      try {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        toast.success('Exam ended successfully');
                      } finally {
                        setIsEndingExam(false);
                      }
                    }}
                  >
                    {isEndingExam ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Square className="mr-2 h-4 w-4 text-red-600" />
                    )}
                    End Exam
                  </Button>
                  <Button variant="outline" className="w-full justify-start" onClick={() => {
                    toast.success('Results recalculated successfully');
                  }}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Recalculate Results
                  </Button>
                  <Button variant="outline" className="w-full justify-start" onClick={() => {
                    toast.success('Results exported successfully');
                  }}>
                    <Download className="mr-2 h-4 w-4" />
                    Export Results
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Live Monitoring</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-2 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <Monitor className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">Desktop</span>
                      </div>
                      <span className="font-bold">145</span>
                    </div>
                    <div className="flex items-center justify-between p-2 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <Smartphone className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">Mobile</span>
                      </div>
                      <span className="font-bold">53</span>
                    </div>
                    <div className="flex items-center justify-between p-2 border rounded-lg bg-red-50">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-red-600" />
                        <span className="text-sm text-red-700">Flagged</span>
                      </div>
                      <span className="font-bold text-red-700">5</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Results Tab */}
        <TabsContent value="results" className="mt-6">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <CardTitle>Candidate Results</CardTitle>
                  <CardDescription>View and manage exam results</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isSendingResults}
                    onClick={async () => {
                      setIsSendingResults(true);
                      try {
                        await new Promise(resolve => setTimeout(resolve, 1500));
                        toast.success('Results sent to candidates successfully');
                      } finally {
                        setIsSendingResults(false);
                      }
                    }}
                  >
                    {isSendingResults ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Mail className="mr-2 h-4 w-4" />
                    )}
                    Send Results
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isExportingResults}
                    onClick={async () => {
                      setIsExportingResults(true);
                      try {
                        await new Promise(resolve => setTimeout(resolve, 1200));
                        toast.success('Results exported successfully');
                      } finally {
                        setIsExportingResults(false);
                      }
                    }}
                  >
                    {isExportingResults ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    Export
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="flex flex-col md:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="not_started">Not Started</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Results Table */}
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="p-3 text-left">
                          <Checkbox />
                        </th>
                        <th className="p-3 text-left text-sm font-medium">Candidate</th>
                        <th className="p-3 text-center text-sm font-medium">Status</th>
                        <th className="p-3 text-center text-sm font-medium">Score</th>
                        <th className="p-3 text-center text-sm font-medium">Percentile</th>
                        <th className="p-3 text-center text-sm font-medium">Rank</th>
                        <th className="p-3 text-center text-sm font-medium">Result</th>
                        <th className="p-3 text-center text-sm font-medium">Flags</th>
                        <th className="p-3 text-center text-sm font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredResults.map((result) => (
                        <tr key={result.id} className="border-t hover:bg-muted/30">
                          <td className="p-3">
                            <Checkbox />
                          </td>
                          <td className="p-3">
                            <div>
                              <p className="font-medium">{result.name}</p>
                              <p className="text-xs text-muted-foreground">{result.id}</p>
                            </div>
                          </td>
                          <td className="p-3 text-center">{getStatusBadge(result.status)}</td>
                          <td className="p-3 text-center">
                            {result.status === 'completed' ? (
                              <div className="flex flex-col items-center">
                                <span className="text-lg font-bold">
                                  {result.totalScore}/{currentExam.totalMarks}
                                </span>
                                <Progress value={(result.totalScore / currentExam.totalMarks) * 100} className="w-16 h-1.5" />
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {result.status === 'completed' ? (
                              <span className="font-medium">{result.percentile.toFixed(1)}%</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {result.status === 'completed' ? (
                              <span className="font-bold">#{result.rank}</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {getQualifiedBadge(result.qualified, result.status)}
                          </td>
                          <td className="p-3 text-center">
                            {result.proctoringFlags > 0 ? (
                              <Badge variant="destructive">{result.proctoringFlags}</Badge>
                            ) : (
                              <Badge variant="outline">0</Badge>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                                toast.info('Opening candidate result details');
                              }}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                                toast.success('Result sent to candidate successfully');
                              }}>
                                <Mail className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Proctoring Tab */}
        <TabsContent value="proctoring" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Proctoring Stats */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  Proctoring Overview
                </CardTitle>
                <CardDescription>Real-time exam integrity monitoring</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="p-4 bg-green-50 rounded-lg text-center">
                    <CheckCircle2 className="h-6 w-6 text-green-600 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-green-600">187</p>
                    <p className="text-xs text-green-700">Clean Sessions</p>
                  </div>
                  <div className="p-4 bg-yellow-50 rounded-lg text-center">
                    <AlertTriangle className="h-6 w-6 text-yellow-600 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-yellow-600">8</p>
                    <p className="text-xs text-yellow-700">Warnings</p>
                  </div>
                  <div className="p-4 bg-red-50 rounded-lg text-center">
                    <XCircle className="h-6 w-6 text-red-600 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-red-600">3</p>
                    <p className="text-xs text-red-700">Critical Flags</p>
                  </div>
                  <div className="p-4 bg-purple-50 rounded-lg text-center">
                    <Video className="h-6 w-6 text-purple-600 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-purple-600">198</p>
                    <p className="text-xs text-purple-700">Webcam Active</p>
                  </div>
                </div>

                {/* Flagged Candidates */}
                <div className="space-y-3">
                  <h4 className="font-medium">Flagged Candidates</h4>
                  <ScrollArea className="h-[250px]">
                    <div className="space-y-2">
                      {[
                        { name: 'Candidate A', flags: ['Tab switch detected', 'Face not visible'], severity: 'high' },
                        { name: 'Candidate B', flags: ['Multiple faces detected'], severity: 'critical' },
                        { name: 'Candidate C', flags: ['Audio anomaly detected'], severity: 'medium' }
                      ].map((candidate, index) => (
                        <div key={index} className={`p-3 border rounded-lg ${
                          candidate.severity === 'critical' ? 'bg-red-50 border-red-200' :
                          candidate.severity === 'high' ? 'bg-yellow-50 border-yellow-200' :
                          'bg-orange-50 border-orange-200'
                        }`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <AlertCircle className={`h-4 w-4 ${
                                candidate.severity === 'critical' ? 'text-red-600' :
                                candidate.severity === 'high' ? 'text-yellow-600' :
                                'text-orange-600'
                              }`} />
                              <span className="font-medium">{candidate.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant="outline" onClick={() => {
                                toast.info('Opening proctoring review');
                              }}>
                                <Eye className="mr-1 h-3 w-3" />
                                Review
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => {
                                toast.error('Exam session terminated');
                              }}>
                                Terminate
                              </Button>
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {candidate.flags.map((flag, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {flag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </CardContent>
            </Card>

            {/* Proctoring Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Proctoring Settings</CardTitle>
                <CardDescription>Configure integrity checks</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Webcam Required</Label>
                    <p className="text-xs text-muted-foreground">Mandatory webcam access</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Tab Switch Detection</Label>
                    <p className="text-xs text-muted-foreground">Flag when leaving exam tab</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Face Recognition</Label>
                    <p className="text-xs text-muted-foreground">Verify candidate identity</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Audio Monitoring</Label>
                    <p className="text-xs text-muted-foreground">Detect audio anomalies</p>
                  </div>
                  <Switch />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Copy-Paste Blocking</Label>
                    <p className="text-xs text-muted-foreground">Prevent copy-paste actions</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Right-Click Disabled</Label>
                    <p className="text-xs text-muted-foreground">Disable context menu</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Score Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Score Distribution</CardTitle>
                <CardDescription>Distribution of candidates by score range</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { range: '90-100', count: 12, color: 'bg-green-500' },
                    { range: '80-89', count: 28, color: 'bg-blue-500' },
                    { range: '70-79', count: 45, color: 'bg-yellow-500' },
                    { range: '60-69', count: 38, color: 'bg-orange-500' },
                    { range: '50-59', count: 42, color: 'bg-purple-500' },
                    { range: '40-49', count: 18, color: 'bg-gray-500' },
                    { range: 'Below 40', count: 15, color: 'bg-red-500' }
                  ].map((bucket) => (
                    <div key={bucket.range} className="flex items-center gap-4">
                      <span className="w-20 text-sm">{bucket.range}</span>
                      <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                        <div
                          className={`h-full ${bucket.color}`}
                          style={{ width: `${(bucket.count / 198) * 100}%` }}
                        />
                      </div>
                      <span className="w-10 text-sm text-right font-medium">{bucket.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Section-wise Performance */}
            <Card>
              <CardHeader>
                <CardTitle>Section-wise Average</CardTitle>
                <CardDescription>Average scores across exam sections</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {currentExam.sections.map((section) => (
                    <div key={section.name} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{section.name}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            Cutoff: {section.cutoff}
                          </Badge>
                          <span className="font-bold">{Math.round(section.marks * 0.65)}/{section.marks}</span>
                        </div>
                      </div>
                      <Progress value={65} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Qualification Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Qualification Summary</CardTitle>
                <CardDescription>Pass/fail analysis</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span>Pass Rate</span>
                    <span className="font-bold text-green-600">78.8%</span>
                  </div>
                  <Progress value={78.8} className="h-3" />
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <p className="text-3xl font-bold text-green-600">156</p>
                      <p className="text-sm text-green-700">Qualified</p>
                    </div>
                    <div className="text-center p-4 bg-red-50 rounded-lg">
                      <p className="text-3xl font-bold text-red-600">42</p>
                      <p className="text-sm text-red-700">Not Qualified</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Time Analysis */}
            <Card>
              <CardHeader>
                <CardTitle>Time Analysis</CardTitle>
                <CardDescription>Exam completion time distribution</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 border rounded-lg">
                      <Clock className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                      <p className="text-lg font-bold">45 min</p>
                      <p className="text-xs text-muted-foreground">Fastest</p>
                    </div>
                    <div className="text-center p-3 border rounded-lg bg-primary/5">
                      <Clock className="h-5 w-5 mx-auto mb-1 text-primary" />
                      <p className="text-lg font-bold">142 min</p>
                      <p className="text-xs text-muted-foreground">Average</p>
                    </div>
                    <div className="text-center p-3 border rounded-lg">
                      <Clock className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                      <p className="text-lg font-bold">180 min</p>
                      <p className="text-xs text-muted-foreground">Full Time</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Under 1 hour</span>
                      <span className="font-medium">12%</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>1-2 hours</span>
                      <span className="font-medium">45%</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>2-3 hours</span>
                      <span className="font-medium">38%</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Full 3 hours</span>
                      <span className="font-medium">5%</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Create Exam Dialog */}
      <Dialog open={isCreateExamDialogOpen} onOpenChange={setIsCreateExamDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Exam</DialogTitle>
            <DialogDescription>
              Configure a new screening examination
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Exam Name</Label>
              <Input placeholder="e.g., B.Tech Entrance Exam 2026" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Program</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select program" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="btech">B.Tech</SelectItem>
                    <SelectItem value="mba">MBA</SelectItem>
                    <SelectItem value="bba">BBA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Duration (mins)</Label>
                <Input type="number" placeholder="180" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Total Questions</Label>
                <Input type="number" placeholder="100" />
              </div>
              <div className="space-y-2">
                <Label>Passing Score (%)</Label>
                <Input type="number" placeholder="40" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Negative Marking</Label>
              <Switch />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateExamDialogOpen(false)}
              disabled={isCreatingExam}
            >
              Cancel
            </Button>
            <Button
              disabled={isCreatingExam}
              onClick={async () => {
                setIsCreatingExam(true);
                try {
                  await new Promise(resolve => setTimeout(resolve, 1500));
                  setIsCreateExamDialogOpen(false);
                  toast.success('Exam created successfully');
                } finally {
                  setIsCreatingExam(false);
                }
              }}
            >
              {isCreatingExam && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Exam
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cutoff Dialog */}
      <Dialog open={isCutoffDialogOpen} onOpenChange={setIsCutoffDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set Section Cutoffs</DialogTitle>
            <DialogDescription>
              Define minimum qualifying scores for each section
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {currentExam.sections.map((section) => (
              <div key={section.name} className="flex items-center gap-4">
                <Label className="w-40">{section.name}</Label>
                <Input
                  type="number"
                  min={0}
                  max={section.marks}
                  defaultValue={section.cutoff}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">/ {section.marks}</span>
              </div>
            ))}
            <div className="pt-4 border-t">
              <div className="flex items-center gap-4">
                <Label className="w-40 font-bold">Overall Cutoff</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={currentExam.passingScore}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCutoffDialogOpen(false)}
              disabled={isSavingCutoffs}
            >
              Cancel
            </Button>
            <Button
              disabled={isSavingCutoffs}
              onClick={async () => {
                setIsSavingCutoffs(true);
                try {
                  await new Promise(resolve => setTimeout(resolve, 1200));
                  setIsCutoffDialogOpen(false);
                  toast.success('Cutoffs saved successfully');
                } finally {
                  setIsSavingCutoffs(false);
                }
              }}
            >
              {isSavingCutoffs && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Cutoffs
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ScreeningExamPage() {
  return (
    <AdmissionErrorBoundary>
      <ScreeningExamPageContent />
    </AdmissionErrorBoundary>
  );
}
