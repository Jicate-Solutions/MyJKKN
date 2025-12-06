'use client';

/**
 * SuggestedQueries
 * Displays clickable query suggestions
 */

import { Button } from '@/components/ui/button';
import {
  Users,
  CreditCard,
  Calendar,
  BarChart,
  Clock,
  Bell,
  FileText,
  HelpCircle,
} from 'lucide-react';
import type { SuggestedQuery, ToolCategory } from '@/types/ai-query';

interface SuggestedQueriesProps {
  suggestions: SuggestedQuery[];
  onSuggestionClick: (text: string) => void;
  disabled?: boolean;
}

const categoryIcons: Record<ToolCategory | 'suggested', React.ReactNode> = {
  academic: <Calendar className="h-4 w-4" />,
  billing: <CreditCard className="h-4 w-4" />,
  students: <Users className="h-4 w-4" />,
  staff: <Users className="h-4 w-4" />,
  admissions: <FileText className="h-4 w-4" />,
  organization: <BarChart className="h-4 w-4" />,
  resources: <Clock className="h-4 w-4" />,
  users: <Users className="h-4 w-4" />,
  notifications: <Bell className="h-4 w-4" />,
  bug_reports: <FileText className="h-4 w-4" />,
  dashboard: <BarChart className="h-4 w-4" />,
  applications: <FileText className="h-4 w-4" />,
  context: <HelpCircle className="h-4 w-4" />,
  action: <FileText className="h-4 w-4" />,
  suggested: <HelpCircle className="h-4 w-4" />,
};

export function SuggestedQueries({
  suggestions,
  onSuggestionClick,
  disabled,
}: SuggestedQueriesProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl w-full">
      {suggestions.map((suggestion, index) => (
        <Button
          key={index}
          variant="outline"
          className="h-auto py-3 px-4 justify-start text-left"
          onClick={() => onSuggestionClick(suggestion.text)}
          disabled={disabled}
        >
          <span className="mr-3 text-muted-foreground">
            {categoryIcons[suggestion.category] || <HelpCircle className="h-4 w-4" />}
          </span>
          <span className="text-sm">{suggestion.text}</span>
        </Button>
      ))}
    </div>
  );
}

export default SuggestedQueries;
