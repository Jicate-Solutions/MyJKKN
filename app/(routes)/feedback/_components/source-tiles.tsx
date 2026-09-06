'use client';

import {
  Instagram,
  MessageCircle,
  GraduationCap,
  Sparkles,
  UtensilsCrossed,
  BookOpen,
  Users,
  Activity,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { FeedbackSource } from '@/lib/types/feedback-spine';
import type { FeedbackSummary } from '@/lib/services/feedback/feedback-dashboard-service';

interface SourceTilesProps {
  summary: FeedbackSummary | null;
  isLoading: boolean;
}

const SOURCE_META: Record<FeedbackSource, { label: string; icon: React.ElementType; color: string }> = {
  ig_comment: { label: 'IG Comment', icon: Instagram, color: 'text-pink-500' },
  ig_dm: { label: 'IG DM', icon: MessageCircle, color: 'text-purple-500' },
  session_feedback: { label: 'Session', icon: GraduationCap, color: 'text-blue-500' },
  ai_pulse: { label: 'AI Pulse', icon: Sparkles, color: 'text-amber-500' },
  mess: { label: 'Mess', icon: UtensilsCrossed, color: 'text-orange-500' },
  class_feedback: { label: 'Class', icon: BookOpen, color: 'text-indigo-500' },
  parent: { label: 'Parent', icon: Users, color: 'text-teal-500' },
  scf_checkin: { label: 'SCF', icon: Activity, color: 'text-emerald-500' },
};

const SOURCES: FeedbackSource[] = [
  'session_feedback',
  'class_feedback',
  'mess',
  'parent',
  'scf_checkin',
  'ai_pulse',
  'ig_comment',
  'ig_dm',
];

export function SourceTiles({ summary, isLoading }: SourceTilesProps) {
  if (isLoading) {
    return (
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-1 pt-3 px-3">
              <Skeleton className="h-3 w-12" />
            </CardHeader>
            <CardContent className="pb-3 px-3">
              <Skeleton className="h-6 w-10" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
      {SOURCES.map((src) => {
        const meta = SOURCE_META[src];
        const count = summary?.bySource[src] ?? 0;
        return (
          <Card key={src}>
            <CardHeader className="pb-1 pt-3 px-3">
              <CardDescription className={`flex items-center gap-1 text-xs ${meta.color}`}>
                <meta.icon className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{meta.label}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-3 px-3">
              <div className="text-xl font-semibold tabular-nums">{count.toLocaleString()}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
