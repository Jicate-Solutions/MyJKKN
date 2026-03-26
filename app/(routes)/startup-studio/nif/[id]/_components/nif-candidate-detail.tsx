'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Award,
  CheckCircle,
  XCircle,
  Clock,
  Rocket,
  Globe,
  Users,
  DollarSign,
  Lightbulb,
  History,
} from 'lucide-react';
import {
  useNifCandidate,
  useNifStageHistory,
  useAdvanceNifStage,
  useRejectNifCandidate,
} from '@/hooks/startup-studio';
import { DEPLOYMENT_PLATFORM_OPTIONS } from '@/lib/constants/startup-studio/matlab-toolbox-map';
import { TrlTab } from './trl-tab';
import { RiskTab } from './risk-tab';
import { CompetitiveTab } from './competitive-tab';
import { EnrichedInfoSection } from './enriched-info-section';
import { MentorTab } from './mentor-tab';
import { GraduationTab } from './graduation-tab';

interface NifCandidateDetailProps {
  id: string;
}

const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  identified: { label: 'Identified', color: 'bg-gray-100 text-gray-800' },
  screened: { label: 'Screened', color: 'bg-blue-100 text-blue-800' },
  shortlisted: { label: 'Shortlisted', color: 'bg-amber-100 text-amber-800' },
  incubating: { label: 'Incubating', color: 'bg-purple-100 text-purple-800' },
  graduated: { label: 'Graduated', color: 'bg-green-100 text-green-800' },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800' },
};

const STAGE_ORDER = ['identified', 'screened', 'shortlisted', 'incubating', 'graduated'];

