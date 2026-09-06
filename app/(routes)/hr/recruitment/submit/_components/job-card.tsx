'use client';

import { MapPin, Briefcase, Clock, Users, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { HRRecruitmentJob } from '@/types/hr-recruitment';
import { JOB_TYPE_LABELS, ROLE_CATEGORY_LABELS } from '@/types/hr-recruitment';

interface JobCardProps {
  job: HRRecruitmentJob;
  institutionName?: string;
  onSelect: (job: HRRecruitmentJob) => void;
}

export function JobCard({ job, institutionName, onSelect }: JobCardProps) {
  const positionsLeft = Math.max(0, job.positions_open - job.positions_filled);
  const location = [job.city, job.state].filter(Boolean).join(', ') || job.country || 'Location not specified';

  const expText =
    job.min_experience_years !== null && job.max_experience_years !== null
      ? `${job.min_experience_years}–${job.max_experience_years} yrs exp`
      : job.min_experience_years !== null
      ? `${job.min_experience_years}+ yrs exp`
      : null;

  return (
    <Card
      className={cn(
        'group cursor-pointer border transition-all duration-150',
        'hover:border-primary/40 hover:shadow-md hover:shadow-primary/5',
      )}
      onClick={() => onSelect(job)}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* Institution */}
            {institutionName && (
              <p className="mb-1 text-xs font-medium text-primary/80 uppercase tracking-wide">
                {institutionName}
              </p>
            )}

            {/* Title */}
            <h3 className="text-base font-semibold text-foreground leading-snug group-hover:text-primary transition-colors">
              {job.title}
            </h3>

            {/* Role category */}
            <p className="mt-0.5 text-sm text-muted-foreground">
              {ROLE_CATEGORY_LABELS[job.role_category] ?? job.role_category}
            </p>

            {/* Meta chips */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {location && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="inline-flex h-3 w-3 flex-shrink-0 items-center justify-center">
                    <MapPin className="h-3 w-3" />
                  </span>
                  {location}
                </span>
              )}
              {job.job_type && (
                <Badge variant="secondary" className="text-xs px-2 py-0.5 font-medium">
                  {JOB_TYPE_LABELS[job.job_type] ?? job.job_type}
                </Badge>
              )}
              {expText && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="inline-flex h-3 w-3 flex-shrink-0 items-center justify-center">
                    <Briefcase className="h-3 w-3" />
                  </span>
                  {expText}
                </span>
              )}
            </div>
          </div>

          {/* CTA side */}
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="inline-flex h-3 w-3 flex-shrink-0 items-center justify-center">
                <Users className="h-3 w-3" />
              </span>
              <span>{positionsLeft} open</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-colors"
              onClick={(e) => { e.stopPropagation(); onSelect(job); }}
            >
              View &amp; Apply
              <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
