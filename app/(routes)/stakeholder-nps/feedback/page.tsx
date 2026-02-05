'use client';

import { useState, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Meh,
  Filter,
  Download
} from 'lucide-react';
import { format } from 'date-fns';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useQuery } from '@tanstack/react-query';
import { NPSService } from '@/lib/services/stakeholder-nps/nps-service';
import type { NPSResponse, NPSSegment } from '@/types/stakeholder-nps';

export default function StakeholderFeedbackPage() {
  const { selectedInstitutionId: institutionId } = useUserInstitutionAccess();
  const [selectedSurveyId, setSelectedSurveyId] = useState<string | null>(null);
  const [selectedSegment, setSelectedSegment] = useState<NPSSegment | 'all'>('all');

  // Fetch available surveys
  const { data: surveysData, isLoading: surveysLoading } = useQuery({
    queryKey: ['nps-surveys', institutionId],
    queryFn: () => NPSService.getSurveys({
      institution_id: institutionId!,
      status: ['active', 'closed'],
      limit: 100
    }),
    enabled: !!institutionId,
    staleTime: 1000 * 60 * 5
  });

  // Fetch responses for selected survey
  const { data: responsesData, isLoading: responsesLoading } = useQuery({
    queryKey: ['nps-responses', selectedSurveyId],
    queryFn: () => NPSService.getResponses({
      survey_id: selectedSurveyId!,
      has_feedback: true,
      limit: 100
    }),
    enabled: !!selectedSurveyId,
    staleTime: 1000 * 60 * 2
  });

  const surveys = surveysData?.data || [];
  const responses = responsesData?.data || [];

  // Filter responses by segment
  const filteredResponses = useMemo(() => {
    if (selectedSegment === 'all') return responses;
    return responses.filter(r => r.sentiment === selectedSegment);
  }, [responses, selectedSegment]);

  // Calculate stats
  const stats = useMemo(() => {
    const total = responses.length;
    const promoters = responses.filter(r => r.sentiment === 'promoter').length;
    const passives = responses.filter(r => r.sentiment === 'passive').length;
    const detractors = responses.filter(r => r.sentiment === 'detractor').length;

    return { total, promoters, passives, detractors };
  }, [responses]);

  // Auto-select first survey if none selected
  if (surveys.length > 0 && !selectedSurveyId && !surveysLoading) {
    setSelectedSurveyId(surveys[0].id);
  }

  const getCategoryIcon = (category: NPSSegment) => {
    switch (category) {
      case 'promoter':
        return <ThumbsUp className="h-4 w-4 text-green-500" />;
      case 'detractor':
        return <ThumbsDown className="h-4 w-4 text-red-500" />;
      default:
        return <Meh className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getCategoryBadge = (category: NPSSegment) => {
    switch (category) {
      case 'promoter':
        return <Badge className="bg-green-100 text-green-700">Promoter</Badge>;
      case 'detractor':
        return <Badge className="bg-red-100 text-red-700">Detractor</Badge>;
      default:
        return <Badge className="bg-yellow-100 text-yellow-700">Passive</Badge>;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 9) return 'text-green-600';
    if (score >= 7) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getStakeholderTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      student: 'Students',
      learner: 'Learners',
      parent: 'Parents',
      staff: 'Staff',
      alumni: 'Alumni',
      industry: 'Industry Partners',
      employer: 'Employers',
      community: 'Community'
    };
    return labels[type] || type;
  };

  return (
    <ContentLayout title="NPS Feedback">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Stakeholder NPS', href: '/stakeholder-nps' },
          { label: 'Feedback' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Feedback Responses</h1>
            <p className="text-sm text-muted-foreground">
              Detailed feedback from NPS survey respondents
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled>
              <Filter className="mr-2 h-4 w-4" />
              Filter
            </Button>
            <Button variant="outline" disabled>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        {/* Survey Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Select Survey</CardTitle>
            <CardDescription>Choose a survey to view its feedback responses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              {surveysLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : surveys.length === 0 ? (
                <p className="text-sm text-muted-foreground">No surveys available</p>
              ) : (
                <>
                  <Select value={selectedSurveyId || undefined} onValueChange={setSelectedSurveyId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a survey" />
                    </SelectTrigger>
                    <SelectContent>
                      {surveys.map((survey) => (
                        <SelectItem key={survey.id} value={survey.id}>
                          {survey.title} ({survey.response_count} responses)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={selectedSegment} onValueChange={(v) => setSelectedSegment(v as NPSSegment | 'all')}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Feedback</SelectItem>
                      <SelectItem value="promoter">Promoters</SelectItem>
                      <SelectItem value="passive">Passives</SelectItem>
                      <SelectItem value="detractor">Detractors</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        {selectedSurveyId && (
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Responses</CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {responsesLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold">{stats.total}</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Promoters</CardTitle>
                <ThumbsUp className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                {responsesLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold text-green-600">{stats.promoters}</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Passives</CardTitle>
                <Meh className="h-4 w-4 text-yellow-500" />
              </CardHeader>
              <CardContent>
                {responsesLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold text-yellow-600">{stats.passives}</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Detractors</CardTitle>
                <ThumbsDown className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                {responsesLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold text-red-600">{stats.detractors}</div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Feedback List */}
        {selectedSurveyId && (
          <Card>
            <CardHeader>
              <CardTitle>
                {selectedSegment === 'all' ? 'All Feedback' : `${selectedSegment.charAt(0).toUpperCase() + selectedSegment.slice(1)} Feedback`}
              </CardTitle>
              <CardDescription>
                {filteredResponses.length} feedback comment{filteredResponses.length !== 1 ? 's' : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {responsesLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="p-4 rounded-lg border">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Skeleton className="h-5 w-48" />
                          <Skeleton className="h-8 w-20" />
                        </div>
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-20 w-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredResponses.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Feedback Available</h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedSegment === 'all'
                      ? 'No responses with feedback have been submitted yet.'
                      : `No ${selectedSegment} feedback available for this survey.`}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredResponses.map((response: NPSResponse) => (
                    <div key={response.id} className="p-4 rounded-lg border">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            {getCategoryIcon(response.sentiment)}
                            <span className="font-medium">
                              {response.stakeholder_name || 'Anonymous'}
                            </span>
                            <Badge variant="outline">
                              {getStakeholderTypeLabel(response.stakeholder_type)}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {response.stakeholder_email || 'No email'} • {format(new Date(response.created_at), 'dd MMM yyyy')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-center">
                            <span className={`text-2xl font-bold ${getScoreColor(response.score)}`}>
                              {response.score}
                            </span>
                            <span className="text-xs text-muted-foreground">/10</span>
                          </div>
                          {getCategoryBadge(response.sentiment)}
                        </div>
                      </div>
                      {response.feedback && (
                        <div className="mt-3 p-3 rounded bg-muted">
                          <p className="text-sm">{response.feedback}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
