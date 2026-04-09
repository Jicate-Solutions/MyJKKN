'use client';

/**
 * LC-005: Elections Client Component
 * Full election lifecycle: create, vote, view results, declare winners
 */

import { useState, useMemo } from 'react';
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
  Vote,
  Trophy,
  Calendar,
  Users,
  CheckCircle,
  Plus,
  ArrowLeft,
  Clock,
  BarChart3,
  Shield,
  ChevronRight,
  AlertCircle,
  Loader2
} from 'lucide-react';
import Link from 'next/link';
import {
  useElections,
  useElectionResults,
  useCreateElection,
  useUpdateElectionStatus,
  useCastVote,
  useDeclareResults,
  useNominations
} from '@/hooks/learners-council/use-lc-selection';
import type {
  LCElection,
  LCNomination,
  ElectionType,
  ElectionStatus
} from '@/types/learners-council';

// ============================================================================
// HELPERS
// ============================================================================

function getStatusConfig(status: string) {
  switch (status) {
    case 'nominations_open':
      return { label: 'Nominations Open', color: 'bg-blue-100 text-blue-800', icon: Users };
    case 'voting_open':
      return { label: 'Voting Open', color: 'bg-green-100 text-green-800', icon: Vote };
    case 'voting_closed':
      return { label: 'Voting Closed', color: 'bg-yellow-100 text-yellow-800', icon: Clock };
    case 'results_declared':
      return { label: 'Results Declared', color: 'bg-purple-100 text-purple-800', icon: Trophy };
    default:
      return { label: status, color: 'bg-gray-100 text-gray-800', icon: AlertCircle };
  }
}

function getTypeLabel(type: string) {
  switch (type) {
    case 'yuva_selection': return 'YUVA Selection';
    case 'lc_progression': return 'LC Progression';
    case 'executive_rotation': return 'Executive Rotation';
    default: return type;
  }
}

