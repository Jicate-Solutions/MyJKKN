'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertCircle,
  ArrowLeft,
  Mail,
  Phone,
  Linkedin,
  Building2,
  Briefcase,
  Clock,
  Users,
  Star,
  CalendarDays,
  Target,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Rocket,
  TrendingUp,
} from 'lucide-react';
import {
  useMentor,
  useMentorMatches,
  useLogSession,
  useOnboardMentor,
} from '@/hooks/startup-studio';

// ─── Badge configs ────────────────────────────────────────────────────────────

const MENTOR_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  resident:        { label: 'Resident',        color: 'bg-purple-100 text-purple-800' },
  visiting:        { label: 'Visiting',         color: 'bg-blue-100 text-blue-800' },
  industry_expert: { label: 'Industry Expert',  color: 'bg-amber-100 text-amber-800' },
  academic:        { label: 'Academic',          color: 'bg-emerald-100 text-emerald-800' },
  investor:        { label: 'Investor',          color: 'bg-cyan-100 text-cyan-800' },
  alumni:          { label: 'Alumni',            color: 'bg-indigo-100 text-indigo-800' },
  functional:      { label: 'Functional',        color: 'bg-gray-100 text-gray-800' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  prospect:   { label: 'Prospect',   color: 'bg-gray-100 text-gray-700' },
  screening:  { label: 'Screening',  color: 'bg-yellow-100 text-yellow-800' },
  onboarded:  { label: 'Onboarded',  color: 'bg-green-100 text-green-800' },
  inactive:   { label: 'Inactive',   color: 'bg-orange-100 text-orange-800' },
  retired:    { label: 'Retired',    color: 'bg-red-100 text-red-800' },
};

const MATCH_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active:    { label: 'Active',    color: 'bg-green-100 text-green-800' },
  paused:    { label: 'Paused',    color: 'bg-yellow-100 text-yellow-800' },
  completed: { label: 'Completed', color: 'bg-blue-100 text-blue-800' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800' },
};

const FOCUS_AREAS = [
  'product_development', 'market_strategy', 'fundraising', 'team_building',
  'technical_guidance', 'business_model', 'operations', 'customer_discovery',
  'growth_hacking', 'regulatory_compliance', 'other',
];

const SESSION_MODES = ['in_person', 'virtual', 'hybrid', 'phone'];

// ─── Log Session Dialog ───────────────────────────────────────────────────────

interface LogSessionDialogProps {
  matchId: string;
  mentorId: string;
}

