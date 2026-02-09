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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  MessageSquareText,
  ThumbsUp,
  ThumbsDown,
  Meh,
  Star,
  Users,
  Download,
  Mail,
  Eye,
  Search,
  Filter,
  TrendingUp,
  TrendingDown,
  BarChart3,
  PieChart,
  Send,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  MessageCircle,
  Lightbulb,
  AlertTriangle,
  Heart,
  Frown,
  Smile,
  Calendar,
  RefreshCw,
  Settings,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { AdmissionErrorBoundary } from '@/components/admission';
import { format } from 'date-fns';

// Mock feedback data
const mockFeedback = [
  {
    id: 'FB-2026-001',
    candidateName: 'Mohammed Arif',
    email: 'mohammed.arif@email.com',
    program: 'B.Tech Electronics',
    status: 'declined_offer',
    feedbackDate: '2026-01-22',
    overallRating: 4,
    npsScore: 7,
    primaryReason: 'Joined another institution',
    secondaryReasons: ['Better scholarship elsewhere', 'Closer to home'],
    wouldRecommend: true,
    processRating: 4,
    communicationRating: 5,
    transparencyRating: 4,
    comments: 'The admission process was smooth, but I received a better scholarship offer from another institution.',
    suggestions: 'Consider offering more competitive scholarships for deserving candidates.',
    responded: true
  },
  {
    id: 'FB-2026-002',
    candidateName: 'Sneha Reddy',
    email: 'sneha.reddy@email.com',
    program: 'MBA',
    status: 'expired_offer',
    feedbackDate: '2026-01-21',
    overallRating: 3,
    npsScore: 5,
    primaryReason: 'Financial constraints',
    secondaryReasons: ['Fee too high', 'No scholarship offered'],
    wouldRecommend: false,
    processRating: 3,
    communicationRating: 4,
    transparencyRating: 3,
    comments: 'The fees were higher than expected and no financial aid was offered despite my background.',
    suggestions: 'More flexible payment plans and need-based scholarships would help.',
    responded: true
  },
  {
    id: 'FB-2026-003',
    candidateName: 'Arun Gupta',
    email: 'arun.gupta@email.com',
    program: 'B.Tech Computer Science',
    status: 'not_shortlisted',
    feedbackDate: '2026-01-20',
    overallRating: 2,
    npsScore: 3,
    primaryReason: 'Interview feedback',
    secondaryReasons: ['Felt the evaluation was unfair'],
    wouldRecommend: false,
    processRating: 2,
    communicationRating: 3,
    transparencyRating: 2,
    comments: 'I felt the interview panel was biased and did not give me a fair chance to present myself.',
    suggestions: 'More transparent evaluation criteria and feedback would be helpful.',
    responded: true
  },
  {
    id: 'FB-2026-004',
    candidateName: 'Kavitha Nair',
    email: 'kavitha.nair@email.com',
    program: 'B.Tech Computer Science',
    status: 'withdrew',
    feedbackDate: '2026-01-19',
    overallRating: 5,
    npsScore: 9,
    primaryReason: 'Personal reasons',
    secondaryReasons: ['Family relocation'],
    wouldRecommend: true,
    processRating: 5,
    communicationRating: 5,
    transparencyRating: 5,
    comments: 'Excellent admission process! Had to withdraw due to family relocation, not the institution\'s fault.',
    suggestions: 'Maybe offer option to defer admission for a year in special circumstances.',
    responded: true
  },
  {
    id: 'FB-2026-005',
    candidateName: 'Ravi Shankar',
    email: 'ravi.shankar@email.com',
    program: 'B.Tech Mechanical',
    status: 'declined_offer',
    feedbackDate: null,
    overallRating: null,
    npsScore: null,
    primaryReason: null,
    secondaryReasons: [],
    wouldRecommend: null,
    processRating: null,
    communicationRating: null,
    transparencyRating: null,
    comments: null,
    suggestions: null,
    responded: false
  }
];

