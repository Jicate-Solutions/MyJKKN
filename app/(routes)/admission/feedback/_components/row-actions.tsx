'use client';

import { Row } from '@tanstack/react-table';
import { Eye, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { FeedbackCandidate } from '@/lib/services/admission/feedback-service';

interface FeedbackRowActionsProps {
  row: Row<FeedbackCandidate>;
  onViewFeedback?: (candidate: FeedbackCandidate) => void;
}

export function FeedbackRowActions({ row, onViewFeedback }: FeedbackRowActionsProps) {
  const candidate = row.original;
  const responded = !!candidate.lost_reason;
  const [isSending, setIsSending] = useState(false);

  const handleRequestFeedback = async () => {
    setIsSending(true);
    try {
      await new Promise((r) => setTimeout(r, 500));
      toast.success('Feedback request sent successfully');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0">
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {responded ? (
          <DropdownMenuItem
            onClick={() => onViewFeedback?.(candidate)}
            className="cursor-pointer"
          >
            <Eye className="mr-2 h-4 w-4" />
            View Feedback
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onClick={handleRequestFeedback}
            disabled={isSending}
            className="cursor-pointer"
          >
            {isSending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Request Feedback
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
