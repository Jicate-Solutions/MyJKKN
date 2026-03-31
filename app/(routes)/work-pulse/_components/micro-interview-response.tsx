'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { MessageCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { WpMicroInterview } from '@/types/work-pulse';
import { respondToInterview } from '../_actions/pulse-actions';

interface MicroInterviewResponseProps {
  interviews: WpMicroInterview[];
}

export function MicroInterviewResponse({ interviews }: MicroInterviewResponseProps) {
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [freeTexts, setFreeTexts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  if (interviews.length === 0) return null;

  const pending = interviews.filter((i) => !completed.has(i.id));
  if (pending.length === 0) return null;

  async function handleSubmit(interviewId: string) {
    const selected = responses[interviewId];
    if (!selected) {
      toast.error('Please select an option');
      return;
    }

    setSubmitting(interviewId);
    try {
      const result = await respondToInterview(interviewId, {
        selected_option: selected,
        free_text: freeTexts[interviewId] || undefined,
      });

      if (result.success) {
        setCompleted((prev) => new Set([...prev, interviewId]));
        toast.success('Thank you for your response!');
      } else {
        toast.error(result.error || 'Failed to submit');
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
        <MessageCircle className="h-4 w-4" />
        Quick Questions
      </h3>
      {pending.map((interview) => {
        const options = Array.isArray(interview.options)
          ? interview.options
          : [];

        return (
          <Card key={interview.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                {interview.question_text}
              </CardTitle>
              {interview.pattern && (
                <p className="text-xs text-muted-foreground">
                  Related to: {(interview.pattern as { name?: string })?.name}
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <RadioGroup
                value={responses[interview.id] || ''}
                onValueChange={(val) =>
                  setResponses((prev) => ({ ...prev, [interview.id]: val }))
                }
              >
                {options.map((option, idx) => (
                  <div key={idx} className="flex items-center space-x-2">
                    <RadioGroupItem
                      value={String(option)}
                      id={`${interview.id}-${idx}`}
                    />
                    <Label htmlFor={`${interview.id}-${idx}`} className="text-sm">
                      {String(option)}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              <Textarea
                placeholder="Anything else to add? (optional)"
                value={freeTexts[interview.id] || ''}
                onChange={(e) =>
                  setFreeTexts((prev) => ({
                    ...prev,
                    [interview.id]: e.target.value,
                  }))
                }
                className="min-h-[60px]"
              />
              <Button
                size="sm"
                onClick={() => handleSubmit(interview.id)}
                disabled={submitting === interview.id}
              >
                {submitting === interview.id ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : null}
                Submit
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
