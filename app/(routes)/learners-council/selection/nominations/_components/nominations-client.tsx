'use client';

/**
 * LC-005: Nominations Client Component
 * Handles self-nomination, listing, review, interviews, scoring, voting, results
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  UserPlus,
  CheckCircle2,
  XCircle,
  Star,
  CalendarPlus,
  Vote,
  Trophy,
  ClipboardList,
  ArrowLeft
} from 'lucide-react';
import Link from 'next/link';
import {
  useNominations,
  useSubmitNomination,
  useReviewNomination,
  useScheduleInterview,
  useSubmitInterviewScore,
  useCastVote,
  useElectionResults
} from '@/hooks/learners-council/use-lc-selection';
import type { LCNomination, LCElection, NominationStatus } from '@/types/learners-council';

function getStatusBadge(status: string) {
  const config: Record<string, { color: string; label: string }> = {
    submitted: { color: 'bg-blue-100 text-blue-800', label: 'Submitted' },
    eligible: { color: 'bg-cyan-100 text-cyan-800', label: 'Eligible' },
    ineligible: { color: 'bg-red-100 text-red-800', label: 'Ineligible' },
    shortlisted: { color: 'bg-amber-100 text-amber-800', label: 'Shortlisted' },
    selected: { color: 'bg-green-100 text-green-800', label: 'Selected' },
    rejected: { color: 'bg-red-100 text-red-800', label: 'Rejected' },
    withdrawn: { color: 'bg-gray-100 text-gray-800', label: 'Withdrawn' }
  };
  const c = config[status] || { color: 'bg-gray-100 text-gray-800', label: status };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.color}`}>{c.label}</span>;
}

interface NominationsClientProps {
  election: any;
  electionId: string;
  allElections: { id: string; title: string; status: string; type: string }[];
  userId: string;
  userName: string;
  isStaffOrAdmin: boolean;
}

export function NominationsClient({
  election,
  electionId,
  allElections,
  userId,
  userName,
  isStaffOrAdmin
}: NominationsClientProps) {
  const [selectedElection, setSelectedElection] = useState(electionId);
  const activeElectionId = selectedElection || electionId;

  const { data: nominations, isLoading } = useNominations(activeElectionId);
  const { data: results } = useElectionResults(
    election?.status === 'results_declared' ? activeElectionId : ''
  );

  const submitNomination = useSubmitNomination();
  const reviewNomination = useReviewNomination();
  const scheduleInterview = useScheduleInterview();
  const submitScore = useSubmitInterviewScore();
  const castVote = useCastVote();

  // Self-nomination form state
  const [nomOpen, setNomOpen] = useState(false);
  const [roleSought, setRoleSought] = useState('');
  const [statement, setStatement] = useState('');
  const [qualifications, setQualifications] = useState('');

  // Interview scheduling state
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [interviewNomId, setInterviewNomId] = useState('');
  const [interviewDate, setInterviewDate] = useState('');
  const [maxScore, setMaxScore] = useState('100');

  // Interview scoring state
  const [scoreOpen, setScoreOpen] = useState(false);
  const [scoreInterviewId, setScoreInterviewId] = useState('');
  const [scoreNomId, setScoreNomId] = useState('');
  const [scoreValue, setScoreValue] = useState('');
  const [scoreNotes, setScoreNotes] = useState('');
  const [scoreRecommendation, setScoreRecommendation] = useState('neutral');

  // Review state
  const [reviewNotes, setReviewNotes] = useState('');

  const handleSubmitNomination = () => {
    if (!activeElectionId || !roleSought) return;
    submitNomination.mutate(
      {
        data: {
          election_id: activeElectionId,
          role_sought: roleSought,
          statement: statement || undefined,
          qualifications: qualifications || undefined
        },
        userId
      },
      {
        onSuccess: () => {
          setNomOpen(false);
          setRoleSought('');
          setStatement('');
          setQualifications('');
        }
      }
    );
  };

  const handleReview = (nominationId: string, status: NominationStatus) => {
    reviewNomination.mutate({
      id: nominationId,
      status,
      reviewerId: userId,
      electionId: activeElectionId,
      notes: reviewNotes || undefined
    });
    setReviewNotes('');
  };

  const handleScheduleInterview = () => {
    if (!interviewNomId || !interviewDate) return;
    scheduleInterview.mutate(
      {
        nomination_id: interviewNomId,
        interviewer_id: userId,
        scheduled_at: new Date(interviewDate).toISOString(),
        max_score: parseInt(maxScore) || 100
      },
      {
        onSuccess: () => {
          setInterviewOpen(false);
          setInterviewNomId('');
          setInterviewDate('');
          setMaxScore('100');
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
        criteriaScores: [],
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
        }
      }
    );
  };

  const handleVote = (nominationId: string, positionId: string) => {
    castVote.mutate({
      electionId: activeElectionId,
      nominationId,
      positionId: positionId || activeElectionId,
      voterId: userId
    });
  };

  const isNominationsOpen = election?.status === 'nominations_open';
  const isVotingOpen = election?.status === 'voting_open';
  const isResultsDeclared = election?.status === 'results_declared';

  return (
    <div className="space-y-6">
      {/* Back link + header */}
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
            <ClipboardList className="h-6 w-6 text-primary" />
            {election?.title || 'Nominations'}
          </h1>
          {election && (
            <p className="text-muted-foreground mt-1">
              {election.term?.name} &middot;{' '}
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                isNominationsOpen ? 'bg-blue-100 text-blue-800' :
                isVotingOpen ? 'bg-green-100 text-green-800' :
                isResultsDeclared ? 'bg-purple-100 text-purple-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {election.status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
              </span>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {isNominationsOpen && (
            <Dialog open={nomOpen} onOpenChange={setNomOpen}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Self-Nominate
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Submit Your Nomination</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Role Sought</Label>
                    <Select value={roleSought} onValueChange={setRoleSought}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select role..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="chapter_chair">Chapter Chair</SelectItem>
                        <SelectItem value="chapter_co_chair">Chapter Co-Chair</SelectItem>
                        <SelectItem value="stakeholder_chair">Stakeholder Chair</SelectItem>
                        <SelectItem value="stakeholder_co_chair">Stakeholder Co-Chair</SelectItem>
                        <SelectItem value="vertical_chair">Vertical Chair</SelectItem>
                        <SelectItem value="vertical_co_chair">Vertical Co-Chair</SelectItem>
                        <SelectItem value="executive">Executive</SelectItem>
                        <SelectItem value="institution_president">Institution President</SelectItem>
                        <SelectItem value="portfolio_head">Portfolio Head</SelectItem>
                        <SelectItem value="at_large">At Large</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Candidate Statement</Label>
                    <Textarea
                      placeholder="Why are you interested in this role? What will you bring to the position?"
                      value={statement}
                      onChange={(e) => setStatement(e.target.value)}
                      rows={4}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Qualifications & Experience</Label>
                    <Textarea
                      placeholder="Relevant experience, skills, and achievements..."
                      value={qualifications}
                      onChange={(e) => setQualifications(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button
                    onClick={handleSubmitNomination}
                    disabled={!roleSought || submitNomination.isPending}
                  >
                    {submitNomination.isPending ? 'Submitting...' : 'Submit Nomination'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Election picker if no specific election selected */}
      {!electionId && allElections.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <Label>Select Election</Label>
            <Select value={selectedElection} onValueChange={setSelectedElection}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Choose an election..." />
              </SelectTrigger>
              <SelectContent>
                {allElections.map(e => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.title} ({e.status.replace(/_/g, ' ')})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {/* Results Section (when declared) */}
      {isResultsDeclared && results && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-600" />
              Election Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {results.results.map((r, idx) => (
                <div
                  key={r.nomination_id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    idx === 0 ? 'bg-amber-50 border-amber-200' : 'bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-muted-foreground w-6">
                      #{idx + 1}
                    </span>
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={r.nominee_avatar || ''} />
                      <AvatarFallback>
                        {r.nominee_name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-sm">{r.nominee_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.role_sought.replace(/_/g, ' ')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={idx === 0 ? 'default' : 'outline'}>
                      {r.vote_count} vote{r.vote_count !== 1 ? 's' : ''}
                    </Badge>
                    {r.status === 'selected' && (
                      <Badge className="bg-green-600">Selected</Badge>
                    )}
                  </div>
                </div>
              ))}
              {results.results.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No results available</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Nominations List */}
      {!activeElectionId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Select an election above to view nominations
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card>
          <CardContent className="py-12 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </CardContent>
        </Card>
      ) : !nominations || nominations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <UserPlus className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-medium">No Nominations Yet</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {isNominationsOpen
                ? 'Be the first to submit your nomination!'
                : 'No nominations were submitted for this election.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">
            Nominations ({nominations.length})
          </h2>
          {nominations.map((nom: LCNomination) => (
            <Card key={nom.id}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={(nom.nominee as any)?.avatar_url || ''} />
                      <AvatarFallback>
                        {((nom.nominee as any)?.full_name || 'U').charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{(nom.nominee as any)?.full_name || 'Unknown'}</p>
                      <p className="text-sm text-muted-foreground">
                        {(nom.nominee as any)?.email}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {nom.role_sought.replace(/_/g, ' ')}
                        </Badge>
                        {getStatusBadge(nom.status)}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(nom.submitted_at).toLocaleDateString()}
                  </p>
                </div>

                {/* Statement */}
                {nom.statement && (
                  <div className="mt-3 p-3 bg-muted/50 rounded-md">
                    <p className="text-sm font-medium mb-1">Statement</p>
                    <p className="text-sm text-muted-foreground">{nom.statement}</p>
                  </div>
                )}

                {/* Qualifications */}
                {nom.qualifications && (
                  <div className="mt-2 p-3 bg-muted/50 rounded-md">
                    <p className="text-sm font-medium mb-1">Qualifications</p>
                    <p className="text-sm text-muted-foreground">{nom.qualifications}</p>
                  </div>
                )}

                {/* Interviews */}
                {nom.interviews && nom.interviews.length > 0 && (
                  <div className="mt-3 border-t pt-3">
                    <p className="text-sm font-medium mb-2">Interviews</p>
                    <div className="space-y-2">
                      {nom.interviews.map((interview) => (
                        <div key={interview.id} className="flex items-center justify-between text-sm p-2 bg-muted/30 rounded">
                          <div className="flex items-center gap-2">
                            <Star className="h-3.5 w-3.5 text-amber-500" />
                            <span>{(interview.interviewer as any)?.full_name || 'Interviewer'}</span>
                            <span className="text-muted-foreground">
                              {new Date(interview.scheduled_at).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {interview.status}
                            </Badge>
                            {interview.score !== null && (
                              <Badge variant="secondary" className="text-xs">
                                {interview.score}/{interview.max_score}
                              </Badge>
                            )}
                            {interview.status === 'scheduled' && isStaffOrAdmin && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => {
                                  setScoreInterviewId(interview.id);
                                  setScoreNomId(nom.id);
                                  setScoreOpen(true);
                                }}
                              >
                                Score
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Review Notes */}
                {nom.review_notes && (
                  <div className="mt-2 text-sm">
                    <span className="font-medium">Review: </span>
                    <span className="text-muted-foreground">{nom.review_notes}</span>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="mt-3 pt-3 border-t flex gap-2 flex-wrap">
                  {/* Staff: Review nomination */}
                  {isStaffOrAdmin && nom.status === 'submitted' && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-green-700 border-green-200 hover:bg-green-50"
                        onClick={() => handleReview(nom.id, 'eligible')}
                        disabled={reviewNomination.isPending}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                        Mark Eligible
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-700 border-red-200 hover:bg-red-50"
                        onClick={() => handleReview(nom.id, 'ineligible')}
                        disabled={reviewNomination.isPending}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1" />
                        Mark Ineligible
                      </Button>
                    </>
                  )}
                  {isStaffOrAdmin && nom.status === 'eligible' && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReview(nom.id, 'shortlisted')}
                        disabled={reviewNomination.isPending}
                      >
                        Shortlist
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setInterviewNomId(nom.id);
                          setInterviewOpen(true);
                        }}
                      >
                        <CalendarPlus className="h-3.5 w-3.5 mr-1" />
                        Schedule Interview
                      </Button>
                    </>
                  )}
                  {isStaffOrAdmin && nom.status === 'shortlisted' && (
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => handleReview(nom.id, 'selected')}
                      disabled={reviewNomination.isPending}
                    >
                      <Trophy className="h-3.5 w-3.5 mr-1" />
                      Select
                    </Button>
                  )}

                  {/* Voting */}
                  {isVotingOpen && nom.status === 'shortlisted' && (
                    <Button
                      size="sm"
                      onClick={() => handleVote(nom.id, nom.position_id || '')}
                      disabled={castVote.isPending}
                    >
                      <Vote className="h-3.5 w-3.5 mr-1" />
                      {castVote.isPending ? 'Voting...' : 'Vote'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Interview Scheduling Dialog */}
      <Dialog open={interviewOpen} onOpenChange={setInterviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Interview</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Interview Date & Time</Label>
              <Input
                type="datetime-local"
                value={interviewDate}
                onChange={(e) => setInterviewDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Maximum Score</Label>
              <Input
                type="number"
                value={maxScore}
                onChange={(e) => setMaxScore(e.target.value)}
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
              disabled={!interviewDate || scheduleInterview.isPending}
            >
              {scheduleInterview.isPending ? 'Scheduling...' : 'Schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Interview Scoring Dialog */}
      <Dialog open={scoreOpen} onOpenChange={setScoreOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Interview Score</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Score</Label>
              <Input
                type="number"
                placeholder="e.g., 85"
                value={scoreValue}
                onChange={(e) => setScoreValue(e.target.value)}
                min="0"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Interview observations and feedback..."
                value={scoreNotes}
                onChange={(e) => setScoreNotes(e.target.value)}
                rows={3}
              />
            </div>
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
    </div>
  );
}
