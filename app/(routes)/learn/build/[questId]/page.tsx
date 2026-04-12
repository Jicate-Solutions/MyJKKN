'use client';

import { use, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useQuestDetail,
  useBuildSessions,
  useStartBuildSession,
  useEndBuildSession,
  useLearnerCapabilities,
  useLearnerQuestSubmissions,
} from '@/hooks/pde/use-pde';
import { useLearnerReputation } from '@/hooks/pde/use-pde-phase2';
import { useAuth } from '@/hooks/use-auth';
import { BeatLoader } from 'react-spinners';
import {
  ArrowLeft,
  Target,
  CheckCircle2,
  Lock,
  Upload,
  Save,
  Send,
  Clock,
  FileText,
  Image as ImageIcon,
  File,
  Trash2,
  MessageSquare,
  Brain,
  Zap,
  History,
  Milestone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { PDEQuest, PDEBuildSession, RequiredCapability } from '@/types/pde';
import { toast } from 'sonner';

// ============================================
// Types
// ============================================

interface ArtifactLocal {
  id: string;
  name: string;
  type: string;
  size: number;
}

// ============================================
// Left Panel: Quest Info + Capabilities + Milestones
// ============================================

function QuestInfoPanel({
  quest,
  learnerCapabilities,
  submissions,
  questId,
  userId,
  buildNotes,
}: {
  quest: PDEQuest;
  learnerCapabilities: Array<{ capability_id: string; status: string }>;
  submissions: Array<{ id: string; submitted_at: string; status: string; milestone_label?: string }>;
  questId: string;
  userId?: string;
  buildNotes?: string;
}) {
  const capMap = new Map(learnerCapabilities.map((c) => [c.capability_id, c.status]));

  return (
    <div className="space-y-4">
      {/* Quest Title & Problem */}
      <div>
        <h2 className="text-lg font-bold leading-tight">{quest.title}</h2>
        <Badge variant="outline" className="mt-1 text-xs">
          {quest.quest_type} &bull; {quest.difficulty || 'Medium'}
        </Badge>
      </div>

      <div className="text-sm text-muted-foreground leading-relaxed">
        {quest.problem_statement}
      </div>

      <Separator />

      {/* Required Capabilities Checklist */}
      <div>
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
          <Target className="h-4 w-4" />
          Required Capabilities
        </h3>
        {quest.required_capabilities && quest.required_capabilities.length > 0 ? (
          <div className="space-y-1.5">
            {quest.required_capabilities.map((cap: RequiredCapability, idx: number) => {
              const status = capMap.get(cap.capability_id);
              const isDone = status === 'demonstrated' || status === 'verified';
              return (
                <div
                  key={cap.capability_id || idx}
                  className={cn(
                    'flex items-center gap-2 text-xs p-1.5 rounded',
                    isDone ? 'bg-green-50 dark:bg-green-950/20' : 'bg-muted/50'
                  )}
                >
                  {isDone ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                  ) : (
                    <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className={cn(!isDone && 'text-muted-foreground')}>
                    Capability {idx + 1} (Level {cap.min_level}+)
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No specific capabilities required</p>
        )}
      </div>

      <Separator />

      {/* Milestones Timeline */}
      <div>
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
          <Milestone className="h-4 w-4" />
          Milestones
        </h3>
        {submissions.length > 0 ? (
          <div className="space-y-2">
            {submissions.map((sub, idx) => (
              <div
                key={sub.id}
                className={cn(
                  'flex items-center gap-2 text-xs p-1.5 rounded border-l-2',
                  sub.status === 'graded' || sub.status === 'passed'
                    ? 'border-l-green-500 bg-green-50/50 dark:bg-green-950/10'
                    : sub.status === 'submitted'
                    ? 'border-l-yellow-500 bg-yellow-50/50 dark:bg-yellow-950/10'
                    : 'border-l-muted-foreground/30'
                )}
              >
                <span className="font-medium">#{idx + 1}</span>
                <span className="flex-1 truncate">{sub.milestone_label || 'Submission'}</span>
                <Badge variant="outline" className="text-[10px]">
                  {sub.status}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No milestones submitted yet</p>
        )}
      </div>

      <Separator />

      {/* Action Buttons */}
      <div className="space-y-2">
        <Button
          variant="outline"
          className="w-full text-sm"
          size="sm"
          onClick={async () => {
            if (!userId) return;
            try {
              const res = await fetch(`/api/pde/quests/${questId}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  learner_id: userId,
                  submission_type: 'milestone',
                  title: 'Milestone checkpoint',
                  description: buildNotes || 'Work in progress',
                }),
              });
              if (res.ok) toast.success('Milestone submitted!');
              else toast.error('Failed to submit milestone');
            } catch {
              toast.error('Error submitting milestone');
            }
          }}
        >
          <Send className="h-3.5 w-3.5 mr-1.5" />
          Submit Milestone
        </Button>
        <Button
          className="w-full text-sm"
          size="sm"
          onClick={async () => {
            if (!confirm('Submit your final work for this quest? This cannot be undone.')) return;
            if (!userId) return;
            try {
              const res = await fetch(`/api/pde/quests/${questId}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  learner_id: userId,
                  submission_type: 'final',
                  title: 'Final submission',
                  description: buildNotes || 'Final work submission',
                }),
              });
              if (res.ok) toast.success('Final work submitted!');
              else toast.error('Failed to submit final work');
            } catch {
              toast.error('Error submitting final work');
            }
          }}
        >
          <Send className="h-3.5 w-3.5 mr-1.5" />
          Submit Final
        </Button>
      </div>
    </div>
  );
}

// ============================================
// Center Panel: Build Workspace
// ============================================

function BuildWorkspace({
  notes,
  onNotesChange,
  artifacts,
  onAddArtifact,
  onRemoveArtifact,
  onSaveSession,
  sessions,
  isSaving,
}: {
  notes: string;
  onNotesChange: (val: string) => void;
  artifacts: ArtifactLocal[];
  onAddArtifact: (files: FileList) => void;
  onRemoveArtifact: (id: string) => void;
  onSaveSession: () => void;
  sessions: PDEBuildSession[];
  isSaving: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer.files.length > 0) {
        onAddArtifact(e.dataTransfer.files);
      }
    },
    [onAddArtifact]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Artifacts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
          >
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Drag & drop files here, or click to browse
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Screenshots, code, documents, designs
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Files are saved with your build session. Large files may take a moment to upload.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && onAddArtifact(e.target.files)}
            />
          </div>

          {/* Artifact List */}
          {artifacts.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {artifacts.map((art) => (
                <div
                  key={art.id}
                  className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-xs"
                >
                  {art.type.startsWith('image/') ? (
                    <ImageIcon className="h-4 w-4 text-blue-500 shrink-0" />
                  ) : (
                    <File className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <span className="flex-1 truncate">{art.name}</span>
                  <span className="text-muted-foreground">
                    {(art.size / 1024).toFixed(0)} KB
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onRemoveArtifact(art.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Build Notes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Build Notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Write your build notes here... What are you working on? What decisions are you making? What problems are you solving?"
            className="min-h-[200px] text-sm"
          />
        </CardContent>
      </Card>

      {/* Version History */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <History className="h-4 w-4" />
            Version History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.length > 0 ? (
            <div className="space-y-1.5">
              {sessions.slice(0, 10).map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/30"
                >
                  <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="flex-1">
                    {format(new Date(s.started_at), 'MMM d, HH:mm')}
                    {s.ended_at && ` - ${format(new Date(s.ended_at), 'HH:mm')}`}
                  </span>
                  <span className="text-muted-foreground">
                    {s.duration_minutes ? `${s.duration_minutes}m` : 'Active'}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {(s.artifacts?.length || 0)} files
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">
              No previous sessions
            </p>
          )}
        </CardContent>
      </Card>

      {/* Save Button */}
      <Button
        className="w-full"
        onClick={onSaveSession}
        disabled={isSaving}
      >
        {isSaving ? (
          <BeatLoader color="#fff" size={8} />
        ) : (
          <>
            <Save className="h-4 w-4 mr-2" />
            Save Session
          </>
        )}
      </Button>
    </div>
  );
}

// ============================================
// Right Panel: AI Coach + Stats
// ============================================

function CoachPanel({
  reputation,
  sessionStats,
}: {
  reputation: { agency_index?: number } | null;
  sessionStats: { timeSpent: number; aiInteractions: number; artifactCount: number };
}) {
  return (
    <div className="space-y-4">
      {/* AI Coach Placeholder */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            AI Coach
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/30 rounded-lg p-6 text-center">
            <Brain className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium">AI Coach</p>
            <p className="text-xs text-muted-foreground mt-1">
              Your Socratic thinking partner will be available here.
              It asks questions, challenges assumptions, and tracks your agency.
            </p>
            <Button variant="outline" size="sm" className="mt-3" disabled>
              Coming Soon
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Agency Index Mini Card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Agency Index</p>
              <p className="text-2xl font-bold">
                {reputation?.agency_index ?? '--'}
              </p>
            </div>
          </div>
          <Progress
            value={reputation?.agency_index ?? 0}
            className="h-1.5 mt-2"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            How independently you direct AI tools
          </p>
        </CardContent>
      </Card>

      {/* Build Stats */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">My Build Stats</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Time Spent
            </span>
            <span className="font-medium">{sessionStats.timeSpent}m</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Brain className="h-3.5 w-3.5" /> AI Interactions
            </span>
            <span className="font-medium">{sessionStats.aiInteractions}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Artifacts
            </span>
            <span className="font-medium">{sessionStats.artifactCount}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// Main Build Arena Page
// ============================================

export default function BuildArenaPage({
  params: paramsPromise,
}: {
  params: Promise<{ questId: string }>;
}) {
  const params = use(paramsPromise);
  const questId = params.questId;
  const { profile: user } = useAuth();
  const learnerId = user?.id;

  // Data hooks
  const { data: quest, isLoading: loadingQuest } = useQuestDetail(questId);
  const { data: sessions = [] } = useBuildSessions(learnerId, questId);
  const { data: submissions = [] } = useLearnerQuestSubmissions(learnerId, questId);
  const { data: learnerCaps = [] } = useLearnerCapabilities(learnerId);
  const { data: reputation } = useLearnerReputation(learnerId);

  // Mutations
  const startSession = useStartBuildSession();
  const endSession = useEndBuildSession();

  // Local state
  const [notes, setNotes] = useState('');
  const [artifacts, setArtifacts] = useState<ArtifactLocal[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Find active session
  const activeSession = sessions.find(
    (s: PDEBuildSession) => !s.ended_at
  ) || null;

  // Handlers
  const handleAddArtifact = useCallback((files: FileList) => {
    const newArtifacts: ArtifactLocal[] = Array.from(files).map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: f.name,
      type: f.type,
      size: f.size,
    }));
    setArtifacts((prev) => [...prev, ...newArtifacts]);
  }, []);

  const handleRemoveArtifact = useCallback((id: string) => {
    setArtifacts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleSaveSession = useCallback(async () => {
    if (!learnerId) return;
    setIsSaving(true);
    try {
      if (activeSession) {
        await endSession.mutateAsync({
          sessionId: activeSession.id,
          input: {
            notes,
            artifacts: artifacts.map((a) => ({
              type: a.type,
              url: a.name,
              description: a.name,
            })),
          },
        });
        toast.success('Session saved successfully');
      } else {
        await startSession.mutateAsync({
          learner_id: learnerId,
          quest_id: questId,
        });
        toast.success('Build session started');
      }
    } catch {
      toast.error('Failed to save session');
    } finally {
      setIsSaving(false);
    }
  }, [learnerId, questId, activeSession, notes, artifacts, startSession, endSession]);

  // Session stats
  const totalTime = sessions.reduce(
    (sum: number, s: PDEBuildSession) => sum + (s.duration_minutes || 0), 0
  );
  const totalAI = sessions.reduce(
    (sum: number, s: PDEBuildSession) => sum + (s.ai_prompts_count || 0), 0
  );
  const totalArtifacts = sessions.reduce(
    (sum: number, s: PDEBuildSession) => sum + (s.artifacts?.length || 0), 0
  ) + artifacts.length;

  if (loadingQuest) {
    return (
      <ContentLayout title="Build Arena">
        <div className="flex justify-center py-16">
          <BeatLoader color="#00e902" />
        </div>
      </ContentLayout>
    );
  }

  if (!quest) {
    return (
      <ContentLayout title="Build Arena">
        <div className="text-center py-16">
          <p className="text-muted-foreground">Quest not found</p>
          <Link href="/learn/quests">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Quests
            </Button>
          </Link>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Build Arena">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Quest Board', href: '/learn/quests' },
          { label: quest.title, href: `/learn/quests/${questId}` },
          { label: 'Build' },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mt-4">
        {/* Left Panel */}
        <div className="lg:col-span-1">
          <Card className="sticky top-4">
            <CardContent className="p-4">
              <ScrollArea className="max-h-[calc(100vh-180px)]">
                <QuestInfoPanel
                  quest={quest}
                  learnerCapabilities={learnerCaps}
                  submissions={submissions}
                  questId={questId}
                  userId={user?.id}
                  buildNotes={notes}
                />
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Center Panel */}
        <div className="lg:col-span-2">
          <BuildWorkspace
            notes={notes}
            onNotesChange={setNotes}
            artifacts={artifacts}
            onAddArtifact={handleAddArtifact}
            onRemoveArtifact={handleRemoveArtifact}
            onSaveSession={handleSaveSession}
            sessions={sessions}
            isSaving={isSaving}
          />
        </div>

        {/* Right Panel */}
        <div className="lg:col-span-1">
          <div className="sticky top-4">
            <CoachPanel
              reputation={reputation as { agency_index?: number } | null}
              sessionStats={{
                timeSpent: totalTime,
                aiInteractions: totalAI,
                artifactCount: totalArtifacts,
              }}
            />
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
