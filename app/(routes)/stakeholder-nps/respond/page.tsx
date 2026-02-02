'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNPSSurvey, useSubmitNPSResponse } from '@/hooks/stakeholder-nps';
import { BeatLoader } from 'react-spinners';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StakeholderType, NPSScore } from '@/types/stakeholder-nps';
import { v4 as uuidv4 } from 'uuid';

function RespondPageContent() {
  const searchParams = useSearchParams();
  const surveyId = searchParams.get('survey');

  const [score, setScore] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Use the React Query hooks with correct property names
  const { data: survey, isLoading: surveyLoading, error: surveyError } = useNPSSurvey(surveyId);
  const submitMutation = useSubmitNPSResponse();

  useEffect(() => {
    if (submitMutation.isSuccess) {
      setSubmitted(true);
    }
  }, [submitMutation.isSuccess]);

  if (!surveyId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center py-12">
            <AlertCircle className="h-16 w-16 text-yellow-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Invalid Survey Link</h2>
            <p className="text-muted-foreground text-center">
              This survey link is invalid or has expired. Please check the link and try again.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (surveyLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <BeatLoader color="#00e902" />
      </div>
    );
  }

  if (surveyError || !survey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center py-12">
            <AlertCircle className="h-16 w-16 text-red-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Survey Not Found</h2>
            <p className="text-muted-foreground text-center">
              This survey could not be found or is no longer available.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (survey.status !== 'active') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center py-12">
            <AlertCircle className="h-16 w-16 text-yellow-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Survey Closed</h2>
            <p className="text-muted-foreground text-center">
              This survey is no longer accepting responses.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const now = new Date();
  const startDate = new Date(survey.start_date);
  const endDate = new Date(survey.end_date);

  if (now < startDate || now > endDate) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center py-12">
            <AlertCircle className="h-16 w-16 text-yellow-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Survey Not Available</h2>
            <p className="text-muted-foreground text-center">
              This survey is not currently accepting responses. Please check back later.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center py-12">
            <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Thank You!</h2>
            <p className="text-muted-foreground text-center">
              Your feedback has been submitted successfully. We appreciate your time and input.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (score === null) return;

    // Get the first stakeholder type from the survey
    const stakeholderType: StakeholderType =
      (survey.stakeholder_types?.[0] as StakeholderType) || 'student';

    try {
      await submitMutation.mutateAsync({
        survey_id: survey.id,
        stakeholder_type: stakeholderType,
        stakeholder_id: uuidv4(), // Generate a unique ID for anonymous responses
        stakeholder_email: email || undefined,
        stakeholder_name: name || undefined,
        score: score as NPSScore,
        feedback: feedback || undefined
      });
    } catch (error) {
      // Error handled by hook
      console.error('[Respond] Failed to submit:', error);
    }
  };

  const getScoreColor = (n: number, isSelected: boolean) => {
    if (!isSelected) return 'bg-gray-100 hover:bg-gray-200 text-gray-700';
    if (n >= 9) return 'bg-green-500 text-white';
    if (n >= 7) return 'bg-yellow-500 text-white';
    return 'bg-red-500 text-white';
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">JKKN Feedback Survey</h1>
          <p className="text-gray-600 mt-2">Your feedback helps us improve</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{survey.title}</CardTitle>
            {survey.description && (
              <CardDescription>{survey.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* NPS Question */}
              <div>
                <Label className="text-base font-medium">
                  {survey.question || 'How likely are you to recommend JKKN to others?'} *
                </Label>
                <div className="mt-4">
                  <div className="flex gap-1 flex-wrap justify-center">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setScore(n)}
                        className={cn(
                          'w-10 h-10 sm:w-12 sm:h-12 rounded-lg text-sm font-semibold transition-all duration-200',
                          getScoreColor(n, score === n)
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground mt-3 px-1">
                    <span>Not at all likely</span>
                    <span>Extremely likely</span>
                  </div>
                </div>
              </div>

              {/* Feedback */}
              <div>
                <Label htmlFor="feedback" className="text-base font-medium">
                  What is the primary reason for your score?
                </Label>
                <Textarea
                  id="feedback"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Share your thoughts with us..."
                  className="mt-2"
                  rows={4}
                />
              </div>

              {/* Optional Contact Info */}
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Optional: Provide your contact details if you&apos;d like us to follow up
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>

              {/* Error message */}
              {submitMutation.isError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">
                    {submitMutation.error?.message || 'Failed to submit response. Please try again.'}
                  </p>
                </div>
              )}

              {/* Submit */}
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={score === null || submitMutation.isPending}
              >
                {submitMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Feedback'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-sm text-muted-foreground mt-8">
          Your response is confidential and will be used to improve our services.
        </p>
      </div>
    </div>
  );
}

export default function RespondPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <BeatLoader color="#00e902" />
        </div>
      }
    >
      <RespondPageContent />
    </Suspense>
  );
}
