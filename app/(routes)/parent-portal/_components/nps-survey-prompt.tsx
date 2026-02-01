'use client';

import { useState } from 'react';
import { Star, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { NPSSurvey } from '@/types/stakeholder-nps';

interface NPSSurveyPromptProps {
  survey: NPSSurvey;
  open: boolean;
  onClose: () => void;
  onSubmit: (surveyId: string, score: number, feedback: string) => void;
}

export function NPSSurveyPrompt({
  survey,
  open,
  onClose,
  onSubmit,
}: NPSSurveyPromptProps) {
  const [score, setScore] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [step, setStep] = useState<'score' | 'feedback'>('score');

  const handleScoreSelect = (selectedScore: number) => {
    setScore(selectedScore);
    setStep('feedback');
  };

  const handleSubmit = () => {
    if (score !== null) {
      onSubmit(survey.id, score, feedback);
      // Reset state
      setScore(null);
      setFeedback('');
      setStep('score');
    }
  };

  const getScoreColor = (value: number) => {
    if (value >= 9) return 'bg-green-500 hover:bg-green-600 text-white';
    if (value >= 7) return 'bg-yellow-500 hover:bg-yellow-600 text-white';
    return 'bg-red-500 hover:bg-red-600 text-white';
  };

  const getScoreLabel = (value: number) => {
    if (value >= 9) return 'Excellent!';
    if (value >= 7) return 'Good';
    if (value >= 5) return 'Average';
    return 'Needs Improvement';
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-500" />
              {survey.title}
            </DialogTitle>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <DialogDescription>{survey.description}</DialogDescription>
        </DialogHeader>

        {step === 'score' && (
          <div className="py-6">
            <p className="mb-4 text-center text-sm text-gray-600">
              How likely are you to recommend us to a friend or colleague?
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                <button
                  key={value}
                  onClick={() => handleScoreSelect(value)}
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium transition-all',
                    score === value
                      ? getScoreColor(value)
                      : 'bg-gray-100 hover:bg-gray-200'
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-between text-xs text-gray-500">
              <span>Not at all likely</span>
              <span>Extremely likely</span>
            </div>
          </div>
        )}

        {step === 'feedback' && score !== null && (
          <div className="py-4">
            <div className="mb-4 flex items-center justify-center gap-3">
              <div
                className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold',
                  getScoreColor(score)
                )}
              >
                {score}
              </div>
              <div>
                <p className="font-medium">{getScoreLabel(score)}</p>
                <p className="text-sm text-gray-500">Your rating</p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium">
                Would you like to share any feedback?
              </label>
              <Textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Tell us what we're doing well or how we can improve..."
                rows={4}
              />
            </div>

            <div className="mt-6 flex justify-between">
              <Button variant="outline" onClick={() => setStep('score')}>
                Change Score
              </Button>
              <Button onClick={handleSubmit}>Submit Feedback</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
