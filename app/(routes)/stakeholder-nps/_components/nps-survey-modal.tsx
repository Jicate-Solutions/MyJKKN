'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useSubmitNPSResponse } from '@/hooks/stakeholder-nps';
import type { NPSSurvey, StakeholderType } from '@/types/stakeholder-nps';
import { cn } from '@/lib/utils';
import { Loader2, CheckCircle } from 'lucide-react';

interface NPSSurveyModalProps {
  survey: NPSSurvey;
  respondentType: StakeholderType;
  respondentId?: string;
  respondentEmail?: string;
  respondentName?: string;
  departmentId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

export function NPSSurveyModal({
  survey,
  respondentType,
  respondentId,
  respondentEmail,
  respondentName,
  departmentId,
  open,
  onOpenChange,
  onComplete
}: NPSSurveyModalProps) {
  const [score, setScore] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const { mutateAsync: submitResponse, isPending: loading, isSuccess } = useSubmitNPSResponse();

  const handleSubmit = async () => {
    if (score === null) return;

    try {
      await submitResponse({
        survey_id: survey.id,
        stakeholder_id: respondentId,
        stakeholder_type: respondentType as 'student' | 'parent' | 'staff' | 'alumni',
        stakeholder_email: respondentEmail,
        stakeholder_name: respondentName,
        score: score as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10,
        feedback: feedback || undefined,
      });

      setSubmitted(true);
      setTimeout(() => {
        onComplete?.();
        onOpenChange(false);
      }, 2000);
    } catch (error) {
      // Error is handled by the hook
    }
  };

  const getScoreColor = (n: number, isSelected: boolean) => {
    if (!isSelected) return 'bg-muted hover:bg-muted/80';
    if (n >= 9) return 'bg-green-500 text-white';
    if (n >= 7) return 'bg-yellow-500 text-white';
    return 'bg-red-500 text-white';
  };

  if (submitted || isSuccess) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <CheckCircle className="h-16 w-16 text-green-500" />
            <h3 className="text-xl font-semibold">Thank You!</h3>
            <p className="text-center text-muted-foreground">
              Your feedback has been submitted successfully.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{survey.title}</DialogTitle>
          {survey.description && (
            <DialogDescription>{survey.description}</DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div>
            <p className="font-medium mb-4">
              How likely are you to recommend JKKN to others?
            </p>
            <div className="flex gap-1 flex-wrap justify-center">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setScore(n)}
                  className={cn(
                    'w-9 h-9 rounded text-sm font-medium transition-colors',
                    getScoreColor(n, score === n)
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-2 px-1">
              <span>Not at all likely</span>
              <span>Extremely likely</span>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium" htmlFor="feedback">
              What is the primary reason for your score? (Optional)
            </label>
            <Textarea
              id="feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Tell us more about your experience..."
              className="mt-2"
              rows={4}
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={score === null || loading}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Feedback'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
