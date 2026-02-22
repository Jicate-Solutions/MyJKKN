'use client';

import { useState, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useAuth } from '@/hooks/use-auth';
import {
  useGDPISessions,
  useGDPISession,
  useGDPIStats,
  useGDPILeadSearch,
  useGDPIEvaluatorSearch,
  useGDPIMutations,
} from '@/hooks/admission/use-gdpi';
import {
  GD_CRITERIA,
  PI_CRITERIA,
  type GDPISessionType,
  type GDPISessionStatus,
  type GDPISessionFilters,
  type GDPIRecommendation,
  type GDPIEvaluatorRole,
  type GDPICandidate,
} from '@/lib/services/admission/gdpi-service';
import { AdmissionErrorBoundary } from '@/components/admission';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Users,
  MessageSquare,
  ClipboardList,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  Calendar,
  Clock,
  MapPin,
  Search,
  ChevronUp,
  Eye,
  UserPlus,
  CheckCircle2,
  XCircle,
  AlertCircle,
  BarChart3,
  X,
} from 'lucide-react';

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_STYLES: Record<GDPISessionStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  scheduled: { label: 'Scheduled', variant: 'outline' },
  in_progress: { label: 'In Progress', variant: 'default' },
  completed: { label: 'Completed', variant: 'secondary' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
};