function LogSessionDialog({ matchId, mentorId }: LogSessionDialogProps) {
  const [open, setOpen] = useState(false);
  const [topicInput, setTopicInput]       = useState('');
  const [topics, setTopics]               = useState<string[]>([]);
  const [actionInput, setActionInput]     = useState('');
  const [actionItems, setActionItems]     = useState<string[]>([]);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    duration_minutes: '',
    mode: '',
    focus_area: '',
    key_takeaways: '',
    blockers: '',
    mentor_rating: '',
    startup_rating: '',
  });

  const logSession = useLogSession();

  const addTopic = () => {
    const val = topicInput.trim();
    if (val && !topics.includes(val)) setTopics((p) => [...p, val]);
    setTopicInput('');
  };

  const addAction = () => {
    const val = actionInput.trim();
    if (val && !actionItems.includes(val)) setActionItems((p) => [...p, val]);
    setActionInput('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await logSession.mutateAsync({
      matchId,
      data: {
        ...form,
        duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : 30,
        mentor_rating_of_session: form.mentor_rating ? Number(form.mentor_rating) : undefined,
        mentee_rating_of_session: form.startup_rating ? Number(form.startup_rating) : undefined,
        topics_discussed: topics,
        action_items: actionItems,
      },
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
          Log Session
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log Mentoring Session</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sess-date">Date *</Label>
              <Input
                id="sess-date"
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sess-duration">Duration (minutes)</Label>
              <Input
                id="sess-duration"
                type="number"
                min="15"
                step="15"
                value={form.duration_minutes}
                onChange={(e) => setForm((p) => ({ ...p, duration_minutes: e.target.value }))}
                placeholder="60"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sess-mode">Mode</Label>
              <Select
                value={form.mode}
                onValueChange={(v) => setForm((p) => ({ ...p, mode: v }))}
              >
                <SelectTrigger id="sess-mode">
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  {SESSION_MODES.map((m) => (
                    <SelectItem key={m} value={m} className="capitalize">
                      {m.replace('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sess-focus">Focus Area</Label>
              <Select
                value={form.focus_area}
                onValueChange={(v) => setForm((p) => ({ ...p, focus_area: v }))}
              >
                <SelectTrigger id="sess-focus">
                  <SelectValue placeholder="Select focus" />
                </SelectTrigger>
                <SelectContent>
                  {FOCUS_AREAS.map((f) => (
                    <SelectItem key={f} value={f} className="capitalize">
                      {f.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Topics */}
          <div className="space-y-1.5">
            <Label>Topics Discussed</Label>
            <div className="flex gap-2">
              <Input
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTopic(); } }}
                placeholder="Add a topic and press Enter"
              />
              <Button type="button" variant="outline" size="sm" onClick={addTopic}>
                Add
              </Button>
            </div>
            {topics.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {topics.map((t) => (
                  <Badge
                    key={t}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() => setTopics((p) => p.filter((x) => x !== t))}
                  >
                    {t} &times;
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sess-takeaways">Key Takeaways</Label>
            <Textarea
              id="sess-takeaways"
              value={form.key_takeaways}
              onChange={(e) => setForm((p) => ({ ...p, key_takeaways: e.target.value }))}
              placeholder="What were the main outcomes or decisions?"
              rows={3}
            />
          </div>

          {/* Action items */}
          <div className="space-y-1.5">
            <Label>Action Items</Label>
            <div className="flex gap-2">
              <Input
                value={actionInput}
                onChange={(e) => setActionInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAction(); } }}
                placeholder="Add an action item and press Enter"
              />
              <Button type="button" variant="outline" size="sm" onClick={addAction}>
                Add
              </Button>
            </div>
            {actionItems.length > 0 && (
              <ul className="space-y-1 mt-1">
                {actionItems.map((a) => (
                  <li key={a} className="flex items-center justify-between text-sm border rounded px-2 py-1">
                    <span>{a}</span>
                    <button
                      type="button"
                      onClick={() => setActionItems((p) => p.filter((x) => x !== a))}
                      className="text-muted-foreground hover:text-destructive ml-2"
                    >
                      &times;
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sess-blockers">Blockers</Label>
            <Textarea
              id="sess-blockers"
              value={form.blockers}
              onChange={(e) => setForm((p) => ({ ...p, blockers: e.target.value }))}
              placeholder="Any challenges or blockers mentioned?"
              rows={2}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sess-mentor-rating">Mentor Rating (1–5)</Label>
              <Select
                value={form.mentor_rating}
                onValueChange={(v) => setForm((p) => ({ ...p, mentor_rating: v }))}
              >
                <SelectTrigger id="sess-mentor-rating">
                  <SelectValue placeholder="Rate mentor" />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} {'★'.repeat(n)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sess-startup-rating">Startup Rating (1–5)</Label>
              <Select
                value={form.startup_rating}
                onValueChange={(v) => setForm((p) => ({ ...p, startup_rating: v }))}
              >
                <SelectTrigger id="sess-startup-rating">
                  <SelectValue placeholder="Rate startup" />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} {'★'.repeat(n)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={logSession.isPending}>
              {logSession.isPending ? 'Logging...' : 'Log Session'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Match Card with session history ─────────────────────────────────────────

function MatchCard({ match, mentorId }: { match: any; mentorId: string }) {
  const [expanded, setExpanded] = useState(false);
  const matchStatusConfig = MATCH_STATUS_CONFIG[match.status] ?? MATCH_STATUS_CONFIG.active;
  const sessions: any[] = Array.isArray(match.sessions) ? match.sessions : [];

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3 min-w-0">
          <Rocket className="h-4 w-4 shrink-0 text-blue-600" />
          <div className="min-w-0">
            <p className="font-medium truncate">
              {match.startup?.startup_name ?? match.startup?.problem?.title ?? 'Unnamed Startup'}
            </p>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
              <span>{match.sessions_count ?? sessions.length ?? 0} sessions</span>
              {match.satisfaction_score != null && (
                <span className="flex items-center gap-0.5">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  {Number(match.satisfaction_score).toFixed(1)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className={matchStatusConfig.color}>
            {matchStatusConfig.label}
          </Badge>
          {match.status === 'active' && (
            <LogSessionDialog matchId={match.id} mentorId={mentorId} />
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setExpanded((p) => !p)}
            aria-label="Toggle session history"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t bg-muted/30 p-4 space-y-2">
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sessions logged yet.</p>
          ) : (
            sessions.map((session: any, i: number) => (
              <div key={session.id ?? i} className="text-sm border rounded p-3 bg-background space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {session.date
                      ? new Date(session.date).toLocaleDateString()
                      : 'Date not set'}
                  </span>
                  {session.duration_minutes && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {session.duration_minutes} min
                    </span>
                  )}
                </div>
                {session.focus_area && (
                  <Badge variant="secondary" className="text-xs capitalize">
                    {(session.focus_area as string).replace(/_/g, ' ')}
                  </Badge>
                )}
                {session.key_takeaways && (
                  <p className="text-muted-foreground text-xs line-clamp-2">
                    {session.key_takeaways}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main MentorDetail component ──────────────────────────────────────────────

interface MentorDetailProps {
  id: string;
}

export function MentorDetail({ id }: MentorDetailProps) {
  const { data: mentorRaw, isLoading, error } = useMentor(id);
  const { data: matchesRaw, isLoading: matchesLoading } = useMentorMatches(id);
  const onboardMentor = useOnboardMentor();

  const mentor: any  = mentorRaw;
  const matches: any = matchesRaw;
  const matchList: any[] = Array.isArray(matches) ? matches : matches?.data ?? [];

  const typeConfig   = MENTOR_TYPE_CONFIG[mentor?.mentor_type] ?? MENTOR_TYPE_CONFIG.functional;
  const statusConfig = STATUS_CONFIG[mentor?.status]           ?? STATUS_CONFIG.prospect;

  const canOnboard = mentor?.status === 'prospect' || mentor?.status === 'screening';

  const domains:    string[] = Array.isArray(mentor?.domain_expertise)   ? mentor.domain_expertise   : [];
  const functional: string[] = Array.isArray(mentor?.functional_expertise) ? mentor.functional_expertise : [];

  const currentMentees = matchList.filter((m: any) => m.status === 'active').length;
  const maxMentees     = mentor?.max_mentees ?? 0;
  const capacityPct    = maxMentees > 0 ? Math.round((currentMentees / maxMentees) * 100) : 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <Card>
          <CardContent className="pt-6 space-y-4">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Failed to load mentor details. Please try again.</AlertDescription>
        </Alert>
        <Button variant="outline" asChild>
          <Link href="/startup-studio/mentors">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Mentor Network
          </Link>
        </Button>
      </div>
    );
  }

  if (!mentor) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Mentor not found.</p>
        <Button variant="outline" asChild>
          <Link href="/startup-studio/mentors">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Mentor Network
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold py-1">{mentor.name}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge variant="outline" className={typeConfig.color}>{typeConfig.label}</Badge>
            <Badge variant="outline" className={statusConfig.color}>{statusConfig.label}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/startup-studio/mentors">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          {canOnboard && (
            <Button
              onClick={() => onboardMentor.mutateAsync(id)}
              disabled={onboardMentor.isPending}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              {onboardMentor.isPending ? 'Onboarding...' : 'Onboard Mentor'}
            </Button>
          )}
        </div>
      </div>

      {/* ── Profile Card ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-blue-600" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2">
            {mentor.designation && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Designation</dt>
                <dd className="text-sm mt-0.5">{mentor.designation}</dd>
              </div>
            )}
            {mentor.organization && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Organization</dt>
                <dd className="text-sm mt-0.5 flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  {mentor.organization}
                </dd>
              </div>
            )}
            {mentor.email && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Email</dt>
                <dd className="text-sm mt-0.5 flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  <a href={`mailto:${mentor.email}`} className="hover:underline text-primary">
                    {mentor.email}
                  </a>
                </dd>
              </div>
            )}
            {mentor.phone && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Phone</dt>
                <dd className="text-sm mt-0.5 flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  {mentor.phone}
                </dd>
              </div>
            )}
            {mentor.linkedin_url && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">LinkedIn</dt>
                <dd className="text-sm mt-0.5 flex items-center gap-1">
                  <Linkedin className="h-3.5 w-3.5 text-muted-foreground" />
                  <a
                    href={mentor.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline text-primary truncate max-w-[200px]"
                  >
                    View Profile
                  </a>
                </dd>
              </div>
            )}
            {mentor.years_experience != null && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Experience</dt>
                <dd className="text-sm mt-0.5">{mentor.years_experience} years</dd>
              </div>
            )}
            {mentor.source && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Source</dt>
                <dd className="text-sm mt-0.5">{mentor.source}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* ── Expertise ── */}
      {(domains.length > 0 || functional.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-purple-600" />
              Expertise
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {domains.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Domain Expertise</p>
                <div className="flex flex-wrap gap-1.5">
                  {domains.map((d) => (
                    <Badge key={d} variant="secondary">{d}</Badge>
                  ))}
                </div>
              </div>
            )}
            {functional.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Functional Expertise</p>
                <div className="flex flex-wrap gap-1.5">
                  {functional.map((f) => (
                    <Badge key={f} variant="outline">{f}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Capacity Card ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-green-600" />
            Capacity & Availability
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5 text-sm">
              <span className="text-muted-foreground">Current Mentees</span>
              <span className="font-medium">{currentMentees} / {maxMentees || '—'}</span>
            </div>
            {maxMentees > 0 && (
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(capacityPct, 100)}%` }}
                />
              </div>
            )}
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            {mentor.preferred_meeting_frequency && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Preferred Frequency</dt>
                <dd className="text-sm mt-0.5 capitalize">
                  {(mentor.preferred_meeting_frequency as string).replace(/_/g, ' ')}
                </dd>
              </div>
            )}
            {mentor.preferred_mode && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Preferred Mode</dt>
                <dd className="text-sm mt-0.5 capitalize">
                  {(mentor.preferred_mode as string).replace(/_/g, ' ')}
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* ── Screening Section ── */}
      {mentor.screening_score != null && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-teal-600" />
              Screening
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Screening Score</dt>
                <dd className="text-2xl font-bold mt-0.5">{mentor.screening_score}</dd>
              </div>
              {mentor.screening_date && (
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Screened On</dt>
                  <dd className="text-sm mt-0.5">
                    {new Date(mentor.screening_date).toLocaleDateString()}
                  </dd>
                </div>
              )}
              {mentor.screening_notes && (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-muted-foreground">Notes</dt>
                  <dd className="text-sm mt-0.5 text-muted-foreground">{mentor.screening_notes}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      )}

      {/* ── Active Matches ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-blue-600" />
            Active Matches
          </CardTitle>
        </CardHeader>
        <CardContent>
          {matchesLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : matchList.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matches assigned yet.</p>
          ) : (
            <div className="space-y-3">
              {matchList.map((match: any) => (
                <MatchCard key={match.id} match={match} mentorId={id} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Performance Stats ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-amber-600" />
            Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
            {[
              { label: 'Total Sessions',    value: mentor.total_sessions ?? 0 },
              { label: 'Total Hours',       value: mentor.total_hours != null ? `${Number(mentor.total_hours).toFixed(1)}h` : '—' },
              { label: 'Avg Rating',        value: mentor.avg_rating  != null ? Number(mentor.avg_rating).toFixed(1) : '—' },
              { label: 'Startups Mentored', value: mentor.startups_mentored ?? 0 },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