export function NifCandidateDetail({ id }: NifCandidateDetailProps) {
  const { data: candidateRaw, isLoading, error } = useNifCandidate(id);
  const { data: historyRaw, isLoading: historyLoading } = useNifStageHistory(id);
  const advanceStage = useAdvanceNifStage();
  const rejectCandidate = useRejectNifCandidate();

  const candidate = candidateRaw as any;
  const history = historyRaw as any;

  const historyList = Array.isArray(history) ? history : history?.data ?? [];

  const handleAdvance = async () => {
    const currentStage = candidate?.current_stage ?? candidate?.stage ?? 'identified';
    const STAGE_ORDER = ['identified', 'screened', 'shortlisted', 'incubating', 'graduated'];
    const nextStageIndex = STAGE_ORDER.indexOf(currentStage) + 1;
    if (nextStageIndex >= STAGE_ORDER.length) return;
    const nextStage = STAGE_ORDER[nextStageIndex];
    await advanceStage.mutateAsync({ id, data: { stage: nextStage } });
  };

  const handleReject = async () => {
    const reason = window.prompt('Reason for rejection:');
    if (!reason) return;
    await rejectCandidate.mutateAsync({ id, data: { reason } });
  };

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
          <AlertDescription>
            Failed to load candidate details. Please try again.
          </AlertDescription>
        </Alert>
        <Button variant="outline" asChild>
          <Link href="/startup-studio/nif">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to NIF Pipeline
          </Link>
        </Button>
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Candidate not found.</p>
        <Button variant="outline" asChild>
          <Link href="/startup-studio/nif">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to NIF Pipeline
          </Link>
        </Button>
      </div>
    );
  }

  const currentStage = candidate.current_stage ?? candidate.stage ?? 'identified';
  const stageConfig = STAGE_CONFIG[currentStage] ?? STAGE_CONFIG.identified;
  const canAdvance = currentStage !== 'graduated' && currentStage !== 'rejected' && currentStage !== 'on_hold';
  const canReject = currentStage !== 'rejected' && currentStage !== 'graduated';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold py-1">
            {candidate.problem?.title ?? candidate.problem_title ?? 'NIF Candidate'}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className={stageConfig.color}>
              {stageConfig.label}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/startup-studio/nif">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          {canAdvance && (
            <Button
              onClick={handleAdvance}
              disabled={advanceStage.isPending}
            >
              <ArrowRight className="mr-2 h-4 w-4" />
              {advanceStage.isPending ? 'Advancing...' : 'Advance Stage'}
            </Button>
          )}
          {canReject && (
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejectCandidate.isPending}
            >
              <XCircle className="mr-2 h-4 w-4" />
              {rejectCandidate.isPending ? 'Rejecting...' : 'Reject'}
            </Button>
          )}
        </div>
      </div>

      {/* Tabbed content */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trl">TRL</TabsTrigger>
          <TabsTrigger value="risk">Risk</TabsTrigger>
          <TabsTrigger value="competitive">Competitive</TabsTrigger>
          <TabsTrigger value="mentors">Mentors</TabsTrigger>
          <TabsTrigger value="graduation">Graduation</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        {/* ── Overview Tab (existing content) ── */}
        <TabsContent value="overview" className="space-y-6 mt-6">

          {/* Stage Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-amber-600" />
            Pipeline Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {STAGE_ORDER.map((stage, index) => {
              const isCompleted = STAGE_ORDER.indexOf(currentStage) > index;
              const isCurrent = currentStage === stage;
              const isRejected = currentStage === 'rejected';

              return (
                <div key={stage} className="flex items-center">
                  <div
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
                      isCurrent
                        ? 'bg-primary text-primary-foreground'
                        : isCompleted
                        ? 'bg-green-100 text-green-800'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : isCurrent ? (
                      <Clock className="h-4 w-4" />
                    ) : null}
                    <span className="capitalize">{stage}</span>
                  </div>
                  {index < STAGE_ORDER.length - 1 && (
                    <ArrowRight className="h-4 w-4 text-muted-foreground mx-1 flex-shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
          {currentStage === 'rejected' && (
            <div className="mt-3 flex items-center gap-2 text-red-600">
              <XCircle className="h-4 w-4" />
              <span className="text-sm font-medium">This candidate has been rejected</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Problem Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-600" />
            Problem Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Problem Title</p>
            <p className="text-base">
              {candidate.problem?.title ?? candidate.problem_title ?? '-'}
            </p>
          </div>
          {(candidate.problem?.statement ?? candidate.problem?.description) && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">Description</p>
              <p className="text-base">
                {candidate.problem?.statement ?? candidate.problem?.description}
              </p>
            </div>
          )}
          {candidate.problem?.theme && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">Theme</p>
              <Badge variant="outline" className="capitalize">
                {candidate.problem.theme}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Startup Info */}
      {(candidate.startup_name || candidate.startup_website || candidate.team_info || candidate.funding_info) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-blue-600" />
              Startup Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {candidate.startup_name && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Startup Name
                  </p>
                  <p className="text-base">{candidate.startup_name}</p>
                </div>
              )}
              {candidate.startup_website && (
                <div>
                  <div className="flex items-center gap-1">
                    <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-sm font-medium text-muted-foreground">
                      Website
                    </p>
                  </div>
                  <a
                    href={candidate.startup_website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-base text-primary hover:underline"
                  >
                    {candidate.startup_website}
                  </a>
                </div>
              )}
              {candidate.team_info && (
                <div>
                  <div className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-sm font-medium text-muted-foreground">
                      Team
                    </p>
                  </div>
                  <p className="text-base">
                    {typeof candidate.team_info === 'string'
                      ? candidate.team_info
                      : JSON.stringify(candidate.team_info)}
                  </p>
                </div>
              )}
              {candidate.funding_info && (
                <div>
                  <div className="flex items-center gap-1">
                    <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-sm font-medium text-muted-foreground">
                      Funding
                    </p>
                  </div>
                  <p className="text-base">
                    {typeof candidate.funding_info === 'string'
                      ? candidate.funding_info
                      : JSON.stringify(candidate.funding_info)}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deployment & Product Link */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-teal-600" />
            Deployment & Product
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Deployment Platform</p>
            {candidate.deployment_platform ? (
              <Badge variant="outline" className="capitalize">
                {DEPLOYMENT_PLATFORM_OPTIONS.find(
                  (o) => o.value === candidate.deployment_platform
                )?.label ?? candidate.deployment_platform}
              </Badge>
            ) : (
              <p className="text-sm text-muted-foreground">Not set</p>
            )}
          </div>
          {candidate.sh_product_id ? (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Linked Product</p>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/solutions/products/${candidate.sh_product_id}`}>
                  View in Solution Hub
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          ) : currentStage === 'graduated' ? (
            <Button
              variant="outline"
              size="sm"
              asChild
            >
              <Link
                href={`/solutions/products/new?from_nif=${id}&title=${encodeURIComponent(
                  candidate.problem?.title ?? ''
                )}`}
              >
                <Rocket className="mr-1 h-3.5 w-3.5" />
                Create Solution Hub Product
              </Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {/* Stage History Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-gray-600" />
            Stage History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : historyList.length > 0 ? (
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-muted" />
              <div className="space-y-4">
                {historyList.map((entry: any, index: number) => {
                  const entryStage = entry.stage ?? entry.to_stage ?? 'unknown';
                  const entryConfig = STAGE_CONFIG[entryStage] ?? {
                    label: entryStage,
                    color: 'bg-gray-100 text-gray-800',
                  };
                  return (
                    <div
                      key={entry.id ?? index}
                      className="relative flex items-start gap-4 pl-10"
                    >
                      <div className="absolute left-2.5 top-1.5 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                      <div className="flex-1 p-3 border rounded-lg">
                        <div className="flex items-center justify-between gap-2">
                          <Badge
                            variant="outline"
                            className={entryConfig.color}
                          >
                            {entryConfig.label}
                          </Badge>
                          {entry.created_at && (
                            <span className="text-xs text-muted-foreground">
                              {new Date(entry.created_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        {(entry.change_reason ?? entry.notes) && (
                          <p className="text-sm text-muted-foreground mt-2">
                            {entry.change_reason ?? entry.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No stage history available</p>
          )}
        </CardContent>
      </Card>

        {/* Close overview TabsContent */}
        </TabsContent>

        {/* ── TRL Tab ── */}
        <TabsContent value="trl" className="mt-6">
          <TrlTab candidateId={id} />
        </TabsContent>

        {/* ── Risk Tab ── */}
        <TabsContent value="risk" className="mt-6">
          <RiskTab candidateId={id} />
        </TabsContent>

        {/* ── Competitive Tab ── */}
        <TabsContent value="competitive" className="mt-6">
          <CompetitiveTab candidateId={id} />
        </TabsContent>

        {/* ── Mentors Tab ── */}
        <TabsContent value="mentors" className="mt-6">
          <MentorTab candidateId={id} />
        </TabsContent>

        {/* ── Graduation Tab ── */}
        <TabsContent value="graduation" className="mt-6">
          <GraduationTab candidateId={id} />
        </TabsContent>

        {/* ── Details Tab (enriched candidate fields) ── */}
        <TabsContent value="details" className="mt-6">
          <EnrichedInfoSection candidate={candidate} />
        </TabsContent>

      </Tabs>
    </div>
  );
}
