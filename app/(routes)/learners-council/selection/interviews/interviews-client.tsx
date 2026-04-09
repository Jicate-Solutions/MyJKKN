'use client';

/**
 * LC-005: Interviews Client Component
 * Dedicated interview management: listing, scheduling, scoring, cancelling, rescheduling
 */

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Calendar,
  UserCheck,
  Star,
  Clock,
  ClipboardCheck,
  ArrowLeft,
  CalendarPlus,
  XCircle,
  RefreshCw
} from 'lucide-react';
import Link from 'next/link';
import {
  useNominations,
  useScheduleInterview,
  useSubmitInterviewScore,
  useCancelInterview,
  useRescheduleInterview
} from '@/hooks/learners-council/use-lc-selection';
import type { LCNomination, LCInterview, InterviewStatus } from '@/types/learners-council';

// ============================================================================
// HELPERS
// ============================================================================

function getInterviewStatusBadge(status: InterviewStatus) {
  const config: Record<InterviewStatus, { color: string; label: string }> = {
    scheduled: { color: 'bg-blue-100 text-blue-800', label: 'Scheduled' },
    in_progress: { color: 'bg-yellow-100 text-yellow-800', label: 'In Progress' },
    completed: { color: 'bg-green-100 text-green-800', label: 'Completed' },
    cancelled: { color: 'bg-red-100 text-red-800', label: 'Cancelled' },
    no_show: { color: 'bg-gray-100 text-gray-800', label: 'No Show' }
  };
  const c = config[status] || { color: 'bg-gray-100 text-gray-800', label: status };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.color}`}>
      {c.label}
    </span>
  );
}

function getRecommendationBadge(recommendation: string | null) {
  if (!recommendation) return null;
  const config: Record<string, { color: string; label: string }> = {
    strongly_recommend: { color: 'bg-emerald-100 text-emerald-800', label: 'Strongly Recommend' },
    recommend: { color: 'bg-green-100 text-green-800', label: 'Recommend' },
    neutral: { color: 'bg-gray-100 text-gray-800', label: 'Neutral' },
    not_recommend: { color: 'bg-red-100 text-red-800', label: 'Not Recommend' }
  };
  const c = config[recommendation] || { color: 'bg-gray-100 text-gray-800', label: recommendation };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.color}`}>
      {c.label}
    </span>
  );
}

/** Flatten interviews from all nominations into a single list with candidate info */
interface FlatInterview {
  interview: LCInterview;
  candidateName: string;
  candidateEmail: string;
  roleSought: string;
  nominationId: string;
}

function flattenInterviews(nominations: LCNomination[]): FlatInterview[] {
  const result: FlatInterview[] = [];
  for (const nom of nominations) {
    if (nom.interviews && nom.interviews.length > 0) {
      for (const interview of nom.interviews) {
        result.push({
          interview,
          candidateName: (nom.nominee as any)?.full_name || 'Unknown',
          candidateEmail: (nom.nominee as any)?.email || '',
          roleSought: nom.role_sought,
          nominationId: nom.id
        });
      }
    }
  }
  return result;
}

// ============================================================================
// COMPONENT
// ============================================================================

interface InterviewsClientProps {
  userId: string;
  userName: string;
  institutionId: string;
  electionId: string;
  allElections: { id: string; title: string; status: string; type: string }[];
  isStaffOrAdmin: boolean;
}