// Feedback reasons
const feedbackReasons = [
  { reason: 'Joined another institution', count: 12, percent: 30 },
  { reason: 'Financial constraints', count: 8, percent: 20 },
  { reason: 'Location preference', count: 6, percent: 15 },
  { reason: 'Program mismatch', count: 5, percent: 12.5 },
  { reason: 'Personal reasons', count: 4, percent: 10 },
  { reason: 'Interview feedback', count: 3, percent: 7.5 },
  { reason: 'Other', count: 2, percent: 5 }
];

function FeedbackPageContent() {
  const [activeTab, setActiveTab] = useState('responses');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isRequestDialogOpen, setIsRequestDialogOpen] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState<typeof mockFeedback[0] | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [sendingRequestTo, setSendingRequestTo] = useState<string | null>(null);

  // Stats
  const totalCandidates = mockFeedback.length;
  const respondedCount = mockFeedback.filter(f => f.responded).length;
  const responseRate = totalCandidates > 0 ? (respondedCount / totalCandidates) * 100 : 0;
  const avgNPS = respondedCount > 0 ? mockFeedback.filter(f => f.npsScore).reduce((acc, f) => acc + (f.npsScore || 0), 0) / respondedCount : 0;
  const avgRating = respondedCount > 0 ? mockFeedback.filter(f => f.overallRating).reduce((acc, f) => acc + (f.overallRating || 0), 0) / respondedCount : 0;
  const recommendRate = respondedCount > 0 ? (mockFeedback.filter(f => f.wouldRecommend).length / respondedCount) * 100 : 0;

  // Filter feedback
  const filteredFeedback = mockFeedback.filter(fb => {
    const matchesSearch = fb.candidateName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          fb.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || fb.status === statusFilter ||
                          (statusFilter === 'responded' && fb.responded) ||
                          (statusFilter === 'pending' && !fb.responded);
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'declined_offer':
        return <Badge className="bg-orange-100 text-orange-700 border-orange-200">Declined Offer</Badge>;
      case 'expired_offer':
        return <Badge className="bg-gray-100 text-gray-700 border-gray-200">Offer Expired</Badge>;
      case 'not_shortlisted':
        return <Badge className="bg-red-100 text-red-700 border-red-200">Not Shortlisted</Badge>;
      case 'withdrew':
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Withdrew</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getNPSBadge = (score: number | null) => {
    if (score === null) return null;
    if (score >= 9) return <Badge className="bg-green-100 text-green-700">Promoter</Badge>;
    if (score >= 7) return <Badge className="bg-yellow-100 text-yellow-700">Passive</Badge>;
    return <Badge className="bg-red-100 text-red-700">Detractor</Badge>;
  };

  const getRatingStars = (rating: number | null) => {
    if (rating === null) return <span className="text-muted-foreground">-</span>;
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`}
          />
        ))}
      </div>
    );
  };

  const handleViewFeedback = (feedback: typeof mockFeedback[0]) => {
    setSelectedFeedback(feedback);
    setIsViewDialogOpen(true);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquareText className="h-7 w-7 text-primary" />
            Feedback Collection
          </h1>
          <p className="text-muted-foreground mt-1">
            Collect and analyze feedback from candidates who didn't join
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Settings className="mr-2 h-4 w-4" />
            Survey Settings
          </Button>
          <Button onClick={() => setIsRequestDialogOpen(true)}>
            <Send className="mr-2 h-4 w-4" />
            Request Feedback
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Response Rate</p>
                <p className="text-2xl font-bold">{responseRate.toFixed(0)}%</p>
              </div>
              <MessageCircle className="h-8 w-8 text-blue-500 opacity-80" />
            </div>
            <Progress value={responseRate} className="mt-2 h-1.5" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg. NPS Score</p>
                <p className="text-2xl font-bold text-primary">{avgNPS.toFixed(1)}</p>
              </div>
              {avgNPS >= 7 ? (
                <ThumbsUp className="h-8 w-8 text-green-500 opacity-80" />
              ) : avgNPS >= 5 ? (
                <Meh className="h-8 w-8 text-yellow-500 opacity-80" />
              ) : (
                <ThumbsDown className="h-8 w-8 text-red-500 opacity-80" />
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg. Rating</p>
                <p className="text-2xl font-bold">{avgRating.toFixed(1)}/5</p>
              </div>
              <Star className="h-8 w-8 text-yellow-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Would Recommend</p>
                <p className="text-2xl font-bold text-green-600">{recommendRate.toFixed(0)}%</p>
              </div>
              <Heart className="h-8 w-8 text-pink-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">{totalCandidates - respondedCount}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
          <TabsTrigger value="responses">
            <MessageCircle className="mr-2 h-4 w-4" />
            Responses
          </TabsTrigger>
          <TabsTrigger value="reasons">
            <Lightbulb className="mr-2 h-4 w-4" />
            Reasons Analysis
          </TabsTrigger>
          <TabsTrigger value="suggestions">
            <FileText className="mr-2 h-4 w-4" />
            Suggestions
          </TabsTrigger>
          <TabsTrigger value="trends">
            <BarChart3 className="mr-2 h-4 w-4" />
            Trends
          </TabsTrigger>
        </TabsList>

        {/* Responses Tab */}
        <TabsContent value="responses" className="mt-6">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <CardTitle>Feedback Responses</CardTitle>
                  <CardDescription>All collected feedback from candidates</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={isExporting} onClick={async () => {
                    setIsExporting(true);
                    try {
                      await new Promise(r => setTimeout(r, 800));
                      toast.success('Feedback report exported successfully');
                    } finally {
                      setIsExporting(false);
                    }
                  }}>
                    {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
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
                    <SelectValue placeholder="Filter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Candidates</SelectItem>
                    <SelectItem value="responded">Responded</SelectItem>
                    <SelectItem value="pending">Pending Response</SelectItem>
                    <SelectItem value="declined_offer">Declined Offer</SelectItem>
                    <SelectItem value="expired_offer">Expired Offer</SelectItem>
                    <SelectItem value="not_shortlisted">Not Shortlisted</SelectItem>
                    <SelectItem value="withdrew">Withdrew</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Responses List */}
              <div className="space-y-4">
                {filteredFeedback.map((feedback) => (
                  <div key={feedback.id} className="p-4 border rounded-lg hover:bg-muted/30">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className={`p-2 rounded-full ${
                          feedback.responded ? 'bg-green-100' : 'bg-gray-100'
                        }`}>
                          {feedback.responded ? (
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                          ) : (
                            <Clock className="h-5 w-5 text-gray-400" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{feedback.candidateName}</p>
                          <p className="text-sm text-muted-foreground">{feedback.program}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {getStatusBadge(feedback.status)}
                            {feedback.feedbackDate && (
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(feedback.feedbackDate), 'MMM dd, yyyy')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {feedback.responded ? (
                        <div className="flex items-center gap-6">
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground">NPS</p>
                            <div className="flex items-center gap-1">
                              <span className="font-bold text-lg">{feedback.npsScore}</span>
                              {getNPSBadge(feedback.npsScore)}
                            </div>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground">Rating</p>
                            {getRatingStars(feedback.overallRating)}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewFeedback(feedback)}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" disabled={sendingRequestTo === feedback.id} onClick={async () => {
                          setSendingRequestTo(feedback.id);
                          try {
                            await new Promise(r => setTimeout(r, 500));
                            toast.success('Feedback request sent successfully');
                          } finally {
                            setSendingRequestTo(null);
                          }
                        }}>
                          {sendingRequestTo === feedback.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                          Request Feedback
                        </Button>
                      )}
                    </div>
                    {feedback.responded && feedback.primaryReason && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="flex items-start gap-2">
                          <Lightbulb className="h-4 w-4 text-yellow-500 mt-0.5" />
                          <div>
                            <p className="text-sm">
                              <strong>Primary reason:</strong> {feedback.primaryReason}
                            </p>
                            {feedback.comments && (
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                "{feedback.comments}"
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reasons Analysis Tab */}
        <TabsContent value="reasons" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Primary Reasons */}
            <Card>
              <CardHeader>
                <CardTitle>Primary Reasons for Not Joining</CardTitle>
                <CardDescription>Most common reasons cited by candidates</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {feedbackReasons.map((reason, index) => (
                    <div key={reason.reason} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">
                            {index + 1}
                          </span>
                          <span className="text-sm font-medium">{reason.reason}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{reason.count}</span>
                          <Badge variant="outline">{reason.percent}%</Badge>
                        </div>
                      </div>
                      <Progress value={reason.percent} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Status-wise Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Reasons by Status</CardTitle>
                <CardDescription>Top reason for each status category</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { status: 'Declined Offer', reason: 'Joined another institution', count: 12 },
                    { status: 'Offer Expired', reason: 'Financial constraints', count: 5 },
                    { status: 'Not Shortlisted', reason: 'Interview feedback', count: 3 },
                    { status: 'Withdrew', reason: 'Personal reasons', count: 4 }
                  ].map((item) => (
                    <div key={item.status} className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{item.status}</span>
                        <Badge variant="outline">{item.count} responses</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Top reason: {item.reason}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Sentiment Analysis */}
            <Card>
              <CardHeader>
                <CardTitle>Sentiment Analysis</CardTitle>
                <CardDescription>Overall sentiment from feedback</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="p-4 bg-green-50 rounded-lg">
                      <Smile className="h-8 w-8 text-green-600 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-green-600">2</p>
                      <p className="text-xs text-green-700">Positive</p>
                    </div>
                    <div className="p-4 bg-yellow-50 rounded-lg">
                      <Meh className="h-8 w-8 text-yellow-600 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-yellow-600">1</p>
                      <p className="text-xs text-yellow-700">Neutral</p>
                    </div>
                    <div className="p-4 bg-red-50 rounded-lg">
                      <Frown className="h-8 w-8 text-red-600 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-red-600">1</p>
                      <p className="text-xs text-red-700">Negative</p>
                    </div>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <p className="text-sm font-medium mb-2">Key Sentiment Indicators:</p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Process Experience</span>
                        <Badge className="bg-green-100 text-green-700">Positive</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Communication</span>
                        <Badge className="bg-green-100 text-green-700">Positive</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Value for Money</span>
                        <Badge className="bg-yellow-100 text-yellow-700">Mixed</Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Competitive Analysis */}
            <Card>
              <CardHeader>
                <CardTitle>Competitive Insights</CardTitle>
                <CardDescription>Where candidates went instead</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { institution: 'Other Private Universities', count: 5 },
                    { institution: 'Government Institutions', count: 4 },
                    { institution: 'IITs/NITs', count: 2 },
                    { institution: 'Study Abroad', count: 1 }
                  ].map((item) => (
                    <div key={item.institution} className="flex items-center justify-between p-2 border rounded">
                      <span className="text-sm">{item.institution}</span>
                      <Badge variant="outline">{item.count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Suggestions Tab */}
        <TabsContent value="suggestions" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Candidate Suggestions</CardTitle>
                <CardDescription>Improvement ideas from candidates</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-4">
                    {mockFeedback.filter(f => f.suggestions).map((feedback) => (
                      <div key={feedback.id} className="p-4 border rounded-lg">
                        <div className="flex items-start gap-3">
                          <Lightbulb className="h-5 w-5 text-yellow-500 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm">{feedback.suggestions}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-xs text-muted-foreground">{feedback.candidateName}</span>
                              <span className="text-xs text-muted-foreground">•</span>
                              <span className="text-xs text-muted-foreground">{feedback.program}</span>
                              {getStatusBadge(feedback.status)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Common Themes</CardTitle>
                  <CardDescription>Frequently mentioned topics</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {[
                      { theme: 'Scholarship/Financial Aid', count: 8 },
                      { theme: 'Payment Flexibility', count: 5 },
                      { theme: 'Evaluation Transparency', count: 3 },
                      { theme: 'Communication Speed', count: 2 },
                      { theme: 'Deferment Option', count: 2 }
                    ].map((item) => (
                      <div key={item.theme} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                        <span className="text-sm">{item.theme}</span>
                        <Badge variant="outline">{item.count}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Action Items</CardTitle>
                  <CardDescription>Recommendations based on feedback</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { action: 'Review scholarship criteria', priority: 'high' },
                      { action: 'Introduce EMI options', priority: 'high' },
                      { action: 'Share interview rubric', priority: 'medium' },
                      { action: 'Add deferment policy', priority: 'low' }
                    ].map((item) => (
                      <div key={item.action} className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${
                          item.priority === 'high' ? 'bg-red-500' :
                          item.priority === 'medium' ? 'bg-yellow-500' : 'bg-gray-400'
                        }`} />
                        <span className="text-sm">{item.action}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* NPS Trend */}
            <Card>
              <CardHeader>
                <CardTitle>NPS Score Trend</CardTitle>
                <CardDescription>Monthly NPS score progression</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div>
                      <p className="text-sm text-muted-foreground">Current NPS</p>
                      <p className="text-3xl font-bold">{avgNPS.toFixed(0)}</p>
                    </div>
                    <div className="flex items-center gap-1 text-green-600">
                      <TrendingUp className="h-5 w-5" />
                      <span className="text-sm font-medium">+2.5 from last month</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {[
                      { month: 'Jan 2026', score: 6.5, change: 0 },
                      { month: 'Dec 2025', score: 6.0, change: -0.5 },
                      { month: 'Nov 2025', score: 6.5, change: 0.5 },
                      { month: 'Oct 2025', score: 6.0, change: -0.2 }
                    ].map((item) => (
                      <div key={item.month} className="flex items-center justify-between p-2 border rounded">
                        <span className="text-sm">{item.month}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{item.score}</span>
                          {item.change > 0 ? (
                            <TrendingUp className="h-4 w-4 text-green-500" />
                          ) : item.change < 0 ? (
                            <TrendingDown className="h-4 w-4 text-red-500" />
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Response Rate Trend */}
            <Card>
              <CardHeader>
                <CardTitle>Response Rate Trend</CardTitle>
                <CardDescription>Feedback collection performance</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div>
                      <p className="text-sm text-muted-foreground">Current Rate</p>
                      <p className="text-3xl font-bold">{responseRate.toFixed(0)}%</p>
                    </div>
                    <div className="flex items-center gap-1 text-green-600">
                      <TrendingUp className="h-5 w-5" />
                      <span className="text-sm font-medium">+5% from last month</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {[
                      { month: 'Jan 2026', sent: 5, received: 4, rate: 80 },
                      { month: 'Dec 2025', sent: 12, received: 9, rate: 75 },
                      { month: 'Nov 2025', sent: 15, received: 10, rate: 67 },
                      { month: 'Oct 2025', sent: 8, received: 5, rate: 63 }
                    ].map((item) => (
                      <div key={item.month} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span>{item.month}</span>
                          <span>{item.received}/{item.sent} ({item.rate}%)</span>
                        </div>
                        <Progress value={item.rate} className="h-2" />
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Rating Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Rating Distribution</CardTitle>
                <CardDescription>Overall experience ratings</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[5, 4, 3, 2, 1].map((rating) => {
                    const count = mockFeedback.filter(f => f.overallRating === rating).length;
                    const percent = respondedCount > 0 ? (count / respondedCount) * 100 : 0;
                    return (
                      <div key={rating} className="flex items-center gap-4">
                        <div className="flex items-center gap-1 w-24">
                          {[...Array(rating)].map((_, i) => (
                            <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                          ))}
                        </div>
                        <div className="flex-1 h-4 bg-muted rounded overflow-hidden">
                          <div
                            className="h-full bg-yellow-400"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="w-8 text-sm text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Recommendation Trend */}
            <Card>
              <CardHeader>
                <CardTitle>Recommendation Rate</CardTitle>
                <CardDescription>Would recommend to others</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="p-4 bg-green-50 rounded-lg">
                      <ThumbsUp className="h-8 w-8 text-green-600 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-green-600">
                        {mockFeedback.filter(f => f.wouldRecommend === true).length}
                      </p>
                      <p className="text-xs text-green-700">Would Recommend</p>
                    </div>
                    <div className="p-4 bg-red-50 rounded-lg">
                      <ThumbsDown className="h-8 w-8 text-red-600 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-red-600">
                        {mockFeedback.filter(f => f.wouldRecommend === false).length}
                      </p>
                      <p className="text-xs text-red-700">Would Not Recommend</p>
                    </div>
                  </div>
                  <div className="p-3 border rounded-lg">
                    <p className="text-sm text-center">
                      <strong>{recommendRate.toFixed(0)}%</strong> of respondents would recommend us
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* View Feedback Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Feedback Details</DialogTitle>
            <DialogDescription>
              {selectedFeedback?.candidateName} - {selectedFeedback?.program}
            </DialogDescription>
          </DialogHeader>
          {selectedFeedback && selectedFeedback.responded && (
            <div className="space-y-6 py-4">
              {/* Ratings */}
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 border rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Overall Rating</p>
                  {getRatingStars(selectedFeedback.overallRating)}
                </div>
                <div className="text-center p-3 border rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">NPS Score</p>
                  <p className="text-2xl font-bold">{selectedFeedback.npsScore}</p>
                </div>
                <div className="text-center p-3 border rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Recommend?</p>
                  {selectedFeedback.wouldRecommend ? (
                    <ThumbsUp className="h-6 w-6 text-green-600 mx-auto" />
                  ) : (
                    <ThumbsDown className="h-6 w-6 text-red-600 mx-auto" />
                  )}
                </div>
              </div>

              {/* Detailed Ratings */}
              <div className="space-y-3">
                <p className="font-medium">Detailed Ratings</p>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Process</p>
                    {getRatingStars(selectedFeedback.processRating)}
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Communication</p>
                    {getRatingStars(selectedFeedback.communicationRating)}
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Transparency</p>
                    {getRatingStars(selectedFeedback.transparencyRating)}
                  </div>
                </div>
              </div>

              {/* Reasons */}
              <div className="space-y-2">
                <p className="font-medium">Reasons for Not Joining</p>
                <div className="flex flex-wrap gap-2">
                  <Badge className="bg-primary/10 text-primary">{selectedFeedback.primaryReason}</Badge>
                  {selectedFeedback.secondaryReasons.map((reason) => (
                    <Badge key={reason} variant="outline">{reason}</Badge>
                  ))}
                </div>
              </div>

              {/* Comments */}
              {selectedFeedback.comments && (
                <div className="space-y-2">
                  <p className="font-medium">Comments</p>
                  <p className="text-sm p-3 bg-muted/50 rounded-lg">"{selectedFeedback.comments}"</p>
                </div>
              )}

              {/* Suggestions */}
              {selectedFeedback.suggestions && (
                <div className="space-y-2">
                  <p className="font-medium">Suggestions</p>
                  <div className="flex items-start gap-2 p-3 bg-yellow-50 rounded-lg">
                    <Lightbulb className="h-4 w-4 text-yellow-600 mt-0.5" />
                    <p className="text-sm">{selectedFeedback.suggestions}</p>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Feedback Dialog */}
      <Dialog open={isRequestDialogOpen} onOpenChange={setIsRequestDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request Feedback</DialogTitle>
            <DialogDescription>
              Send feedback survey to candidates who didn't join
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Target Group</Label>
              <Select defaultValue="all">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Pending ({totalCandidates - respondedCount})</SelectItem>
                  <SelectItem value="declined">Declined Offers</SelectItem>
                  <SelectItem value="expired">Expired Offers</SelectItem>
                  <SelectItem value="withdrew">Withdrew</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Message Template</Label>
              <Select defaultValue="default">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Standard Feedback Request</SelectItem>
                  <SelectItem value="reminder">Reminder Email</SelectItem>
                  <SelectItem value="final">Final Request</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm">
                <strong>Preview:</strong> {totalCandidates - respondedCount} candidates will receive feedback request
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRequestDialogOpen(false)}>
              Cancel
            </Button>
            <Button disabled={isSendingRequest} onClick={async () => {
              setIsSendingRequest(true);
              try {
                await new Promise(r => setTimeout(r, 800));
                setIsRequestDialogOpen(false);
                toast.success('Feedback requests sent successfully');
              } finally {
                setIsSendingRequest(false);
              }
            }}>
              {isSendingRequest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send Requests
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function FeedbackPage() {
  return (
    <AdmissionErrorBoundary>
      <FeedbackPageContent />
    </AdmissionErrorBoundary>
  );
}
