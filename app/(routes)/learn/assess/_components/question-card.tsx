'use client';

import type { PDEAssessmentQuestion, SubmissionAnswer } from '@/types/pde';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface QuestionCardProps {
  question: PDEAssessmentQuestion;
  questionNumber: number;
  selectedAnswer: string | undefined;
  onAnswerChange: (questionId: string, answer: string) => void;
  /** Read-only mode for results view */
  readOnly?: boolean;
  /** Show correct/incorrect styling in results */
  submissionAnswer?: SubmissionAnswer;
  showCorrectAnswer?: boolean;
}

export function QuestionCard({
  question,
  questionNumber,
  selectedAnswer,
  onAnswerChange,
  readOnly = false,
  submissionAnswer,
  showCorrectAnswer = false,
}: QuestionCardProps) {
  const isCorrect = submissionAnswer?.is_correct;

  return (
    <Card className={cn(
      readOnly && submissionAnswer && (isCorrect ? 'border-green-300 bg-green-50/50 dark:bg-green-950/10' : 'border-red-300 bg-red-50/50 dark:bg-red-950/10')
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <CardTitle className="text-base font-medium">
            <span className="text-muted-foreground mr-2">Q{questionNumber}.</span>
            {question.question_text}
          </CardTitle>
          <div className="flex items-center gap-2 shrink-0">
            {question.finks_dimension && (
              <Badge variant="outline" className="text-xs capitalize">
                {question.finks_dimension.replace(/_/g, ' ')}
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs">
              {question.points} pt{question.points !== 1 ? 's' : ''}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Multiple Choice */}
        {question.question_type === 'multiple_choice' && question.options && (
          <RadioGroup
            value={selectedAnswer || ''}
            onValueChange={(val) => onAnswerChange(question.id, val)}
            disabled={readOnly}
            className="space-y-2"
          >
            {question.options.map((opt, idx) => (
              <div key={idx} className={cn(
                'flex items-center space-x-3 rounded-md border p-3 transition-colors',
                !readOnly && selectedAnswer === opt.text && 'border-primary bg-primary/5',
                readOnly && showCorrectAnswer && opt.is_correct && 'border-green-500 bg-green-50 dark:bg-green-950/20',
                readOnly && submissionAnswer && submissionAnswer.selected_answer === opt.text && !opt.is_correct && 'border-red-500 bg-red-50 dark:bg-red-950/20'
              )}>
                <RadioGroupItem value={opt.text} id={`q-${question.id}-opt-${idx}`} />
                <Label htmlFor={`q-${question.id}-opt-${idx}`} className="flex-1 cursor-pointer text-sm">
                  {opt.text}
                </Label>
              </div>
            ))}
          </RadioGroup>
        )}

        {/* True/False */}
        {question.question_type === 'true_false' && (
          <div className="flex gap-3">
            <Button
              type="button"
              variant={selectedAnswer === 'true' ? 'default' : 'outline'}
              className={cn(
                'flex-1 h-12',
                readOnly && showCorrectAnswer && question.correct_answer === 'true' && 'border-green-500 bg-green-100 dark:bg-green-950/20',
                readOnly && submissionAnswer && submissionAnswer.selected_answer === 'true' && question.correct_answer !== 'true' && 'border-red-500 bg-red-100 dark:bg-red-950/20'
              )}
              disabled={readOnly}
              onClick={() => onAnswerChange(question.id, 'true')}
            >
              True
            </Button>
            <Button
              type="button"
              variant={selectedAnswer === 'false' ? 'default' : 'outline'}
              className={cn(
                'flex-1 h-12',
                readOnly && showCorrectAnswer && question.correct_answer === 'false' && 'border-green-500 bg-green-100 dark:bg-green-950/20',
                readOnly && submissionAnswer && submissionAnswer.selected_answer === 'false' && question.correct_answer !== 'false' && 'border-red-500 bg-red-100 dark:bg-red-950/20'
              )}
              disabled={readOnly}
              onClick={() => onAnswerChange(question.id, 'false')}
            >
              False
            </Button>
          </div>
        )}

        {/* Short Answer */}
        {question.question_type === 'short_answer' && (
          <Textarea
            placeholder="Type your answer here..."
            value={selectedAnswer || ''}
            onChange={(e) => onAnswerChange(question.id, e.target.value)}
            disabled={readOnly}
            rows={4}
          />
        )}

        {/* Results feedback */}
        {readOnly && submissionAnswer && (
          <div className="mt-3 space-y-2">
            {isCorrect ? (
              <p className="text-sm text-green-600 font-medium">Correct (+{submissionAnswer.points_earned} pts)</p>
            ) : (
              <p className="text-sm text-red-600 font-medium">Incorrect (0 pts)</p>
            )}
            {showCorrectAnswer && question.correct_answer && !isCorrect && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium">Correct answer:</span> {question.correct_answer}
              </p>
            )}
            {showCorrectAnswer && question.explanation && (
              <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                <span className="font-medium">Explanation:</span> {question.explanation}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