const TYPE_STYLES: Record<GDPISessionType, { label: string; color: string }> = {
  gd: { label: 'GD', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  pi: { label: 'PI', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
};

const RECOMMENDATION_STYLES: Record<GDPIRecommendation, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  strong_accept: { label: 'Strong Accept', color: 'text-green-700 bg-green-50 border-green-200', icon: CheckCircle2 },
  accept: { label: 'Accept', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
  waitlist: { label: 'Waitlist', color: 'text-amber-700 bg-amber-50 border-amber-200', icon: AlertCircle },
  reject: { label: 'Reject', color: 'text-red-700 bg-red-50 border-red-200', icon: XCircle },
};

// ============================================================================
// CREATE SESSION DIALOG
// ============================================================================

interface CreateSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutionId: string;
}

function CreateSessionDialog({ open, onOpenChange, institutionId }: CreateSessionDialogProps) {
  const [sessionType, setSessionType] = useState<GDPISessionType>('gd');
  const [title, setTitle] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('10:00');
  const [duration, setDuration] = useState('30');
  const [venue, setVenue] = useState('');
  const [topic, setTopic] = useState('');
  const [maxCandidates, setMaxCandidates] = useState('10');
  const [notes, setNotes] = useState('');

  const { createSession } = useGDPIMutations();

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (!scheduledDate) {
      toast.error('Date is required');
      return;
    }

    const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();

    try {
      await createSession.mutateAsync({
        institution_id: institutionId,
        type: sessionType,
        title: title.trim(),
        scheduled_at: scheduledAt,
        duration_minutes: parseInt(duration) || 30,
        venue: venue.trim() || undefined,
        topic: sessionType === 'gd' ? topic.trim() || undefined : undefined,
        max_candidates: parseInt(maxCandidates) || 10,
        notes: notes.trim() || undefined,
      });

      // Reset form
      setTitle('');
      setScheduledDate('');
      setScheduledTime('10:00');
      setDuration('30');
      setVenue('');
      setTopic('');
      setMaxCandidates('10');
      setNotes('');
      onOpenChange(false);
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Schedule {sessionType === 'gd' ? 'Group Discussion' : 'Personal Interview'}
          </DialogTitle>
          <DialogDescription>
            Create a new GD-PI session and add learners and evaluators afterwards.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Type toggle */}
          <div className="space-y-2">
            <Label>Session Type</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={sessionType === 'gd' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSessionType('gd')}
              >
                <MessageSquare className="h-4 w-4 mr-1" />
                Group Discussion
              </Button>
              <Button
                type="button"
                variant={sessionType === 'pi' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSessionType('pi')}
              >
                <Users className="h-4 w-4 mr-1" />
                Personal Interview
              </Button>
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="session-title">Title</Label>
            <Input
              id="session-title"
              placeholder={
                sessionType === 'gd'
                  ? 'e.g., B.Pharm Batch 2026 - GD Round 1'
                  : 'e.g., MBA Interview Panel A'
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Date/Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="session-date">Date</Label>
              <Input
                id="session-date"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="session-time">Time</Label>
              <Input
                id="session-time"
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
              />
            </div>
          </div>

          {/* Duration + Max Candidates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="session-duration">Duration (minutes)</Label>
              <Input
                id="session-duration"
                type="number"
                min="10"
                max="180"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="session-max">Max Learners</Label>
              <Input
                id="session-max"
                type="number"
                min="1"
                max="50"
                value={maxCandidates}
                onChange={(e) => setMaxCandidates(e.target.value)}
              />
            </div>
          </div>

          {/* Venue */}
          <div className="space-y-2">
            <Label htmlFor="session-venue">Venue</Label>
            <Input
              id="session-venue"
              placeholder="e.g., Seminar Hall A, Block 3"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
            />
          </div>

          {/* Topic (GD only) */}
          {sessionType === 'gd' && (
            <div className="space-y-2">
              <Label htmlFor="session-topic">Discussion Topic</Label>
              <Input
                id="session-topic"
                placeholder="e.g., AI in Healthcare: Opportunities and Challenges"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="session-notes">Notes (optional)</Label>
            <Textarea
              id="session-notes"
              placeholder="Additional instructions for evaluators..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createSession.isPending}>
            {createSession.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Plus className="h-4 w-4 mr-1" />
            )}
            Schedule Session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// SCORING DIALOG
// ============================================================================

interface ScoringDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidate: GDPICandidate | null;
  sessionType: GDPISessionType;
  evaluatorId: string;
}

function ScoringDialog({
  open,
  onOpenChange,
  candidate,
  sessionType,
  evaluatorId,
}: ScoringDialogProps) {
  const criteria = sessionType === 'gd' ? GD_CRITERIA : PI_CRITERIA;
  const [scores, setScores] = useState<Record<string, number>>(
    Object.fromEntries(criteria.map((c) => [c.key, 5]))
  );
  const [recommendation, setRecommendation] = useState<GDPIRecommendation | ''>('');
  const [evalNotes, setEvalNotes] = useState('');

  const { scoreCandidate, updateRecommendation } = useGDPIMutations();

  // Pre-fill with existing scores if any
  useState(() => {
    if (candidate?.scores) {
      const existingScores: Record<string, number> = {};
      for (const s of candidate.scores) {
        if (s.evaluator_id === evaluatorId) {
          existingScores[s.criterion] = s.score;
        }
      }
      if (Object.keys(existingScores).length > 0) {
        setScores((prev) => ({ ...prev, ...existingScores }));
      }
    }
    if (candidate?.recommendation) {
      setRecommendation(candidate.recommendation);
    }
    if (candidate?.evaluator_notes) {
      setEvalNotes(candidate.evaluator_notes);
    }
  });

  const avgScore = useMemo(() => {
    const vals = Object.values(scores);
    return vals.length > 0
      ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
      : 0;
  }, [scores]);

  const handleSubmit = async () => {
    if (!candidate) return;

    try {
      // Submit scores
      await scoreCandidate.mutateAsync({
        candidateId: candidate.id,
        evaluatorId,
        scores: criteria.map((c) => ({
          criterion: c.key,
          score: scores[c.key] || 5,
        })),
      });

      // Update recommendation if set
      if (recommendation) {
        await updateRecommendation.mutateAsync({
          candidateId: candidate.id,
          recommendation: recommendation as GDPIRecommendation,
          notes: evalNotes.trim() || undefined,
        });
      }

      onOpenChange(false);
    } catch {
      // Error handled by mutations
    }
  };

  const isSaving = scoreCandidate.isPending || updateRecommendation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Evaluate: {candidate?.admission_leads?.full_name || 'Learner'}
          </DialogTitle>
          <DialogDescription>
            Score each criterion from 1 (Poor) to 10 (Excellent).
            {sessionType === 'gd' ? ' Group Discussion evaluation.' : ' Personal Interview evaluation.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Score sliders */}
          {criteria.map((criterion) => (
            <div key={criterion.key} className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-sm">{criterion.label}</span>
                  <p className="text-xs text-muted-foreground">{criterion.description}</p>
                </div>
                <Badge
                  variant="outline"
                  className={`min-w-[3rem] justify-center text-base font-semibold ${
                    scores[criterion.key] >= 8
                      ? 'border-green-300 text-green-700'
                      : scores[criterion.key] >= 5
                      ? 'border-blue-300 text-blue-700'
                      : 'border-red-300 text-red-700'
                  }`}
                >
                  {scores[criterion.key]}
                </Badge>
              </div>
              <Slider
                min={1}
                max={10}
                step={1}
                value={[scores[criterion.key]]}
                onValueChange={([val]) =>
                  setScores((prev) => ({ ...prev, [criterion.key]: val }))
                }
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground px-1">
                <span>Poor</span>
                <span>Average</span>
                <span>Excellent</span>
              </div>
            </div>
          ))}

          {/* Average Score */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="font-medium">Overall Average</span>
            <span className="text-2xl font-bold">{avgScore}/10</span>
          </div>

          {/* Recommendation */}
          <div className="space-y-2">
            <Label>Recommendation</Label>
            <Select
              value={recommendation}
              onValueChange={(val) => setRecommendation(val as GDPIRecommendation)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select recommendation..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="strong_accept">Strong Accept</SelectItem>
                <SelectItem value="accept">Accept</SelectItem>
                <SelectItem value="waitlist">Waitlist</SelectItem>
                <SelectItem value="reject">Reject</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="eval-notes">Evaluator Notes</Label>
            <Textarea
              id="eval-notes"
              placeholder="Key observations, strengths, areas for improvement..."
              value={evalNotes}
              onChange={(e) => setEvalNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mr-1" />
            )}
            Submit Evaluation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// ADD CANDIDATES DIALOG
// ============================================================================

interface AddCandidatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  institutionId: string;
}

function AddCandidatesDialog({ open, onOpenChange, sessionId, institutionId }: AddCandidatesDialogProps) {
  const [search, setSearch] = useState('');
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);

  const { leads, isLoading: searchLoading } = useGDPILeadSearch(
    institutionId,
    sessionId,
    search
  );
  const { addCandidates } = useGDPIMutations();

  const handleToggle = (leadId: string) => {
    setSelectedLeadIds((prev) =>
      prev.includes(leadId) ? prev.filter((id) => id !== leadId) : [...prev, leadId]
    );
  };

  const handleAdd = async () => {
    if (selectedLeadIds.length === 0) {
      toast.error('Select at least one learner');
      return;
    }

    try {
      await addCandidates.mutateAsync({ sessionId, leadIds: selectedLeadIds });
      setSelectedLeadIds([]);
      setSearch('');
      onOpenChange(false);
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Add Learners
          </DialogTitle>
          <DialogDescription>
            Search for admission leads to add to this session.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Results */}
          <div className="border rounded-lg max-h-[300px] overflow-y-auto">
            {searchLoading && search.length >= 1 && (
              <div className="p-4 text-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                Searching...
              </div>
            )}

            {!searchLoading && leads.length === 0 && search.length >= 1 && (
              <div className="p-4 text-center text-muted-foreground text-sm">
                No learners found matching &quot;{search}&quot;
              </div>
            )}

            {search.length < 1 && (
              <div className="p-4 text-center text-muted-foreground text-sm">
                Start typing to search learners...
              </div>
            )}

            {leads.map((lead: any) => (
              <div
                key={lead.id}
                className={`flex items-center gap-3 p-3 border-b last:border-b-0 cursor-pointer hover:bg-muted/50 transition-colors ${
                  selectedLeadIds.includes(lead.id) ? 'bg-primary/5' : ''
                }`}
                onClick={() => handleToggle(lead.id)}
              >
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                    selectedLeadIds.includes(lead.id)
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-muted-foreground/30'
                  }`}
                >
                  {selectedLeadIds.includes(lead.id) && (
                    <CheckCircle2 className="h-3 w-3" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{lead.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {lead.phone}
                    {lead.program_interest ? ` - ${lead.program_interest}` : ''}
                  </p>
                </div>
                {lead.funnel_stage && (
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {lead.funnel_stage}
                  </Badge>
                )}
              </div>
            ))}
          </div>

          {/* Selected count */}
          {selectedLeadIds.length > 0 && (
            <div className="text-sm text-muted-foreground">
              {selectedLeadIds.length} learner(s) selected
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={addCandidates.isPending || selectedLeadIds.length === 0}>
            {addCandidates.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <UserPlus className="h-4 w-4 mr-1" />
            )}
            Add {selectedLeadIds.length > 0 ? `${selectedLeadIds.length} ` : ''}Learner(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// ADD EVALUATOR DIALOG
// ============================================================================

interface AddEvaluatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  institutionId: string;
}

function AddEvaluatorDialog({ open, onOpenChange, sessionId, institutionId }: AddEvaluatorDialogProps) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [role, setRole] = useState<GDPIEvaluatorRole>('evaluator');

  const { evaluators, isLoading: searchLoading } = useGDPIEvaluatorSearch(
    institutionId,
    search
  );
  const { addEvaluator } = useGDPIMutations();

  const handleAdd = async () => {
    if (!selectedId) {
      toast.error('Select an evaluator');
      return;
    }

    try {
      await addEvaluator.mutateAsync({ sessionId, evaluatorId: selectedId, role });
      setSelectedId('');
      setSearch('');
      onOpenChange(false);
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Evaluator</DialogTitle>
          <DialogDescription>
            Search for a team member to assign as evaluator.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="border rounded-lg max-h-[200px] overflow-y-auto">
            {searchLoading && search.length >= 1 && (
              <div className="p-3 text-center text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin mx-auto" />
              </div>
            )}

            {search.length < 1 && (
              <div className="p-3 text-center text-muted-foreground text-sm">
                Start typing to search...
              </div>
            )}

            {evaluators.map((ev: any) => (
              <div
                key={ev.id}
                className={`flex items-center gap-3 p-3 border-b last:border-b-0 cursor-pointer hover:bg-muted/50 ${
                  selectedId === ev.id ? 'bg-primary/5' : ''
                }`}
                onClick={() => setSelectedId(ev.id)}
              >
                <div
                  className={`w-4 h-4 rounded-full border-2 shrink-0 ${
                    selectedId === ev.id ? 'bg-primary border-primary' : 'border-muted-foreground/30'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{ev.full_name || 'Unnamed'}</p>
                  <p className="text-xs text-muted-foreground truncate">{ev.email}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as GDPIEvaluatorRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lead">Lead Evaluator</SelectItem>
                <SelectItem value="evaluator">Evaluator</SelectItem>
                <SelectItem value="observer">Observer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleAdd} disabled={addEvaluator.isPending || !selectedId}>
            {addEvaluator.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <UserPlus className="h-4 w-4 mr-1" />
            )}
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// SESSION DETAIL PANEL (expanded row)
// ============================================================================

interface SessionDetailPanelProps {
  sessionId: string;
  institutionId: string;
  onClose: () => void;
}

function SessionDetailPanel({ sessionId, institutionId, onClose }: SessionDetailPanelProps) {
  const { session, isLoading } = useGDPISession(sessionId);
  const { profile } = useAuth();
  const {
    removeCandidate,
    removeEvaluator,
    updateCandidateStatus,
    updateSession,
  } = useGDPIMutations();

  const [addCandidatesOpen, setAddCandidatesOpen] = useState(false);
  const [addEvaluatorOpen, setAddEvaluatorOpen] = useState(false);
  const [scoringCandidate, setScoringCandidate] = useState<GDPICandidate | null>(null);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!session) return null;

  const candidates = session.candidates || [];
  const evaluators = session.evaluators || [];

  const handleStatusChange = async (newStatus: GDPISessionStatus) => {
    try {
      await updateSession.mutateAsync({
        sessionId: session.id,
        updates: { status: newStatus },
      });
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <div className="border rounded-lg bg-card p-5 space-y-5">
      {/* Header with session info */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${TYPE_STYLES[session.type].color}`}>
              {TYPE_STYLES[session.type].label}
            </span>
            <Badge variant={STATUS_STYLES[session.status].variant}>
              {STATUS_STYLES[session.status].label}
            </Badge>
          </div>
          <h3 className="text-lg font-semibold">{session.title}</h3>
          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {format(new Date(session.scheduled_at), 'MMM d, yyyy')}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {format(new Date(session.scheduled_at), 'h:mm a')} ({session.duration_minutes}min)
            </span>
            {session.venue && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {session.venue}
              </span>
            )}
          </div>
          {session.topic && (
            <p className="text-sm mt-2 text-muted-foreground">
              <span className="font-medium">Topic:</span> {session.topic}
            </p>
          )}
          {session.notes && (
            <p className="text-sm mt-1 text-muted-foreground italic">{session.notes}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Status controls */}
          {session.status === 'scheduled' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleStatusChange('in_progress')}
              disabled={updateSession.isPending}
            >
              Start Session
            </Button>
          )}
          {session.status === 'in_progress' && (
            <Button
              size="sm"
              onClick={() => handleStatusChange('completed')}
              disabled={updateSession.isPending}
            >
              Complete Session
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Evaluators Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-medium text-sm">Evaluators ({evaluators.length})</h4>
          <Button size="sm" variant="outline" onClick={() => setAddEvaluatorOpen(true)}>
            <UserPlus className="h-3.5 w-3.5 mr-1" />
            Add Evaluator
          </Button>
        </div>
        {evaluators.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No evaluators assigned yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {evaluators.map((ev) => (
              <div
                key={ev.id}
                className="flex items-center gap-2 bg-muted rounded-full px-3 py-1 text-sm"
              >
                <span>{ev.profiles?.full_name || 'Unknown'}</span>
                <Badge variant="outline" className="text-[10px]">{ev.role}</Badge>
                <button
                  onClick={() => removeEvaluator.mutate(ev.id)}
                  className="text-muted-foreground hover:text-destructive ml-1"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Candidates Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-medium text-sm">
            Learners ({candidates.length}/{session.max_candidates})
          </h4>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAddCandidatesOpen(true)}
            disabled={candidates.length >= session.max_candidates}
          >
            <UserPlus className="h-3.5 w-3.5 mr-1" />
            Add Learners
          </Button>
        </div>

        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No learners added yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Learner</TableHead>
                <TableHead>Program</TableHead>
                <TableHead>Attendance</TableHead>
                <TableHead className="text-center">Score</TableHead>
                <TableHead>Recommendation</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.map((c) => {
                const recStyle = c.recommendation
                  ? RECOMMENDATION_STYLES[c.recommendation]
                  : null;
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">
                          {c.admission_leads?.full_name || 'Unknown'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {c.admission_leads?.phone}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.admission_leads?.program_interest || '-'}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={c.status}
                        onValueChange={(val) =>
                          updateCandidateStatus.mutate({
                            candidateId: c.id,
                            status: val as any,
                          })
                        }
                      >
                        <SelectTrigger className="w-[120px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="scheduled">Scheduled</SelectItem>
                          <SelectItem value="present">Present</SelectItem>
                          <SelectItem value="absent">Absent</SelectItem>
                          <SelectItem value="evaluated">Evaluated</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-center">
                      {c.overall_score !== null ? (
                        <Badge
                          variant="outline"
                          className={`font-semibold ${
                            c.overall_score >= 7
                              ? 'border-green-300 text-green-700'
                              : c.overall_score >= 5
                              ? 'border-blue-300 text-blue-700'
                              : 'border-red-300 text-red-700'
                          }`}
                        >
                          {c.overall_score}/10
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {recStyle ? (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${recStyle.color}`}
                        >
                          <recStyle.icon className="h-3 w-3" />
                          {recStyle.label}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setScoringCandidate(c)}
                          disabled={c.status === 'absent'}
                        >
                          <ClipboardList className="h-3.5 w-3.5 mr-1" />
                          Evaluate
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => setDeleteCandidateId(c.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Dialogs */}
      {addCandidatesOpen && (
        <AddCandidatesDialog
          open={addCandidatesOpen}
          onOpenChange={setAddCandidatesOpen}
          sessionId={sessionId}
          institutionId={institutionId}
        />
      )}

      {addEvaluatorOpen && (
        <AddEvaluatorDialog
          open={addEvaluatorOpen}
          onOpenChange={setAddEvaluatorOpen}
          sessionId={sessionId}
          institutionId={institutionId}
        />
      )}

      {scoringCandidate && (
        <ScoringDialog
          open={!!scoringCandidate}
          onOpenChange={(open) => {
            if (!open) setScoringCandidate(null);
          }}
          candidate={scoringCandidate}
          sessionType={session.type}
          evaluatorId={profile?.id || ''}
        />
      )}

      <AlertDialog
        open={!!deleteCandidateId}
        onOpenChange={() => setDeleteCandidateId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Learner</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the learner and their scores from this session. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteCandidateId) {
                  removeCandidate.mutate(deleteCandidateId);
                  setDeleteCandidateId(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================================
// MAIN PAGE CONTENT
// ============================================================================

function GDPIPageContent() {
  const { selectedInstitutionId, loading: accessLoading } = useUserInstitutionAccess();

  // Filters
  const [typeFilter, setTypeFilter] = useState<GDPISessionType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<GDPISessionStatus | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filters: GDPISessionFilters = useMemo(
    () => ({
      type: typeFilter !== 'all' ? typeFilter : undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      search: searchTerm || undefined,
    }),
    [typeFilter, statusFilter, searchTerm]
  );

  const { sessions, isLoading: sessionsLoading, refetch } = useGDPISessions(
    selectedInstitutionId,
    filters
  );
  const { stats } = useGDPIStats(selectedInstitutionId);

  const [createOpen, setCreateOpen] = useState(false);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);

  const { deleteSession } = useGDPIMutations();

  const isLoading = accessLoading || sessionsLoading;

  const handleDeleteSession = async () => {
    if (!deleteSessionId) return;
    try {
      await deleteSession.mutateAsync(deleteSessionId);
      if (expandedSessionId === deleteSessionId) {
        setExpandedSessionId(null);
      }
      setDeleteSessionId(null);
    } catch {
      // Error handled by mutation
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="sessions" className="w-full">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <TabsList>
            <TabsTrigger value="sessions">Sessions</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Schedule Session
            </Button>
          </div>
        </div>

        {/* ===================== SESSIONS TAB ===================== */}
        <TabsContent value="sessions" className="space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Sessions</CardDescription>
                <CardTitle className="text-3xl">{stats.totalSessions}</CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]">GD: {stats.gdSessions}</Badge>
                  <Badge variant="outline" className="text-[10px]">PI: {stats.piSessions}</Badge>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Learners Evaluated</CardDescription>
                <CardTitle className="text-3xl">{stats.evaluatedCandidates}</CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <p className="text-xs text-muted-foreground">
                  of {stats.totalCandidates} total
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Avg Score</CardDescription>
                <CardTitle className="text-3xl">
                  {stats.avgScore > 0 ? `${stats.avgScore}/10` : '-'}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <p className="text-xs text-muted-foreground">
                  Across all evaluations
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Accept Rate</CardDescription>
                <CardTitle className="text-3xl">
                  {stats.acceptRate > 0 ? `${stats.acceptRate}%` : '-'}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <p className="text-xs text-muted-foreground">
                  Strong accept + Accept
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search sessions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={typeFilter}
              onValueChange={(v) => setTypeFilter(v as any)}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="gd">Group Discussion</SelectItem>
                <SelectItem value="pi">Personal Interview</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as any)}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Sessions Table */}
          <Card>
            <CardContent className="p-0">
              {sessions.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-lg font-medium">No sessions found</p>
                  <p className="text-sm mt-1">
                    Schedule your first GD-PI session to get started.
                  </p>
                  <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Schedule Session
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">Type</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Venue</TableHead>
                      <TableHead className="text-center">Learners</TableHead>
                      <TableHead className="text-center">Evaluators</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((session) => (
                      <>
                        <TableRow
                          key={session.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() =>
                            setExpandedSessionId(
                              expandedSessionId === session.id ? null : session.id
                            )
                          }
                        >
                          <TableCell>
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                TYPE_STYLES[session.type].color
                              }`}
                            >
                              {TYPE_STYLES[session.type].label}
                            </span>
                          </TableCell>
                          <TableCell className="font-medium">
                            {session.title}
                            {session.topic && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">
                                {session.topic}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            <div>
                              {format(new Date(session.scheduled_at), 'MMM d, yyyy')}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(session.scheduled_at), 'h:mm a')} ({session.duration_minutes}min)
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {session.venue || '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="text-sm">
                              {session.candidate_count || 0}
                              <span className="text-muted-foreground">/{session.max_candidates}</span>
                            </div>
                            {(session.evaluated_count || 0) > 0 && (
                              <div className="text-[10px] text-green-600">
                                {session.evaluated_count} evaluated
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {session.evaluator_count || 0}
                          </TableCell>
                          <TableCell>
                            <Badge variant={STATUS_STYLES[session.status].variant}>
                              {STATUS_STYLES[session.status].label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedSessionId(
                                    expandedSessionId === session.id ? null : session.id
                                  );
                                }}
                              >
                                {expandedSessionId === session.id ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteSessionId(session.id);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {expandedSessionId === session.id && (
                          <TableRow key={`${session.id}-detail`}>
                            <TableCell colSpan={8} className="p-0">
                              <div className="p-4">
                                <SessionDetailPanel
                                  sessionId={session.id}
                                  institutionId={selectedInstitutionId!}
                                  onClose={() => setExpandedSessionId(null)}
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== ANALYTICS TAB ===================== */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Sessions</CardDescription>
                <CardTitle className="text-3xl">{stats.totalSessions}</CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <p className="text-xs text-muted-foreground">
                  {stats.completedSessions} completed
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Learners Evaluated</CardDescription>
                <CardTitle className="text-3xl">{stats.evaluatedCandidates}</CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <p className="text-xs text-muted-foreground">
                  of {stats.totalCandidates} total scheduled
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Average Score</CardDescription>
                <CardTitle className="text-3xl">
                  {stats.avgScore > 0 ? stats.avgScore : '-'}
                  {stats.avgScore > 0 && (
                    <span className="text-lg text-muted-foreground">/10</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <p className="text-xs text-muted-foreground">
                  Across all criteria
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Accept Rate</CardDescription>
                <CardTitle className="text-3xl">
                  {stats.acceptRate > 0 ? `${stats.acceptRate}%` : '-'}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <p className="text-xs text-muted-foreground">
                  Strong accept + Accept
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Session type breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Group Discussion Sessions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold">{stats.gdSessions}</div>
                <p className="text-sm text-muted-foreground mt-1">
                  {stats.totalSessions > 0
                    ? `${Math.round((stats.gdSessions / stats.totalSessions) * 100)}% of all sessions`
                    : 'No sessions yet'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Personal Interview Sessions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold">{stats.piSessions}</div>
                <p className="text-sm text-muted-foreground mt-1">
                  {stats.totalSessions > 0
                    ? `${Math.round((stats.piSessions / stats.totalSessions) * 100)}% of all sessions`
                    : 'No sessions yet'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Completion progress */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Evaluation Progress
              </CardTitle>
              <CardDescription>
                How many scheduled learners have been evaluated
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stats.totalCandidates > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>Evaluated</span>
                    <span className="font-medium">
                      {stats.evaluatedCandidates} / {stats.totalCandidates}
                      {' '}
                      ({Math.round((stats.evaluatedCandidates / stats.totalCandidates) * 100)}%)
                    </span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{
                        width: `${Math.round(
                          (stats.evaluatedCandidates / stats.totalCandidates) * 100
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                      {stats.evaluatedCandidates} evaluated
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-amber-500" />
                      {stats.totalCandidates - stats.evaluatedCandidates} pending
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No evaluation data yet.</p>
                  <p className="text-xs">Schedule sessions and add learners to see analytics.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent completed sessions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Completed Sessions</CardTitle>
              <CardDescription>Sessions with completed evaluations</CardDescription>
            </CardHeader>
            <CardContent>
              {sessions.filter((s) => s.status === 'completed').length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No completed sessions yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {sessions
                    .filter((s) => s.status === 'completed')
                    .slice(0, 5)
                    .map((session) => (
                      <div
                        key={session.id}
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              TYPE_STYLES[session.type].color
                            }`}
                          >
                            {TYPE_STYLES[session.type].label}
                          </span>
                          <div>
                            <p className="font-medium text-sm">{session.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(session.scheduled_at), 'MMM d, yyyy')}
                              {' - '}
                              {session.candidate_count} learner(s)
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">
                            {session.evaluated_count}/{session.candidate_count} evaluated
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Session Dialog */}
      {createOpen && selectedInstitutionId && (
        <CreateSessionDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          institutionId={selectedInstitutionId}
        />
      )}

      {/* Delete Session Confirmation */}
      <AlertDialog
        open={!!deleteSessionId}
        onOpenChange={() => setDeleteSessionId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Session</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this session, including all learner
              assignments, evaluator assignments, and scores. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSession}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================================
// PAGE EXPORT
// ============================================================================

export default function GDPIPage() {
  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="GD-PI Management">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission">Admission</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>GD-PI</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <AdmissionErrorBoundary>
          <GDPIPageContent />
        </AdmissionErrorBoundary>
      </ContentLayout>
    </PermissionGuard>
  );
}
