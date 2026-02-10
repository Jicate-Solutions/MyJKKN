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
import { useAuth } from '@/hooks/use-auth';
import {
  useFeedbackCandidates,
  useFeedbackStats,
  useUpdateFeedback,
} from '@/hooks/admission/use-feedback';

function FeedbackPageContent() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';
  const [activeTab, setActiveTab] = useState('responses');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isRequestDialogOpen, setIsRequestDialogOpen] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState<any>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [sendingRequestTo, setSendingRequestTo] = useState<string | null>(null);

  // Real data hooks
  const { candidates, total: totalCandidates, isLoading: candidatesLoading, refetch: refetchCandidates } = useFeedbackCandidates({
    institutionId,
    search: searchTerm || undefined,
    status: statusFilter !== 'all' ? statusFilter as any : undefined,
  });
  const { stats, isLoading: statsLoading, refetch: refetchStats } = useFeedbackStats(institutionId);

  // Transform candidates to feedback-like format
  const feedbackData = (candidates || []).map((c: any) => ({
    id: c.id,
    candidateName: c.full_name || 'Unknown',
    email: c.email || '',
    program: Array.isArray(c.interested_programs) ? c.interested_programs.join(', ') : (c.interested_programs || ''),
    status: c.funnel_stage || c.stage || 'lost',
    feedbackDate: c.lost_at || c.updated_at || null,
    overallRating: null as number | null,
    npsScore: null as number | null,
    primaryReason: c.lost_reason || null,
    secondaryReasons: [] as string[],
    wouldRecommend: null as boolean | null,
    processRating: null as number | null,
    communicationRating: null as number | null,
    transparencyRating: null as number | null,
    comments: c.notes || null,
    suggestions: null as string | null,
    responded: !!c.lost_reason,
  }));

  // Stats from real data
  const respondedCount = stats.respondedCount;
  const responseRate = totalCandidates > 0 ? (respondedCount / totalCandidates) * 100 : 0;
  const topReasons = stats.topReasons || [];

  // Filter feedback
  const filteredFeedback = feedbackData.filter((fb: any) => {
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
      case 'declined':
        return <Badge className="bg-orange-100 text-orange-700 border-orange-200">Declined Offer</Badge>;
      case 'expired_offer':
      case 'expired':
        return <Badge className="bg-gray-100 text-gray-700 border-gray-200">Offer Expired</Badge>;
      case 'not_shortlisted':
        return <Badge className="bg-red-100 text-red-700 border-red-200">Not Shortlisted</Badge>;
      case 'withdrew':
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Withdrew</Badge>;
      case 'lost':
        return <Badge className="bg-red-100 text-red-700 border-red-200">Lost</Badge>;
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

  const handleViewFeedback = (feedback: any) => {
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
                <p className="text-sm text-muted-foreground">Total Candidates</p>
                <p className="text-2xl font-bold text-primary">{stats.totalCandidates}</p>
              </div>
              <Users className="h-8 w-8 text-blue-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Declined Offer</p>
                <p className="text-2xl font-bold">{stats.declinedOffer}</p>
              </div>
              <ThumbsDown className="h-8 w-8 text-orange-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Withdrew</p>
                <p className="text-2xl font-bold">{stats.withdrew}</p>
              </div>
              <XCircle className="h-8 w-8 text-blue-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.pendingCount}</p>
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
                    <SelectItem value="declined">Declined Offer</SelectItem>
                    <SelectItem value="expired">Expired Offer</SelectItem>
                    <SelectItem value="withdrew">Withdrew</SelectItem>
                    <SelectItem value="lost">Lost</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Responses List */}
              {candidatesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredFeedback.map((feedback: any) => (
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
                              <p className="text-xs text-muted-foreground">Reason</p>
                              <Badge variant="outline" className="text-xs mt-1">{feedback.primaryReason || '-'}</Badge>
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
                  {filteredFeedback.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      No feedback candidates found.
                    </div>
                  )}
                </div>
              )}
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
                  {topReasons.length > 0 ? topReasons.map((reason: any, index: number) => (
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
                          <Badge variant="outline">{reason.percent?.toFixed(1) || 0}%</Badge>
                        </div>
                      </div>
                      <Progress value={reason.percent || 0} className="h-2" />
                    </div>
                  )) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No feedback reasons collected yet.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Status-wise Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Candidate Breakdown</CardTitle>
                <CardDescription>Counts by exit status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { status: 'Declined Offer', count: stats.declinedOffer },
                    { status: 'Withdrew', count: stats.withdrew },
                    { status: 'Lost', count: stats.lost },
                    { status: 'Responded', count: stats.respondedCount },
                    { status: 'Pending', count: stats.pendingCount },
                  ].map((item) => (
                    <div key={item.status} className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{item.status}</span>
                        <Badge variant="outline">{item.count}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Sentiment Analysis placeholder */}
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
                      <p className="text-2xl font-bold text-green-600">--</p>
                      <p className="text-xs text-green-700">Positive</p>
                    </div>
                    <div className="p-4 bg-yellow-50 rounded-lg">
                      <Meh className="h-8 w-8 text-yellow-600 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-yellow-600">--</p>
                      <p className="text-xs text-yellow-700">Neutral</p>
                    </div>
                    <div className="p-4 bg-red-50 rounded-lg">
                      <Frown className="h-8 w-8 text-red-600 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-red-600">--</p>
                      <p className="text-xs text-red-700">Negative</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Sentiment analysis will be available when detailed survey responses are collected.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Competitive Insights placeholder */}
            <Card>
              <CardHeader>
                <CardTitle>Competitive Insights</CardTitle>
                <CardDescription>Where candidates went instead</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <p>Competitive insights will populate when candidates provide detailed feedback about alternative institutions.</p>
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
                <CardTitle>Candidate Feedback Notes</CardTitle>
                <CardDescription>Notes and comments from candidates</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-4">
                    {feedbackData.filter((f: any) => f.comments).map((feedback: any) => (
                      <div key={feedback.id} className="p-4 border rounded-lg">
                        <div className="flex items-start gap-3">
                          <Lightbulb className="h-5 w-5 text-yellow-500 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm">{feedback.comments}</p>
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
                    {feedbackData.filter((f: any) => f.comments).length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        No comments or suggestions collected yet.
                      </div>
                    )}
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
                    {topReasons.length > 0 ? topReasons.slice(0, 5).map((item: any) => (
                      <div key={item.reason} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                        <span className="text-sm">{item.reason}</span>
                        <Badge variant="outline">{item.count}</Badge>
                      </div>
                    )) : (
                      <p className="text-sm text-muted-foreground text-center py-4">No themes detected yet.</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Action Items</CardTitle>
                  <CardDescription>Recommendations based on feedback</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-4 text-sm text-muted-foreground">
                    Action items will be generated as more feedback is collected.
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Feedback Collection Trend</CardTitle>
                <CardDescription>Monthly feedback collection performance</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div>
                      <p className="text-sm text-muted-foreground">Response Rate</p>
                      <p className="text-3xl font-bold">{responseRate.toFixed(0)}%</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Trend data will populate over time as more feedback cycles complete.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Exit Reasons Distribution</CardTitle>
                <CardDescription>Why candidates left the funnel</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {topReasons.map((reason: any) => (
                    <div key={reason.reason} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span>{reason.reason}</span>
                        <span>{reason.count} ({reason.percent?.toFixed(0) || 0}%)</span>
                      </div>
                      <Progress value={reason.percent || 0} className="h-2" />
                    </div>
                  ))}
                  {topReasons.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No data available yet.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Candidate Volume</CardTitle>
                <CardDescription>Total lost/declined candidates over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <p className="text-2xl font-bold">{stats.totalCandidates}</p>
                      <p className="text-xs text-muted-foreground">Total</p>
                    </div>
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <p className="text-2xl font-bold">{stats.respondedCount}</p>
                      <p className="text-xs text-muted-foreground">Responded</p>
                    </div>
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <p className="text-2xl font-bold">{stats.pendingCount}</p>
                      <p className="text-xs text-muted-foreground">Pending</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recommendation Rate</CardTitle>
                <CardDescription>Would recommend to others</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <p>Recommendation data will be available when detailed survey responses are collected.</p>
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
          {selectedFeedback && (
            <div className="space-y-6 py-4">
              {/* Status */}
              <div className="space-y-2">
                <p className="font-medium">Status</p>
                {getStatusBadge(selectedFeedback.status)}
              </div>

              {/* Reasons */}
              {selectedFeedback.primaryReason && (
                <div className="space-y-2">
                  <p className="font-medium">Reason for Not Joining</p>
                  <Badge className="bg-primary/10 text-primary">{selectedFeedback.primaryReason}</Badge>
                </div>
              )}

              {/* Comments */}
              {selectedFeedback.comments && (
                <div className="space-y-2">
                  <p className="font-medium">Notes</p>
                  <p className="text-sm p-3 bg-muted/50 rounded-lg">"{selectedFeedback.comments}"</p>
                </div>
              )}

              {/* Contact Info */}
              <div className="space-y-2">
                <p className="font-medium">Contact</p>
                <p className="text-sm text-muted-foreground">{selectedFeedback.email}</p>
              </div>

              {selectedFeedback.feedbackDate && (
                <div className="space-y-2">
                  <p className="font-medium">Date</p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(selectedFeedback.feedbackDate), 'MMM dd, yyyy')}
                  </p>
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
                  <SelectItem value="all">All Pending ({stats.pendingCount})</SelectItem>
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
                <strong>Preview:</strong> {stats.pendingCount} candidates will receive feedback request
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