function getTypeDescription(type: string) {
  switch (type) {
    case 'yuva_selection': return 'Select new YUVA chapter leaders from eligible learners';
    case 'lc_progression': return 'Promote past YUVA chairs to Learners Council positions';
    case 'executive_rotation': return 'Rotate LC executive positions every 6 months';
    default: return '';
  }
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return 'Not set';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function formatDateTime(dateStr: string | null | undefined) {
  if (!dateStr) return 'Not set';
  return new Date(dateStr).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** Active Election Voting Card */
function VotingCard({
  election,
  userId,
  isStaffOrAdmin
}: {
  election: LCElection;
  userId: string;
  isStaffOrAdmin: boolean;
}) {
  const { data: nominations, isLoading: nominationsLoading } = useNominations(election.id);
  const castVote = useCastVote();
  const [votedFor, setVotedFor] = useState<Record<string, string>>({});

  // Filter to only approved/shortlisted nominations
  const eligibleNominations = useMemo(() => {
    if (!nominations) return [];
    return nominations.filter(
      (n) => ['submitted', 'eligible', 'shortlisted'].includes(n.status)
    );
  }, [nominations]);

  const handleVote = (nominationId: string, positionId: string) => {
    castVote.mutate(
      {
        electionId: election.id,
        nominationId,
        positionId: positionId || election.id,
        voterId: userId
      },
      {
        onSuccess: () => {
          setVotedFor((prev) => ({ ...prev, [positionId || 'default']: nominationId }));
        }
      }
    );
  };

  if (nominationsLoading) {
    return (
      <Card className="border-green-200 bg-green-50/30">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading candidates...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-green-200 bg-green-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Vote className="h-5 w-5 text-green-600" />
            Cast Your Vote
          </CardTitle>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Voting Open
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {election.title} &middot; {election.term?.name || 'Current Term'}
        </p>
        {election.voting_close_at && (
          <p className="text-xs text-muted-foreground">
            Voting closes: {formatDateTime(election.voting_close_at)}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {eligibleNominations.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No candidates available for voting.
          </p>
        ) : (
          <div className="space-y-3">
            {eligibleNominations.map((nom) => {
              const isVoted = Object.values(votedFor).includes(nom.id);
              return (
                <div
                  key={nom.id}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                    isVoted
                      ? 'bg-green-50 border-green-300'
                      : 'bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={nom.nominee?.avatar_url || ''} />
                      <AvatarFallback>
                        {(nom.nominee?.full_name || 'U').charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-sm">
                        {nom.nominee?.full_name || 'Unknown'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {nom.role_sought.toString().replace(/_/g, ' ')}
                      </p>
                      {nom.statement && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          &ldquo;{nom.statement}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={isVoted ? 'default' : 'outline'}
                    disabled={isVoted || castVote.isPending}
                    onClick={() => handleVote(nom.id, nom.position_id || '')}
                    className={isVoted ? 'bg-green-600 hover:bg-green-700' : ''}
                  >
                    {isVoted ? (
                      <>
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Voted
                      </>
                    ) : castVote.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Vote'
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Election Results Card */
function ResultsCard({
  electionId,
  electionTitle,
  isStaffOrAdmin
}: {
  electionId: string;
  electionTitle: string;
  isStaffOrAdmin: boolean;
}) {
  const { data: results, isLoading } = useElectionResults(electionId);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading results...</span>
        </CardContent>
      </Card>
    );
  }

  if (!results || results.results.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <BarChart3 className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No results available yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-600" />
          {electionTitle} - Results
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
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
                  <Badge className="bg-green-600">Winner</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** Declare Results Button for admin */
function DeclareResultsButton({ electionId }: { electionId: string }) {
  const declareResults = useDeclareResults();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <DialogTrigger asChild>
        <Button variant="default" size="sm">
          <Trophy className="h-4 w-4 mr-1" />
          Declare Results
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Declare Election Results</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          This will finalize the election, mark the top candidates as selected,
          and notify all winners. This action cannot be undone.
        </p>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            onClick={() => {
              declareResults.mutate(electionId, {
                onSuccess: () => setConfirmOpen(false)
              });
            }}
            disabled={declareResults.isPending}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {declareResults.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Declaring...
              </>
            ) : (
              'Confirm & Declare'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Create Election Dialog */
function CreateElectionDialog({
  userId,
  terms,
  open,
  onOpenChange
}: {
  userId: string;
  terms: { id: string; name: string; start_date: string; end_date: string; status: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ElectionType>('executive_rotation');
  const [termId, setTermId] = useState('');
  const [description, setDescription] = useState('');
  const [nomOpen, setNomOpen] = useState('');
  const [nomClose, setNomClose] = useState('');
  const [voteOpen, setVoteOpen] = useState('');
  const [voteClose, setVoteClose] = useState('');

  const createElection = useCreateElection();

  const resetForm = () => {
    setTitle('');
    setType('executive_rotation');
    setTermId('');
    setDescription('');
    setNomOpen('');
    setNomClose('');
    setVoteOpen('');
    setVoteClose('');
  };

  const handleCreate = () => {
    if (!title || !termId || !nomOpen || !nomClose) return;

    createElection.mutate(
      {
        data: {
          title,
          type,
          term_id: termId,
          nominations_open_at: new Date(nomOpen).toISOString(),
          nominations_close_at: new Date(nomClose).toISOString(),
          voting_open_at: voteOpen ? new Date(voteOpen).toISOString() : undefined,
          voting_close_at: voteClose ? new Date(voteClose).toISOString() : undefined
        },
        userId
      },
      {
        onSuccess: () => {
          resetForm();
          onOpenChange(false);
        }
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New Election</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="elec-title">Election Title</Label>
            <Input
              id="elec-title"
              placeholder="e.g., LC Executive Rotation - Apr 2026"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Election Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as ElectionType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="executive_rotation">Executive Rotation</SelectItem>
                  <SelectItem value="yuva_selection">YUVA Selection</SelectItem>
                  <SelectItem value="lc_progression">LC Progression</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{getTypeDescription(type)}</p>
            </div>

            <div className="space-y-2">
              <Label>Term</Label>
              <Select value={termId} onValueChange={setTermId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select term..." />
                </SelectTrigger>
                <SelectContent>
                  {terms.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.status})
                    </SelectItem>
                  ))}
                  {terms.length === 0 && (
                    <SelectItem value="" disabled>
                      No active terms available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description (Optional)</Label>
            <Textarea
              placeholder="Brief description of the election purpose and positions being filled..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nominations Open</Label>
              <Input
                type="datetime-local"
                value={nomOpen}
                onChange={(e) => setNomOpen(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Nominations Close</Label>
              <Input
                type="datetime-local"
                value={nomClose}
                onChange={(e) => setNomClose(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Voting Opens (Optional)</Label>
              <Input
                type="datetime-local"
                value={voteOpen}
                onChange={(e) => setVoteOpen(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Voting Closes (Optional)</Label>
              <Input
                type="datetime-local"
                value={voteClose}
                onChange={(e) => setVoteClose(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            onClick={handleCreate}
            disabled={!title || !termId || !nomOpen || !nomClose || createElection.isPending}
          >
            {createElection.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Election'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface ElectionsClientProps {
  elections: any[];
  terms: { id: string; name: string; start_date: string; end_date: string; status: string }[];
  userId: string;
  userRole: string;
  isStaffOrAdmin: boolean;
}

export function ElectionsClient({
  elections: initialElections,
  terms,
  userId,
  userRole,
  isStaffOrAdmin
}: ElectionsClientProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedResultsId, setSelectedResultsId] = useState<string | null>(null);

  const updateStatus = useUpdateElectionStatus();

  // Split elections into active (voting_open) and others
  const activeElections = useMemo(() => {
    return initialElections.filter((e) => e.status === 'voting_open');
  }, [initialElections]);

  const filteredElections = useMemo(() => {
    return initialElections.filter((e) => {
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      if (typeFilter !== 'all' && e.type !== typeFilter) return false;
      return true;
    });
  }, [initialElections, statusFilter, typeFilter]);

  const pastElections = useMemo(() => {
    return initialElections.filter((e) => e.status === 'results_declared');
  }, [initialElections]);

  // Status transition helper for admin actions
  const getNextStatus = (current: string): { label: string; status: ElectionStatus } | null => {
    switch (current) {
      case 'nominations_open':
        return { label: 'Open Voting', status: 'voting_open' };
      case 'voting_open':
        return { label: 'Close Voting', status: 'voting_closed' };
      default:
        return null;
    }
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
            Back to Selection
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Vote className="h-6 w-6 text-primary" />
            Elections
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage elections for LC Executive rotation and YUVA selections
          </p>
        </div>
        {isStaffOrAdmin && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Election
          </Button>
        )}
      </div>

      {/* Active Election Voting (prominent at top) */}
      {activeElections.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Vote className="h-5 w-5 text-green-600" />
            Active Elections - Vote Now
          </h2>
          {activeElections.map((election) => (
            <VotingCard
              key={election.id}
              election={election}
              userId={userId}
              isStaffOrAdmin={isStaffOrAdmin}
            />
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="nominations_open">Nominations Open</SelectItem>
            <SelectItem value="voting_open">Voting Open</SelectItem>
            <SelectItem value="voting_closed">Voting Closed</SelectItem>
            <SelectItem value="results_declared">Results Declared</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="executive_rotation">Executive Rotation</SelectItem>
            <SelectItem value="yuva_selection">YUVA Selection</SelectItem>
            <SelectItem value="lc_progression">LC Progression</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* All Elections Grid */}
      {filteredElections.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Vote className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">No Elections Found</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              {statusFilter !== 'all' || typeFilter !== 'all'
                ? 'No elections match your current filters. Try adjusting your filters.'
                : 'There are no elections yet. Elections will appear here once created by administrators.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredElections.map((election) => {
            const statusConfig = getStatusConfig(election.status);
            const StatusIcon = statusConfig.icon;
            const nominationCount = election.nominations?.length || 0;
            const selectedCount = election.nominations?.filter(
              (n: any) => n.status === 'selected'
            ).length || 0;
            const nextAction = isStaffOrAdmin ? getNextStatus(election.status) : null;

            return (
              <Card key={election.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base leading-tight pr-2">
                      {election.title}
                    </CardTitle>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${statusConfig.color}`}>
                      {statusConfig.label}
                    </span>
                  </div>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {getTypeLabel(election.type)}
                    </Badge>
                    {election.term && (
                      <Badge variant="secondary" className="text-xs">
                        {election.term.name}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Timeline */}
                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>
                        Nominations: {formatDate(election.nominations_open_at)} - {formatDate(election.nominations_close_at)}
                      </span>
                    </div>
                    {(election.voting_open_at || election.voting_close_at) && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>
                          Voting: {formatDate(election.voting_open_at)} - {formatDate(election.voting_close_at)}
                        </span>
                      </div>
                    )}
                    {election.results_declared_at && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Trophy className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>
                          Declared: {formatDate(election.results_declared_at)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 pt-2 border-t text-sm">
                    <div className="flex items-center gap-1.5">
                      <Users className="h-4 w-4 text-blue-600" />
                      <span className="font-medium">{nominationCount}</span>
                      <span className="text-muted-foreground">Nominations</span>
                    </div>
                    {selectedCount > 0 && (
                      <div className="flex items-center gap-1.5">
                        <Trophy className="h-4 w-4 text-amber-600" />
                        <span className="font-medium">{selectedCount}</span>
                        <span className="text-muted-foreground">Selected</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2">
                    {/* View nominations link */}
                    <Link
                      href={`/learners-council/selection/nominations?election=${election.id}`}
                      className="text-sm font-medium text-primary hover:underline flex items-center gap-0.5"
                    >
                      {election.status === 'nominations_open'
                        ? 'View Nominations'
                        : election.status === 'voting_open'
                          ? 'Cast Vote'
                          : 'View Details'}
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>

                    <div className="ml-auto flex gap-1.5">
                      {/* View results button for declared elections */}
                      {election.status === 'results_declared' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setSelectedResultsId(
                              selectedResultsId === election.id ? null : election.id
                            )
                          }
                        >
                          <BarChart3 className="h-3.5 w-3.5 mr-1" />
                          Results
                        </Button>
                      )}

                      {/* Admin: status transition button */}
                      {isStaffOrAdmin && nextAction && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            updateStatus.mutate({
                              id: election.id,
                              status: nextAction.status
                            })
                          }
                          disabled={updateStatus.isPending}
                        >
                          <Shield className="h-3.5 w-3.5 mr-1" />
                          {nextAction.label}
                        </Button>
                      )}

                      {/* Admin: declare results for closed voting */}
                      {isStaffOrAdmin && election.status === 'voting_closed' && (
                        <DeclareResultsButton electionId={election.id} />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Expanded Results Panel */}
      {selectedResultsId && (
        <ResultsCard
          electionId={selectedResultsId}
          electionTitle={
            initialElections.find((e) => e.id === selectedResultsId)?.title || 'Election'
          }
          isStaffOrAdmin={isStaffOrAdmin}
        />
      )}

      {/* Past Elections Summary */}
      {pastElections.length > 0 && statusFilter === 'all' && typeFilter === 'all' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-600" />
            Completed Elections
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {pastElections.slice(0, 4).map((election) => {
              const selectedNominees = election.nominations?.filter(
                (n: any) => n.status === 'selected'
              ) || [];

              return (
                <Card key={`past-${election.id}`} className="bg-gray-50/50">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-sm">{election.title}</h3>
                      <Badge variant="outline" className="text-xs">
                        {getTypeLabel(election.type)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                      <Calendar className="h-3 w-3" />
                      {election.term?.name || 'Unknown term'}
                      {election.results_declared_at && (
                        <span> &middot; Declared {formatDate(election.results_declared_at)}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-sm">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="font-medium">{selectedNominees.length}</span>
                        <span className="text-muted-foreground">winner{selectedNominees.length !== 1 ? 's' : ''}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setSelectedResultsId(
                            selectedResultsId === election.id ? null : election.id
                          )
                        }
                        className="text-xs"
                      >
                        <BarChart3 className="h-3.5 w-3.5 mr-1" />
                        View Results
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Create Election Dialog */}
      <CreateElectionDialog
        userId={userId}
        terms={terms}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </div>
  );
}
