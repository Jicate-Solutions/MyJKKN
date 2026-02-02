'use client';

import { use } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { notFound } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { useNPSSurvey, useNPSSurveyAnalytics } from '@/hooks/stakeholder-nps';
import { useExportResponses } from '@/hooks/stakeholder-nps/use-nps-responses';
import {
  useActivateSurvey,
  useCloseSurvey,
  useArchiveSurvey
} from '@/hooks/stakeholder-nps';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { BeatLoader } from 'react-spinners';
import {
  ArrowLeft,
  Edit,
  Play,
  Square,
  Archive,
  Download,
  ExternalLink,
  Copy,
  Check
} from 'lucide-react';
import { SurveyStatusBadge } from '../../_components/survey-status-badge';
import { StakeholderTypeBadge } from '../../_components/stakeholder-type-badge';
import { NPSScoreDisplay, NPSDistributionBar } from '../../_components/nps-score-display';
import { useState } from 'react';
import { toast } from 'react-hot-toast';

interface SurveyDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function SurveyDetailPage({ params }: SurveyDetailPageProps) {
  const { id } = use(params);
  const [copied, setCopied] = useState(false);

  // Use React Query hooks with correct property names
  const { data: survey, isLoading: loading, error } = useNPSSurvey(id);
  const { data: analytics, isLoading: analyticsLoading } = useNPSSurveyAnalytics(id);
  const { activateSurvey, loading: activating } = useActivateSurvey();
  const { closeSurvey, loading: closing } = useCloseSurvey();
  const { archiveSurvey, loading: archiving } = useArchiveSurvey();
  const { exportResponses, loading: exporting } = useExportResponses();

  if (loading) {
    return (
      <ContentLayout title="Survey Details">
        <div className="flex items-center justify-center min-h-[400px]">
          <BeatLoader color="#00e902" />
        </div>
      </ContentLayout>
    );
  }

  if (error || !survey) {
    notFound();
  }

  const surveyUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/stakeholder-nps/respond?survey=${survey.id}`
    : '';

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(surveyUrl);
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  // Use response_count from survey or analytics
  const totalResponses = analytics?.total_responses || survey.response_count || 0;

  return (
    <ContentLayout title="Survey Details">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Stakeholder NPS', href: '/stakeholder-nps' },
          { label: survey.title, href: `/stakeholder-nps/surveys/${survey.id}` }
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/stakeholder-nps">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{survey.title}</h1>
                <SurveyStatusBadge status={survey.status} />
              </div>
              <p className="text-muted-foreground mt-1">
                {survey.description || 'No description provided'}
              </p>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            {survey.status === 'draft' && (
              <>
                <Button variant="outline" asChild>
                  <Link href={`/stakeholder-nps/surveys/${survey.id}/edit`}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Link>
                </Button>
                <Button onClick={() => activateSurvey(survey.id)} disabled={activating}>
                  <Play className="mr-2 h-4 w-4" />
                  Activate
                </Button>
              </>
            )}

            {survey.status === 'active' && (
              <Button variant="outline" onClick={() => closeSurvey(survey.id)} disabled={closing}>
                <Square className="mr-2 h-4 w-4" />
                Close Survey
              </Button>
            )}

            {survey.status === 'closed' && (
              <Button variant="outline" onClick={() => archiveSurvey(survey.id)} disabled={archiving}>
                <Archive className="mr-2 h-4 w-4" />
                Archive
              </Button>
            )}

            {totalResponses > 0 && (
              <Button
                variant="outline"
                onClick={() => exportResponses(survey.id, survey.title)}
                disabled={exporting}
              >
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            )}
          </div>
        </div>

        {/* Survey Link (for active surveys) */}
        {survey.status === 'active' && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-green-800">Survey Link</p>
                  <p className="text-xs text-green-600 truncate max-w-md">
                    {surveyUrl}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyLink}
                    className="border-green-300"
                  >
                    {copied ? (
                      <Check className="mr-2 h-4 w-4" />
                    ) : (
                      <Copy className="mr-2 h-4 w-4" />
                    )}
                    {copied ? 'Copied!' : 'Copy'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="border-green-300"
                  >
                    <a href={surveyUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open
                    </a>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Survey Details */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Survey Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Stakeholder Types</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {survey.stakeholder_types.map((type) => (
                      <StakeholderTypeBadge key={type} type={type} />
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <SurveyStatusBadge status={survey.status} className="mt-1" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Start Date</p>
                  <p className="font-medium">
                    {format(new Date(survey.start_date), 'PPP')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">End Date</p>
                  <p className="font-medium">
                    {format(new Date(survey.end_date), 'PPP')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Created</p>
                  <p className="font-medium">
                    {format(new Date(survey.created_at), 'PPP')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Responses</p>
                  <p className="font-medium">{totalResponses}</p>
                </div>
              </div>

              <Separator />

              <div>
                <p className="text-sm text-muted-foreground mb-2">NPS Question</p>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="font-medium">
                    {survey.question || 'How likely are you to recommend our institution to others?'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Scale: 0 (Not at all likely) to 10 (Extremely likely)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Response Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Response Summary</CardTitle>
              <CardDescription>
                {totalResponses} total responses
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {analyticsLoading ? (
                <div className="flex justify-center py-8">
                  <BeatLoader color="#00e902" size={8} />
                </div>
              ) : analytics && totalResponses > 0 ? (
                <>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-2">NPS Score</p>
                    <NPSScoreDisplay score={analytics.nps_score || 0} size="lg" />
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Average Score</p>
                    <p className="text-2xl font-bold">
                      {(analytics.avg_score || 0).toFixed(1)}/10
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Distribution</p>
                    <NPSDistributionBar
                      promoters={analytics.promoter_count || 0}
                      passives={analytics.passive_count || 0}
                      detractors={analytics.detractor_count || 0}
                    />
                  </div>
                </>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No responses yet
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ContentLayout>
  );
}
