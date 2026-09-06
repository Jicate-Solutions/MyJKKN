'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Sparkles, Loader2, RefreshCw, Wrench, Lightbulb } from 'lucide-react';
import toast from 'react-hot-toast';
import type { AiTriageBriefing, DetailedBugReport } from '@/types/bugs';

const SEVERITY_STYLES: Record<AiTriageBriefing['severity'], string> = {
  low: 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-800 dark:text-gray-200',
  medium:
    'bg-yellow-50 text-yellow-800 border-yellow-300 dark:bg-yellow-900 dark:text-yellow-200',
  high: 'bg-orange-50 text-orange-800 border-orange-300 dark:bg-orange-900 dark:text-orange-200',
  critical: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-200'
};

interface AiBriefingCardProps {
  report: DetailedBugReport;
  /** Refetch the report after a briefing lands (metadata changed server-side). */
  onGenerated: () => void;
}

/**
 * AI developer briefing for one bug — generated on demand on the ₹0 Max lane
 * and persisted in bug_reports.metadata.ai_triage. Admin detail page only.
 */
export function AiBriefingCard({ report, onGenerated }: AiBriefingCardProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [liveBriefing, setLiveBriefing] = useState<AiTriageBriefing | null>(null);

  const briefing: AiTriageBriefing | null =
    liveBriefing ?? ((report.metadata as any)?.ai_triage as AiTriageBriefing | undefined) ?? null;

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch(`/api/bug-reports/${report.id}/ai-triage`, {
        method: 'POST'
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json.error || 'Failed to generate the briefing');
      }
      setLiveBriefing(json.briefing as AiTriageBriefing);
      toast.success('AI briefing ready.');
      onGenerated();
    } catch (err: any) {
      toast.error(err?.message || 'Could not generate the AI briefing.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <Sparkles className='w-5 h-5 text-amber-500' />
            AI Briefing
          </div>
          {briefing && (
            <Button
              size='sm'
              variant='ghost'
              onClick={handleGenerate}
              disabled={isGenerating}
              className='text-muted-foreground'
            >
              {isGenerating ? (
                <Loader2 className='w-4 h-4 mr-1 animate-spin' />
              ) : (
                <RefreshCw className='w-4 h-4 mr-1' />
              )}
              Regenerate
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!briefing ? (
          <div className='flex flex-col items-start gap-3'>
            <p className='text-sm text-muted-foreground'>
              Generate a plain-English briefing for this bug: what it is, how
              severe it looks, the likely root cause, and suggested fix steps.
              Runs on the internal AI lane at no API cost.
            </p>
            <Button onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className='w-4 h-4 mr-2 animate-spin' />
                  Generating… usually 15–60 seconds
                </>
              ) : (
                <>
                  <Sparkles className='w-4 h-4 mr-2' />
                  Generate AI Briefing
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className='space-y-4'>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant='outline' className={SEVERITY_STYLES[briefing.severity] ?? SEVERITY_STYLES.medium}>
                {briefing.severity} severity
              </Badge>
              <Badge variant='outline'>{briefing.category_verdict}</Badge>
              {briefing.module_guess && (
                <Badge variant='outline' className='text-muted-foreground'>
                  {briefing.module_guess}
                </Badge>
              )}
              <span className='text-[11px] text-muted-foreground ml-auto'>
                confidence: {briefing.confidence} ·{' '}
                {new Date(briefing.generated_at).toLocaleString()}
              </span>
            </div>

            <p className='text-sm leading-relaxed'>{briefing.summary}</p>

            {briefing.root_cause && (
              <>
                <Separator />
                <div className='flex items-start gap-2'>
                  <Lightbulb className='w-4 h-4 mt-0.5 text-amber-500 shrink-0' />
                  <div>
                    <p className='text-xs font-medium text-muted-foreground mb-1'>
                      Likely root cause
                    </p>
                    <p className='text-sm'>{briefing.root_cause}</p>
                  </div>
                </div>
              </>
            )}

            {briefing.fix_steps.length > 0 && (
              <div className='flex items-start gap-2'>
                <Wrench className='w-4 h-4 mt-0.5 text-blue-500 shrink-0' />
                <div className='min-w-0'>
                  <p className='text-xs font-medium text-muted-foreground mb-1'>
                    Suggested fix steps
                  </p>
                  <ol className='list-decimal list-inside space-y-1 text-sm'>
                    {briefing.fix_steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>
              </div>
            )}

            <p className='text-[11px] text-muted-foreground'>
              AI-generated starting point — verify before acting on it.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
