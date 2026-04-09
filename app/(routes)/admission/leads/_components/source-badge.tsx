'use client';

import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════
// Source Badge — colored indicator for lead source
// ═══════════════════════════════════════════════════════════════════════════

const SOURCE_STYLES: Record<string, { bg: string; label: string }> = {
  facebook_ads: { bg: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Facebook' },
  google_ads: { bg: 'bg-red-100 text-red-700 border-red-200', label: 'Google' },
  referral: { bg: 'bg-green-100 text-green-700 border-green-200', label: 'Referral' },
  walk_in: { bg: 'bg-orange-100 text-orange-700 border-orange-200', label: 'Walk-in' },
  education_fair: { bg: 'bg-purple-100 text-purple-700 border-purple-200', label: 'Edu Fair' },
  social_media: { bg: 'bg-pink-100 text-pink-700 border-pink-200', label: 'Social' },
  website: { bg: 'bg-indigo-100 text-indigo-700 border-indigo-200', label: 'Website' },
  newspaper: { bg: 'bg-yellow-100 text-yellow-700 border-yellow-200', label: 'Press' },
  agent: { bg: 'bg-teal-100 text-teal-700 border-teal-200', label: 'Agent' },
  publisher: { bg: 'bg-cyan-100 text-cyan-700 border-cyan-200', label: 'Publisher' },
  admission_form: { bg: 'bg-violet-100 text-violet-700 border-violet-200', label: 'Form' },
  other: { bg: 'bg-gray-100 text-gray-700 border-gray-200', label: 'Other' },
};

export function SourceBadge({ source }: { source: string | null }) {
  if (!source) return null;
  const style = SOURCE_STYLES[source] || SOURCE_STYLES.other;
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 font-normal ${style.bg}`}>
      {style.label}
    </Badge>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Overdue Follow-up Badge
// ═══════════════════════════════════════════════════════════════════════════

export function OverdueBadge({ nextFollowupAt }: { nextFollowupAt: string | null }) {
  if (!nextFollowupAt) return null;
  const isOverdue = new Date(nextFollowupAt) < new Date();
  if (!isOverdue) return null;

  return (
    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal bg-amber-100 text-amber-700 border-amber-200 gap-0.5">
      <AlertTriangle className="h-2.5 w-2.5" />
      Overdue
    </Badge>
  );
}
