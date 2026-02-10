'use client';

import { useState, useMemo } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import {
  Trophy,
  Medal,
  Crown,
  Star,
  Users,
  Download,
  Filter,
  Settings,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  BarChart3,
  FileText,
  Mail,
  Calculator,
  Search,
  ChevronDown,
  ChevronUp,
  ListOrdered,
  Percent,
  Target,
  TrendingUp,
  ArrowUpDown,
  GraduationCap,
  Sparkles,
  Eye,
  Send,
  Printer,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { AdmissionErrorBoundary } from '@/components/admission';
import { useAuth } from '@/hooks/use-auth';
import {
  useMeritLists,
  useMeritListStats,
  useCreateMeritList,
  usePublishMeritList,
} from '@/hooks/admission/use-merit-lists';
import type { MeritListRow, MeritListEntry } from '@/lib/services/admission/merit-list-service';

// Scoring weights configuration
const defaultWeights = {
  academic: 30,
  entrance: 25,
  interview: 20,
  gd: 15,
  extracurricular: 10
};

// Category quotas configuration
const categoryQuotas = [
  { category: 'General', percentage: 50, seats: 60 },
  { category: 'OBC', percentage: 27, seats: 32 },
  { category: 'SC', percentage: 15, seats: 18 },
  { category: 'ST', percentage: 7.5, seats: 9 },
  { category: 'EWS', percentage: 10, seats: 12 },
  { category: 'Minority', percentage: 5, seats: 6 }
];

function MeritListPageContent() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';

  const [activeTab, setActiveTab] = useState('merit-list');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProgram, setSelectedProgram] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [weights, setWeights] = useState(defaultWeights);
  const [isWeightsDialogOpen, setIsWeightsDialogOpen] = useState(false);
  const [isCutoffDialogOpen, setIsCutoffDialogOpen] = useState(false);
  const [isShortlistDialogOpen, setIsShortlistDialogOpen] = useState(false);
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [cutoffs, setCutoffs] = useState({
    general: 80,
    obc: 75,
    sc: 70,
    st: 65,
    ews: 75,
    minority: 72
  });

  // Loading states
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isSavingWeights, setIsSavingWeights] = useState(false);
  const [isSavingCutoffs, setIsSavingCutoffs] = useState(false);
  const [isRunningShortlist, setIsRunningShortlist] = useState(false);

  // Real data hooks
  const { meritLists, isLoading: listsLoading } = useMeritLists(institutionId);
  const { stats: meritStats, isLoading: statsLoading } = useMeritListStats(institutionId);
  const publishMutation = usePublishMeritList();

  // Flatten entries from all merit lists
  const allCandidates = useMemo(() => {
    const candidates: (MeritListEntry & { listName?: string; listId?: string })[] = [];
    for (const list of meritLists) {
      const entries = (list.entries || []) as MeritListEntry[];
      for (const entry of entries) {
        candidates.push({ ...entry, listName: list.list_name, listId: list.id });
      }
    }
    return candidates;
  }, [meritLists]);

  // Transform to UI format
  const mockCandidates = allCandidates.map((c, index) => ({
    id: c.application_number || c.application_id?.slice(0, 12) || `ENTRY-${index + 1}`,
    name: c.candidate_name || 'Unknown',
    program: (c as any).listName || '',
    category: c.category || 'General',
    academicScore: c.academic_score || 0,
    entranceScore: c.entrance_score || 0,
    interviewScore: c.interview_score || 0,
    gdScore: c.gd_score || 0,
    extracurricularScore: c.extracurricular_score || 0,
    totalScore: c.total_score || 0,
    rank: c.rank || (index + 1),
    status: c.status || 'pending',
    email: c.email || '',
    phone: c.phone || '',
    photo: null,
  }));

  // Stats calculations
  const totalCandidates = meritStats.totalCandidates;
  const shortlistedCount = meritStats.shortlisted;
  const waitlistedCount = meritStats.waitlisted;
  const pendingCount = meritStats.pending;
  const avgScore = meritStats.avgScore;

  // Filter candidates
  const filteredCandidates = mockCandidates.filter(candidate => {
    const matchesSearch = candidate.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          candidate.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesProgram = selectedProgram === 'all' || candidate.program === selectedProgram;
    const matchesCategory = selectedCategory === 'all' || candidate.category === selectedCategory;
    const matchesStatus = selectedStatus === 'all' || candidate.status === selectedStatus;
    return matchesSearch && matchesProgram && matchesCategory && matchesStatus;
  }).sort((a, b) => sortOrder === 'desc' ? b.totalScore - a.totalScore : a.totalScore - b.totalScore);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'shortlisted':
        return <Badge className="bg-green-100 text-green-700 border-green-200">Shortlisted</Badge>;
      case 'waitlisted':
        return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">Waitlisted</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-700 border-red-200">Rejected</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-700 border-gray-200">Pending</Badge>;
    }
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) {
      return (
        <div className="flex items-center gap-1 text-yellow-600">
          <Crown className="h-5 w-5" />
          <span className="font-bold">1st</span>
        </div>
      );
    }
    if (rank === 2) {
      return (
        <div className="flex items-center gap-1 text-gray-500">
          <Medal className="h-5 w-5" />
          <span className="font-bold">2nd</span>
        </div>
      );
    }
    if (rank === 3) {
      return (
        <div className="flex items-center gap-1 text-amber-700">
          <Medal className="h-5 w-5" />
          <span className="font-bold">3rd</span>
        </div>
      );
    }
    return <span className="text-muted-foreground font-medium">#{rank}</span>;
  };

  const getCategoryBadge = (category: string) => {
    const colors: Record<string, string> = {
      'General': 'bg-blue-100 text-blue-700 border-blue-200',
      'OBC': 'bg-purple-100 text-purple-700 border-purple-200',
      'SC': 'bg-orange-100 text-orange-700 border-orange-200',
      'ST': 'bg-teal-100 text-teal-700 border-teal-200',
      'EWS': 'bg-pink-100 text-pink-700 border-pink-200',
      'Minority': 'bg-indigo-100 text-indigo-700 border-indigo-200'
    };
    return <Badge className={colors[category] || 'bg-gray-100 text-gray-700'}>{category}</Badge>;
  };

  const handleSelectAll = () => {
    if (selectedCandidates.length === filteredCandidates.length) {
      setSelectedCandidates([]);
    } else {
      setSelectedCandidates(filteredCandidates.map(c => c.id));
    }
  };

  const handleSelectCandidate = (id: string) => {
    if (selectedCandidates.includes(id)) {
      setSelectedCandidates(selectedCandidates.filter(c => c !== id));
    } else {
      setSelectedCandidates([...selectedCandidates, id]);
    }
  };

  const handleBulkAction = (action: 'shortlist' | 'waitlist' | 'reject') => {
    const count = selectedCandidates.length;
    setSelectedCandidates([]);
    if (action === 'shortlist') {
      toast.success(`${count} candidate${count > 1 ? 's' : ''} shortlisted successfully`);
    } else if (action === 'waitlist') {
      toast.success(`${count} candidate${count > 1 ? 's' : ''} moved to waitlist`);
    } else {
      toast.success(`${count} candidate${count > 1 ? 's' : ''} rejected`);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="h-7 w-7 text-primary" />
            Merit List & Shortlisting
          </h1>
          <p className="text-muted-foreground mt-1">
            Generate merit lists and manage candidate shortlisting
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setIsWeightsDialogOpen(true)}>
            <Settings className="mr-2 h-4 w-4" />
            Scoring Weights
          </Button>
          <Button variant="outline" onClick={() => setIsCutoffDialogOpen(true)}>
            <Target className="mr-2 h-4 w-4" />
            Set Cutoffs
          </Button>
          <Button
            onClick={async () => {
              setIsRecalculating(true);
              try {
                await new Promise(resolve => setTimeout(resolve, 1000));
                toast.success('Ranks recalculated successfully');
              } finally {
                setIsRecalculating(false);
              }
            }}
            disabled={isRecalculating}
          >
            {isRecalculating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Recalculate Ranks
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Candidates</p>
                <p className="text-2xl font-bold">{totalCandidates}</p>
              </div>
              <Users className="h-8 w-8 text-blue-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Shortlisted</p>
                <p className="text-2xl font-bold text-green-600">{shortlistedCount}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Waitlisted</p>
                <p className="text-2xl font-bold text-yellow-600">{waitlistedCount}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Review</p>
                <p className="text-2xl font-bold text-gray-600">{pendingCount}</p>
              </div>
              <FileText className="h-8 w-8 text-gray-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Average Score</p>
                <p className="text-2xl font-bold text-purple-600">{avgScore.toFixed(1)}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
          <TabsTrigger value="merit-list">
            <ListOrdered className="mr-2 h-4 w-4" />
            Merit List
          </TabsTrigger>
          <TabsTrigger value="category-wise">
            <Percent className="mr-2 h-4 w-4" />
            Category-wise
          </TabsTrigger>
          <TabsTrigger value="shortlist">
            <Sparkles className="mr-2 h-4 w-4" />
            Shortlist Actions
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <BarChart3 className="mr-2 h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        {/* Merit List Tab */}
        <TabsContent value="merit-list" className="mt-6">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <CardTitle>Overall Merit List</CardTitle>
                  <CardDescription>Ranked by weighted total score</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => toast.success('Merit list exported successfully')}>
                    <Download className="mr-2 h-4 w-4" />
                    Export
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => toast.success('Print dialog opened')}>
                    <Printer className="mr-2 h-4 w-4" />
                    Print
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
                <Select value={selectedProgram} onValueChange={setSelectedProgram}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Program" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Programs</SelectItem>
                    <SelectItem value="B.Tech Computer Science">B.Tech CS</SelectItem>
                    <SelectItem value="B.Tech Electronics">B.Tech ECE</SelectItem>
                    <SelectItem value="MBA">MBA</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="General">General</SelectItem>
                    <SelectItem value="OBC">OBC</SelectItem>
                    <SelectItem value="SC">SC</SelectItem>
                    <SelectItem value="ST">ST</SelectItem>
                    <SelectItem value="EWS">EWS</SelectItem>
                    <SelectItem value="Minority">Minority</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="shortlisted">Shortlisted</SelectItem>
                    <SelectItem value="waitlisted">Waitlisted</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                >
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </div>

              {/* Bulk Actions */}
              {selectedCandidates.length > 0 && (
                <div className="flex items-center gap-4 p-3 bg-blue-50 rounded-lg mb-4">
                  <span className="text-sm font-medium text-blue-700">
                    {selectedCandidates.length} selected
                  </span>
                  <Button size="sm" variant="outline" onClick={() => handleBulkAction('shortlist')}>
                    <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                    Shortlist
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleBulkAction('waitlist')}>
                    <Clock className="mr-2 h-4 w-4 text-yellow-600" />
                    Waitlist
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleBulkAction('reject')}>
                    <XCircle className="mr-2 h-4 w-4 text-red-600" />
                    Reject
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedCandidates([])}>
                    Clear
                  </Button>
                </div>
              )}

              {/* Candidates Table */}
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="p-3 text-left">
                          <Checkbox
                            checked={selectedCandidates.length === filteredCandidates.length && filteredCandidates.length > 0}
                            onCheckedChange={handleSelectAll}
                          />
                        </th>
                        <th className="p-3 text-left text-sm font-medium">Rank</th>
                        <th className="p-3 text-left text-sm font-medium">Candidate</th>
                        <th className="p-3 text-left text-sm font-medium">Category</th>
                        <th className="p-3 text-center text-sm font-medium">Academic</th>
                        <th className="p-3 text-center text-sm font-medium">Entrance</th>
                        <th className="p-3 text-center text-sm font-medium">Interview</th>
                        <th className="p-3 text-center text-sm font-medium">GD</th>
                        <th className="p-3 text-center text-sm font-medium">Extra</th>
                        <th className="p-3 text-center text-sm font-medium">Total</th>
                        <th className="p-3 text-left text-sm font-medium">Status</th>
                        <th className="p-3 text-center text-sm font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCandidates.map((candidate, index) => (
                        <tr key={candidate.id} className="border-t hover:bg-muted/30">
                          <td className="p-3">
                            <Checkbox
                              checked={selectedCandidates.includes(candidate.id)}
                              onCheckedChange={() => handleSelectCandidate(candidate.id)}
                            />
                          </td>
                          <td className="p-3">{getRankBadge(candidate.rank)}</td>
                          <td className="p-3">
                            <div>
                              <p className="font-medium">{candidate.name}</p>
                              <p className="text-xs text-muted-foreground">{candidate.id}</p>
                            </div>
                          </td>
                          <td className="p-3">{getCategoryBadge(candidate.category)}</td>
                          <td className="p-3 text-center">
                            <span className="text-sm font-medium">{candidate.academicScore}%</span>
                          </td>
                          <td className="p-3 text-center">
                            <span className="text-sm font-medium">{candidate.entranceScore}%</span>
                          </td>
                          <td className="p-3 text-center">
                            <span className="text-sm font-medium">{candidate.interviewScore}%</span>
                          </td>
                          <td className="p-3 text-center">
                            <span className="text-sm font-medium">{candidate.gdScore}%</span>
                          </td>
                          <td className="p-3 text-center">
                            <span className="text-sm font-medium">{candidate.extracurricularScore}%</span>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex flex-col items-center">
                              <span className="text-lg font-bold text-primary">{candidate.totalScore.toFixed(1)}%</span>
                              <Progress value={candidate.totalScore} className="w-16 h-1.5" />
                            </div>
                          </td>
                          <td className="p-3">{getStatusBadge(candidate.status)}</td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
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

        {/* Category-wise Tab */}
        <TabsContent value="category-wise" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Quota Allocation */}
            <Card>
              <CardHeader>
                <CardTitle>Quota Allocation</CardTitle>
                <CardDescription>Category-wise seat distribution</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {categoryQuotas.map((quota) => (
                    <div key={quota.category} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getCategoryBadge(quota.category)}
                          <span className="text-sm text-muted-foreground">
                            {quota.seats} seats ({quota.percentage}%)
                          </span>
                        </div>
                        <span className="text-sm font-medium">
                          {mockCandidates.filter(c => c.category === quota.category && c.status === 'shortlisted').length}/{quota.seats} filled
                        </span>
                      </div>
                      <Progress
                        value={(mockCandidates.filter(c => c.category === quota.category && c.status === 'shortlisted').length / quota.seats) * 100}
                        className="h-2"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Category Cutoffs */}
            <Card>
              <CardHeader>
                <CardTitle>Category Cutoffs</CardTitle>
                <CardDescription>Minimum qualifying scores by category</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(cutoffs).map(([category, cutoff]) => (
                    <div key={category} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Target className="h-5 w-5 text-muted-foreground" />
                        <span className="font-medium capitalize">{category}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-primary">{cutoff}%</span>
                        <Badge variant="outline" className="text-xs">
                          {mockCandidates.filter(c =>
                            c.category.toLowerCase() === category &&
                            c.totalScore >= cutoff
                          ).length} qualifying
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Category-wise Merit Lists */}
            {['General', 'OBC', 'SC', 'ST'].map((category) => (
              <Card key={category}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {getCategoryBadge(category)}
                        <span>Merit List</span>
                      </CardTitle>
                      <CardDescription>Top candidates in {category} category</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => toast.success(`${category} merit list exported successfully`)}>
                      <Download className="mr-2 h-4 w-4" />
                      Export
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[200px]">
                    <div className="space-y-2">
                      {mockCandidates
                        .filter(c => c.category === category)
                        .sort((a, b) => b.totalScore - a.totalScore)
                        .slice(0, 5)
                        .map((candidate, index) => (
                          <div key={candidate.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                            <div className="flex items-center gap-3">
                              <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">
                                {index + 1}
                              </span>
                              <div>
                                <p className="font-medium text-sm">{candidate.name}</p>
                                <p className="text-xs text-muted-foreground">{candidate.id}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-primary">{candidate.totalScore.toFixed(1)}%</p>
                              {getStatusBadge(candidate.status)}
                            </div>
                          </div>
                        ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Shortlist Actions Tab */}
        <TabsContent value="shortlist" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Auto Shortlist Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Auto Shortlist
                </CardTitle>
                <CardDescription>Automatically shortlist based on criteria</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Use Category Cutoffs</Label>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Respect Quota Limits</Label>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Include Waitlist</Label>
                    <Switch />
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => setIsShortlistDialogOpen(true)}
                  disabled={isRunningShortlist}
                >
                  {isRunningShortlist ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Calculator className="mr-2 h-4 w-4" />
                  )}
                  Run Auto Shortlist
                </Button>
              </CardContent>
            </Card>

            {/* Send Notifications Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-primary" />
                  Send Notifications
                </CardTitle>
                <CardDescription>Notify candidates of their status</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-2 border rounded-lg">
                    <span className="text-sm">Shortlisted ({shortlistedCount})</span>
                    <Button size="sm" variant="outline" onClick={() => toast.success(`Notifications sent to ${shortlistedCount} shortlisted candidates`)}>
                      <Send className="mr-2 h-3 w-3" />
                      Send
                    </Button>
                  </div>
                  <div className="flex items-center justify-between p-2 border rounded-lg">
                    <span className="text-sm">Waitlisted ({waitlistedCount})</span>
                    <Button size="sm" variant="outline" onClick={() => toast.success(`Notifications sent to ${waitlistedCount} waitlisted candidates`)}>
                      <Send className="mr-2 h-3 w-3" />
                      Send
                    </Button>
                  </div>
                  <div className="flex items-center justify-between p-2 border rounded-lg">
                    <span className="text-sm">Not Selected (0)</span>
                    <Button size="sm" variant="outline" onClick={() => toast.success('Notifications sent to non-selected candidates')}>
                      <Send className="mr-2 h-3 w-3" />
                      Send
                    </Button>
                  </div>
                </div>
                <Button variant="outline" className="w-full" onClick={() => toast.success('All notifications sent successfully')}>
                  <Mail className="mr-2 h-4 w-4" />
                  Send All Notifications
                </Button>
              </CardContent>
            </Card>

            {/* Export Options Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-5 w-5 text-primary" />
                  Export & Reports
                </CardTitle>
                <CardDescription>Download merit lists and reports</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Button variant="outline" className="w-full justify-start" onClick={() => toast.success('Overall merit list exported as Excel')}>
                    <FileText className="mr-2 h-4 w-4" />
                    Overall Merit List (Excel)
                  </Button>
                  <Button variant="outline" className="w-full justify-start" onClick={() => toast.success('Category-wise lists exported as PDF')}>
                    <FileText className="mr-2 h-4 w-4" />
                    Category-wise Lists (PDF)
                  </Button>
                  <Button variant="outline" className="w-full justify-start" onClick={() => toast.success('Shortlist summary report generated')}>
                    <FileText className="mr-2 h-4 w-4" />
                    Shortlist Summary Report
                  </Button>
                  <Button variant="outline" className="w-full justify-start" onClick={() => toast.success('Print dialog opened for all merit lists')}>
                    <Printer className="mr-2 h-4 w-4" />
                    Print All Merit Lists
                  </Button>
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
                    { range: '90-100%', count: 1, color: 'bg-green-500' },
                    { range: '80-89%', count: 5, color: 'bg-blue-500' },
                    { range: '70-79%', count: 2, color: 'bg-yellow-500' },
                    { range: '60-69%', count: 0, color: 'bg-orange-500' },
                    { range: 'Below 60%', count: 0, color: 'bg-red-500' }
                  ].map((bucket) => (
                    <div key={bucket.range} className="flex items-center gap-4">
                      <span className="w-24 text-sm">{bucket.range}</span>
                      <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                        <div
                          className={`h-full ${bucket.color}`}
                          style={{ width: `${totalCandidates > 0 ? (bucket.count / totalCandidates) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="w-10 text-sm text-right font-medium">{bucket.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Component-wise Performance */}
            <Card>
              <CardHeader>
                <CardTitle>Component-wise Average</CardTitle>
                <CardDescription>Average scores across evaluation components</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { name: 'Academic', score: 85, weight: weights.academic },
                    { name: 'Entrance Exam', score: 83, weight: weights.entrance },
                    { name: 'Interview', score: 84, weight: weights.interview },
                    { name: 'Group Discussion', score: 81, weight: weights.gd },
                    { name: 'Extracurricular', score: 77, weight: weights.extracurricular }
                  ].map((component) => (
                    <div key={component.name} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{component.name}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{component.weight}% weight</Badge>
                          <span className="font-bold">{component.score}%</span>
                        </div>
                      </div>
                      <Progress value={component.score} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Category Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Category Distribution</CardTitle>
                <CardDescription>Candidates by category</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {['General', 'OBC', 'SC', 'ST', 'EWS', 'Minority'].map((category) => {
                    const count = mockCandidates.filter(c => c.category === category).length;
                    return (
                      <div key={category} className="flex items-center justify-between p-3 border rounded-lg">
                        {getCategoryBadge(category)}
                        <span className="text-xl font-bold">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Status Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Shortlisting Progress</CardTitle>
                <CardDescription>Current status of all candidates</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Processing Complete</span>
                    <span className="font-bold">{((shortlistedCount + waitlistedCount) / totalCandidates * 100).toFixed(0)}%</span>
                  </div>
                  <Progress value={(shortlistedCount + waitlistedCount) / totalCandidates * 100} className="h-3" />
                  <div className="grid grid-cols-3 gap-4 pt-2">
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <p className="text-2xl font-bold text-green-600">{shortlistedCount}</p>
                      <p className="text-xs text-green-700">Shortlisted</p>
                    </div>
                    <div className="text-center p-3 bg-yellow-50 rounded-lg">
                      <p className="text-2xl font-bold text-yellow-600">{waitlistedCount}</p>
                      <p className="text-xs text-yellow-700">Waitlisted</p>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <p className="text-2xl font-bold text-gray-600">{pendingCount}</p>
                      <p className="text-xs text-gray-700">Pending</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Scoring Weights Dialog */}
      <Dialog open={isWeightsDialogOpen} onOpenChange={setIsWeightsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configure Scoring Weights</DialogTitle>
            <DialogDescription>
              Adjust the weight of each evaluation component. Total must equal 100%.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {Object.entries(weights).map(([key, value]) => (
              <div key={key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="capitalize">{key.replace(/([A-Z])/g, ' $1')}</Label>
                  <span className="font-bold">{value}%</span>
                </div>
                <Slider
                  value={[value]}
                  min={0}
                  max={50}
                  step={5}
                  onValueChange={([newValue]) => setWeights({ ...weights, [key]: newValue })}
                />
              </div>
            ))}
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center justify-between">
                <span className="font-medium">Total</span>
                <span className={`font-bold ${Object.values(weights).reduce((a, b) => a + b, 0) === 100 ? 'text-green-600' : 'text-red-600'}`}>
                  {Object.values(weights).reduce((a, b) => a + b, 0)}%
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setWeights(defaultWeights);
                toast.success('Weights reset to default values');
              }}
              disabled={isSavingWeights}
            >
              Reset to Default
            </Button>
            <Button
              onClick={async () => {
                setIsSavingWeights(true);
                try {
                  await new Promise(resolve => setTimeout(resolve, 800));
                  setIsWeightsDialogOpen(false);
                  toast.success('Scoring weights saved successfully');
                } finally {
                  setIsSavingWeights(false);
                }
              }}
              disabled={isSavingWeights}
            >
              {isSavingWeights && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Weights
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cutoffs Dialog */}
      <Dialog open={isCutoffDialogOpen} onOpenChange={setIsCutoffDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set Category Cutoffs</DialogTitle>
            <DialogDescription>
              Define minimum qualifying scores for each category.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {Object.entries(cutoffs).map(([category, cutoff]) => (
              <div key={category} className="flex items-center gap-4">
                <Label className="w-24 capitalize">{category}</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={cutoff}
                  onChange={(e) => setCutoffs({ ...cutoffs, [category]: parseInt(e.target.value) || 0 })}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">%</span>
                <Badge variant="outline" className="ml-auto">
                  {mockCandidates.filter(c =>
                    c.category.toLowerCase() === category &&
                    c.totalScore >= cutoff
                  ).length} qualify
                </Badge>
              </div>
            ))}
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
              onClick={async () => {
                setIsSavingCutoffs(true);
                try {
                  await new Promise(resolve => setTimeout(resolve, 800));
                  setIsCutoffDialogOpen(false);
                  toast.success('Category cutoffs saved successfully');
                } finally {
                  setIsSavingCutoffs(false);
                }
              }}
              disabled={isSavingCutoffs}
            >
              {isSavingCutoffs && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Cutoffs
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auto Shortlist Dialog */}
      <Dialog open={isShortlistDialogOpen} onOpenChange={setIsShortlistDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Auto Shortlist Preview</DialogTitle>
            <DialogDescription>
              Review candidates who will be shortlisted based on current criteria.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="font-medium text-green-800">Will be Shortlisted: {shortlistedCount + 1}</p>
                <p className="text-sm text-green-600 mt-1">
                  Candidates meeting all criteria including category cutoffs
                </p>
              </div>
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="font-medium text-yellow-800">Will be Waitlisted: {waitlistedCount + 1}</p>
                <p className="text-sm text-yellow-600 mt-1">
                  Candidates meeting cutoff but exceeding quota limits
                </p>
              </div>
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="font-medium text-gray-800">Will Remain Pending: {pendingCount - 2}</p>
                <p className="text-sm text-gray-600 mt-1">
                  Candidates not meeting minimum cutoff criteria
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsShortlistDialogOpen(false)}
              disabled={isRunningShortlist}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                setIsRunningShortlist(true);
                try {
                  await new Promise(resolve => setTimeout(resolve, 1500));
                  setIsShortlistDialogOpen(false);
                  toast.success('Auto shortlist completed successfully');
                } finally {
                  setIsRunningShortlist(false);
                }
              }}
              disabled={isRunningShortlist}
            >
              {isRunningShortlist ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Confirm & Run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function MeritListPage() {
  return (
    <AdmissionErrorBoundary>
      <MeritListPageContent />
    </AdmissionErrorBoundary>
  );
}
