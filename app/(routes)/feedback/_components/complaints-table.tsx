'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { ComplaintRow } from '@/lib/services/feedback/feedback-dashboard-service';
import type { FeedbackSource, AiSentiment } from '@/lib/types/feedback-spine';

interface ComplaintsTableProps {
  complaints: ComplaintRow[];
  isLoading: boolean;
}

const SOURCE_LABELS: Record<FeedbackSource, string> = {
  ig_comment: 'Instagram',
  ig_dm: 'IG DM',
  session_feedback: 'Session',
  ai_pulse: 'AI Pulse',
  mess: 'Mess',
  class_feedback: 'Class',
  parent: 'Parent',
  scf_checkin: 'SCF',
};

const SENTIMENT_CLASSES: Record<AiSentiment, string> = {
  positive: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  neutral: 'bg-muted text-muted-foreground border-border',
  negative: 'bg-red-50 text-red-700 border-red-200',
  mixed: 'bg-amber-50 text-amber-700 border-amber-200',
};

function CopyDraftButton({ draft }: { draft: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(draft).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-1.5 text-xs h-7"
      onClick={handleCopy}
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-emerald-600" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          Copy draft
        </>
      )}
    </Button>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <tr key={i} className="border-b">
          {Array.from({ length: 5 }).map((__, j) => (
            <td key={j} className="px-3 py-3">
              <Skeleton className="h-4 w-full" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function ComplaintsTable({ complaints, isLoading }: ComplaintsTableProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Complaints / Questions Needing a Reply</CardTitle>
        <CardDescription className="text-xs">
          AI draft replies shown for convenience — review carefully before
          sending. No send button; replies are handled out-of-band.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">From</th>
                  <th className="px-3 py-2 font-medium">Message</th>
                  <th className="px-3 py-2 font-medium">Topic</th>
                  <th className="px-3 py-2 font-medium">AI Draft Reply</th>
                </tr>
              </thead>
              <tbody>
                <SkeletonRows />
              </tbody>
            </table>
          </div>
        ) : complaints.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No complaints, questions, or requests found with the current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">From</th>
                  <th className="px-3 py-2 font-medium">Message</th>
                  <th className="px-3 py-2 font-medium">Topic</th>
                  <th className="px-3 py-2 font-medium min-w-[200px]">AI Draft Reply</th>
                </tr>
              </thead>
              <tbody>
                {complaints.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-3 py-3 whitespace-nowrap">
                      <Badge variant="outline" className="text-xs font-normal">
                        {SOURCE_LABELS[row.source] ?? row.source}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground text-xs max-w-[120px] truncate">
                      {row.actor_ref ?? '—'}
                    </td>
                    <td className="px-3 py-3 max-w-[240px]">
                      <p className="line-clamp-2 text-xs leading-relaxed">
                        {row.content ?? '(no content)'}
                      </p>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {row.ai_topic ? (
                        <span className="text-xs text-muted-foreground">{row.ai_topic}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">—</span>
                      )}
                      {row.ai_sentiment && (
                        <Badge
                          variant="outline"
                          className={`ml-1 text-xs font-normal ${SENTIMENT_CLASSES[row.ai_sentiment]}`}
                        >
                          {row.ai_sentiment}
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-3 max-w-[280px]">
                      {row.ai_draft_reply ? (
                        <div className="space-y-1.5">
                          <p className="text-xs leading-relaxed line-clamp-3 text-muted-foreground">
                            {row.ai_draft_reply}
                          </p>
                          <CopyDraftButton draft={row.ai_draft_reply} />
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