export function InterviewsClient({
  userId,
  userName,
  institutionId,
  electionId,
  allElections,
  isStaffOrAdmin
}: InterviewsClientProps) {
  // Filter state
  const [selectedElection, setSelectedElection] = useState(electionId);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const activeElectionId = selectedElection || electionId;

  // Fetch nominations (which include nested interviews)
  const { data: nominations, isLoading } = useNominations(activeElectionId);

  // Mutations
  const scheduleInterview = useScheduleInterview();
  const submitScore = useSubmitInterviewScore();
  const cancelInterview = useCancelInterview();
  const rescheduleInterview = useRescheduleInterview();

  // Schedule interview dialog state
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleNomId, setScheduleNomId] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleMaxScore, setScheduleMaxScore] = useState('100');

  // Score interview dialog state
  const [scoreOpen, setScoreOpen] = useState(false);
  const [scoreInterviewId, setScoreInterviewId] = useState('');
  const [scoreNomId, setScoreNomId] = useState('');
  const [scoreValue, setScoreValue] = useState('');
  const [scoreNotes, setScoreNotes] = useState('');
  const [scoreRecommendation, setScoreRecommendation] = useState('neutral');
  const [criteriaScores, setCriteriaScores] = useState<
    { criterion: string; score: number; max: number; notes: string }[]
  >([
    { criterion: 'Leadership', score: 0, max: 25, notes: '' },
    { criterion: 'Communication', score: 0, max: 25, notes: '' },
    { criterion: 'Vision & Ideas', score: 0, max: 25, notes: '' },
    { criterion: 'Commitment', score: 0, max: 25, notes: '' }
  ]);

  // Cancel interview dialog state
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelInterviewId, setCancelInterviewId] = useState('');
  const [cancelNomId, setCancelNomId] = useState('');
  const [cancelReason, setCancelReason] = useState('');

  // Reschedule interview dialog state
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleInterviewId, setRescheduleInterviewId] = useState('');
  const [rescheduleNomId, setRescheduleNomId] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');

  // Flatten and filter interviews
  const allInterviews = useMemo(() => {
    if (!nominations) return [];
    return flattenInterviews(nominations);
  }, [nominations]);

  const filteredInterviews = useMemo(() => {
    if (statusFilter === 'all') return allInterviews;
    return allInterviews.filter((fi) => fi.interview.status === statusFilter);
  }, [allInterviews, statusFilter]);

  // Eligible nominations (those without completed interviews, for scheduling)
  const eligibleNominations = useMemo(() => {
    if (!nominations) return [];
    return nominations.filter(
      (nom: LCNomination) =>
        nom.status === 'eligible' || nom.status === 'shortlisted'
    );
  }, [nominations]);

  // Stats
  const stats = useMemo(() => {
    const scheduled = allInterviews.filter((fi) => fi.interview.status === 'scheduled').length;
    const inProgress = allInterviews.filter((fi) => fi.interview.status === 'in_progress').length;
    const completed = allInterviews.filter((fi) => fi.interview.status === 'completed').length;
    const cancelled = allInterviews.filter((fi) => fi.interview.status === 'cancelled').length;
    return { total: allInterviews.length, scheduled, inProgress, completed, cancelled };
  }, [allInterviews]);

  // Handlers
  const handleScheduleInterview = () => {
    if (!scheduleNomId || !scheduleDate) return;
    scheduleInterview.mutate(
      {
        nomination_id: scheduleNomId,
        interviewer_id: userId,
        scheduled_at: new Date(scheduleDate).toISOString(),
        max_score: parseInt(scheduleMaxScore) || 100
      },
      {
        onSuccess: () => {
          setScheduleOpen(false);
          setScheduleNomId('');
          setScheduleDate('');
          setScheduleMaxScore('100');
        }
      }
    );
  };

  const handleSubmitScore = () => {
    if (!scoreInterviewId || !scoreValue) return;
    submitScore.mutate(
      {
        interviewId: scoreInterviewId,
        score: parseFloat(scoreValue),
        criteriaScores,
        notes: scoreNotes,
        recommendation: scoreRecommendation,
        nominationId: scoreNomId
      },
      {
        onSuccess: () => {
          setScoreOpen(false);
          setScoreInterviewId('');
          setScoreNomId('');
          setScoreValue('');
          setScoreNotes('');
          setScoreRecommendation('neutral');
          setCriteriaScores([
            { criterion: 'Leadership', score: 0, max: 25, notes: '' },
            { criterion: 'Communication', score: 0, max: 25, notes: '' },
            { criterion: 'Vision & Ideas', score: 0, max: 25, notes: '' },
            { criterion: 'Commitment', score: 0, max: 25, notes: '' }
          ]);
        }
      }
    );
  };

  const handleCancelInterview = () => {
    if (!cancelInterviewId) return;
    cancelInterview.mutate(
      {
        interviewId: cancelInterviewId,
        reason: cancelReason || 'Cancelled by administrator',
        nominationId: cancelNomId
      },
      {
        onSuccess: () => {
          setCancelOpen(false);
          setCancelInterviewId('');
          setCancelNomId('');
          setCancelReason('');
        }
      }
    );
  };

  const handleRescheduleInterview = () => {
    if (!rescheduleInterviewId || !rescheduleDate || !rescheduleTime) return;
    rescheduleInterview.mutate(
      {
        interviewId: rescheduleInterviewId,
        newDate: rescheduleDate,
        newTime: rescheduleTime,
        nominationId: rescheduleNomId
      },
      {
        onSuccess: () => {
          setRescheduleOpen(false);
          setRescheduleInterviewId('');
          setRescheduleNomId('');
          setRescheduleDate('');
          setRescheduleTime('');
        }
      }
    );
  };

  const updateCriteriaScore = (index: number, field: keyof typeof criteriaScores[0], value: string | number) => {
    setCriteriaScores((prev) =>
      prev.map((cs, i) =>
        i === index ? { ...cs, [field]: field === 'score' || field === 'max' ? Number(value) : value } : cs
      )
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/learners-council/selection"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Elections
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-primary" />
            Interview Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Schedule, track, and score candidate interviews
          </p>
        </div>
        {isStaffOrAdmin && activeElectionId && eligibleNominations.length > 0 && (
          <Button onClick={() => setScheduleOpen(true)}>
            <CalendarPlus className="h-4 w-4 mr-2" />
            Schedule Interview
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="w-full sm:w-64">
          <Label className="text-xs text-muted-foreground mb-1 block">Election</Label>
          <Select value={selectedElection} onValueChange={setSelectedElection}>
            <SelectTrigger>
              <SelectValue placeholder="Select an election..." />
            </SelectTrigger>
            <SelectContent>
              {allElections.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.title} ({e.status.replace(/_/g, ' ')})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-48">
          <Label className="text-xs text-muted-foreground mb-1 block">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="no_show">No Show</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats Cards */}
      {activeElectionId && !isLoading && allInterviews.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-600" />
                <span className="text-sm text-muted-foreground">Scheduled</span>
              </div>
              <p className="text-2xl font-bold mt-1">{stats.scheduled}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-yellow-600" />
                <span className="text-sm text-muted-foreground">In Progress</span>
              </div>
              <p className="text-2xl font-bold mt-1">{stats.inProgress}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-green-600" />
                <span className="text-sm text-muted-foreground">Completed</span>
              </div>
              <p className="text-2xl font-bold mt-1">{stats.completed}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-600" />
                <span className="text-sm text-muted-foreground">Total</span>
              </div>
              <p className="text-2xl font-bold mt-1">{stats.total}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Content */}
      {!activeElectionId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Calendar className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <h3 className="font-medium">Select an Election</h3>
            <p className="text-sm mt-1">
              Choose an election above to view and manage interviews
            </p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card>
          <CardContent className="py-12 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </CardContent>
        </Card>
      ) : filteredInterviews.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardCheck className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-medium">No Interviews Scheduled Yet</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {isStaffOrAdmin
                ? 'Schedule interviews for eligible or shortlisted candidates using the button above.'
                : 'No interviews have been scheduled for this election yet.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              Interviews ({filteredInterviews.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Interviewer</TableHead>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Recommendation</TableHead>
                    {isStaffOrAdmin && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInterviews.map((fi) => (
                    <TableRow key={fi.interview.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{fi.candidateName}</p>
                          <p className="text-xs text-muted-foreground">{fi.candidateEmail}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {fi.roleSought.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {(fi.interview.interviewer as any)?.full_name || 'Unassigned'}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{new Date(fi.interview.scheduled_at).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground text-xs mt-0.5">
                          <Clock className="h-3 w-3" />
                          <span>{new Date(fi.interview.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getInterviewStatusBadge(fi.interview.status)}
                      </TableCell>
                      <TableCell>
                        {fi.interview.score !== null ? (
                          <span className="font-medium text-sm">
                            {fi.interview.score}/{fi.interview.max_score}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">--</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {getRecommendationBadge(fi.interview.recommendation)}
                      </TableCell>
                      {isStaffOrAdmin && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {(fi.interview.status === 'scheduled' || fi.interview.status === 'in_progress') && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => {
                                  setScoreInterviewId(fi.interview.id);
                                  setScoreNomId(fi.nominationId);
                                  setScoreOpen(true);
                                }}
                              >
                                <Star className="h-3 w-3 mr-1" />
                                Score
                              </Button>
                            )}
                            {fi.interview.status === 'scheduled' && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    setRescheduleInterviewId(fi.interview.id);
                                    setRescheduleNomId(fi.nominationId);
                                    setRescheduleOpen(true);
                                  }}
                                >
                                  <RefreshCw className="h-3 w-3 mr-1" />
                                  Reschedule
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs text-red-700 border-red-200 hover:bg-red-50"
                                  onClick={() => {
                                    setCancelInterviewId(fi.interview.id);
                                    setCancelNomId(fi.nominationId);
                                    setCancelOpen(true);
                                  }}
                                >
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Cancel
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Completed interview details */}
            {filteredInterviews.some((fi) => fi.interview.status === 'completed' && fi.interview.criteria_scores) && (
              <div className="mt-6 space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Detailed Scores
                </h3>
                {filteredInterviews
                  .filter((fi) => fi.interview.status === 'completed' && fi.interview.criteria_scores)
                  .map((fi) => (
                    <Card key={`detail-${fi.interview.id}`} className="border-muted">
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="font-medium text-sm">{fi.candidateName}</p>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              {fi.interview.score}/{fi.interview.max_score}
                            </Badge>
                            {getRecommendationBadge(fi.interview.recommendation)}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {fi.interview.criteria_scores?.map((cs, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2 bg-muted/30 rounded text-sm">
                              <span>{cs.criterion}</span>
                              <span className="font-medium">{cs.score}/{cs.max}</span>
                            </div>
                          ))}
                        </div>
                        {fi.interview.overall_notes && (
                          <div className="mt-2 p-2 bg-muted/30 rounded">
                            <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                            <p className="text-sm">{fi.interview.overall_notes}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Schedule Interview Dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Interview</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Candidate</Label>
              <Select value={scheduleNomId} onValueChange={setScheduleNomId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a candidate..." />
                </SelectTrigger>
                <SelectContent>
                  {eligibleNominations.map((nom: LCNomination) => (
                    <SelectItem key={nom.id} value={nom.id}>
                      {(nom.nominee as any)?.full_name || 'Unknown'} - {nom.role_sought.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Interview Date & Time</Label>
              <Input
                type="datetime-local"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Maximum Score</Label>
              <Input
                type="number"
                value={scheduleMaxScore}
                onChange={(e) => setScheduleMaxScore(e.target.value)}
                min="1"
                max="1000"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={handleScheduleInterview}
              disabled={!scheduleNomId || !scheduleDate || scheduleInterview.isPending}
            >
              {scheduleInterview.isPending ? 'Scheduling...' : 'Schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Score Interview Dialog */}
      <Dialog open={scoreOpen} onOpenChange={setScoreOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Submit Interview Score</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
            {/* Criteria Scores */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Criteria Scores</Label>
              {criteriaScores.map((cs, idx) => (
                <div key={idx} className="p-3 border rounded-md space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{cs.criterion}</span>
                    <span className="text-xs text-muted-foreground">
                      {cs.score}/{cs.max}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Score</Label>
                      <Input
                        type="number"
                        value={cs.score}
                        onChange={(e) => updateCriteriaScore(idx, 'score', e.target.value)}
                        min="0"
                        max={cs.max}
                        className="h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Max</Label>
                      <Input
                        type="number"
                        value={cs.max}
                        onChange={(e) => updateCriteriaScore(idx, 'max', e.target.value)}
                        min="1"
                        className="h-8"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Notes</Label>
                    <Input
                      value={cs.notes}
                      onChange={(e) => updateCriteriaScore(idx, 'notes', e.target.value)}
                      placeholder="Brief observations..."
                      className="h-8"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Overall Score */}
            <div className="space-y-2">
              <Label>Overall Score</Label>
              <Input
                type="number"
                placeholder="e.g., 85"
                value={scoreValue}
                onChange={(e) => setScoreValue(e.target.value)}
                min="0"
              />
              <p className="text-xs text-muted-foreground">
                Criteria total: {criteriaScores.reduce((sum, cs) => sum + cs.score, 0)}/
                {criteriaScores.reduce((sum, cs) => sum + cs.max, 0)}
              </p>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Overall Notes</Label>
              <Textarea
                placeholder="Interview observations and feedback..."
                value={scoreNotes}
                onChange={(e) => setScoreNotes(e.target.value)}
                rows={3}
              />
            </div>

            {/* Recommendation */}
            <div className="space-y-2">
              <Label>Recommendation</Label>
              <Select value={scoreRecommendation} onValueChange={setScoreRecommendation}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="strongly_recommend">Strongly Recommend</SelectItem>
                  <SelectItem value="recommend">Recommend</SelectItem>
                  <SelectItem value="neutral">Neutral</SelectItem>
                  <SelectItem value="not_recommend">Not Recommend</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={handleSubmitScore}
              disabled={!scoreValue || submitScore.isPending}
            >
              {submitScore.isPending ? 'Submitting...' : 'Submit Score'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Interview Dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Interview</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to cancel this interview? This action cannot be undone.
            </p>
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Textarea
                placeholder="Why is this interview being cancelled?"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Keep Interview</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleCancelInterview}
              disabled={cancelInterview.isPending}
            >
              {cancelInterview.isPending ? 'Cancelling...' : 'Cancel Interview'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reschedule Interview Dialog */}
      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule Interview</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>New Date</Label>
              <Input
                type="date"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>New Time</Label>
              <Input
                type="time"
                value={rescheduleTime}
                onChange={(e) => setRescheduleTime(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={handleRescheduleInterview}
              disabled={!rescheduleDate || !rescheduleTime || rescheduleInterview.isPending}
            >
              {rescheduleInterview.isPending ? 'Rescheduling...' : 'Reschedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
