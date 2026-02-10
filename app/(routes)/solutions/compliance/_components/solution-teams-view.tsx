'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Lightbulb,
  Users,
  ExternalLink,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { SolutionTeam } from '@/types/compliance';
import { CLEARANCE_STATUS_CONFIG } from '@/types/compliance';

interface SolutionTeamsViewProps {
  data?: SolutionTeam[];
  isLoading: boolean;
}

export function SolutionTeamsView({ data, isLoading }: SolutionTeamsViewProps) {
  const [expandedSolution, setExpandedSolution] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  if (isLoading) {
    return (
      <div className='space-y-4'>
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className='pt-6'>
              <div className='flex justify-between'>
                <Skeleton className='h-6 w-48' />
                <Skeleton className='h-6 w-24' />
              </div>
              <Skeleton className='h-4 w-32 mt-2' />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className='pt-6 text-center text-muted-foreground'>
          <Lightbulb className='h-12 w-12 mx-auto mb-3 opacity-30' />
          <p>No solutions with graduating builders found</p>
        </CardContent>
      </Card>
    );
  }

  const displayed = showAll ? data : data.slice(0, 10);

  return (
    <div className='space-y-4'>
      {/* Summary */}
      <div className='flex gap-3 text-sm text-muted-foreground'>
        <span>{data.length} solutions with graduating builders</span>
      </div>

      {/* Solution cards */}
      {displayed.map((solution, index) => {
        const isExpanded = expandedSolution === solution.solutionId;
        const allCleared = solution.teamMembers.every(
          (m) => m.clearanceStatus === 'cleared'
        );

        return (
          <motion.div
            key={solution.solutionId}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <Card>
              <CardContent className='pt-6'>
                {/* Header */}
                <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2'>
                  <div className='flex items-center gap-2'>
                    <Lightbulb className='h-5 w-5 text-amber-500' />
                    <span className='font-semibold'>{solution.solutionTitle}</span>
                    <Badge variant='outline' className='text-xs'>
                      {solution.solutionCode}
                    </Badge>
                  </div>
                  <div className='flex items-center gap-2'>
                    <Badge
                      variant='outline'
                      className={
                        allCleared
                          ? 'border-green-200 text-green-700 bg-green-50'
                          : 'border-amber-200 text-amber-700 bg-amber-50'
                      }
                    >
                      {allCleared ? 'All Cleared' : `${solution.graduatingBuilders} graduating`}
                    </Badge>
                    <Badge variant='secondary' className='text-xs'>
                      {solution.solutionType}
                    </Badge>
                    {solution.deploymentUrl && (
                      <a
                        href={solution.deploymentUrl}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='text-muted-foreground hover:text-primary'
                      >
                        <ExternalLink className='h-4 w-4' />
                      </a>
                    )}
                  </div>
                </div>

                {/* Team info */}
                <div className='flex items-center gap-2 mt-2 text-sm text-muted-foreground'>
                  <Users className='h-4 w-4' />
                  <span>
                    {solution.teamSize} team members ({solution.graduatingBuilders} graduating)
                  </span>
                  <span className='capitalize'>
                    Status: {solution.solutionStatus}
                  </span>
                </div>

                {/* Expand/collapse team members */}
                <Button
                  variant='ghost'
                  size='sm'
                  className='mt-2 gap-1'
                  onClick={() =>
                    setExpandedSolution(isExpanded ? null : solution.solutionId)
                  }
                >
                  {isExpanded ? (
                    <>
                      <ChevronUp className='h-3 w-3' /> Hide Team
                    </>
                  ) : (
                    <>
                      <ChevronDown className='h-3 w-3' /> Show Team ({solution.teamMembers.length})
                    </>
                  )}
                </Button>

                {/* Team members */}
                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className='mt-3 space-y-2'
                  >
                    {solution.teamMembers.map((member) => {
                      const statusConfig =
                        CLEARANCE_STATUS_CONFIG[member.clearanceStatus];

                      return (
                        <div
                          key={member.builderId}
                          className='flex items-center justify-between p-2 rounded-md bg-muted/30'
                        >
                          <div className='flex items-center gap-2'>
                            <span className='font-medium text-sm'>
                              {member.builderName}
                            </span>
                            <Badge
                              variant='outline'
                              className='text-xs capitalize'
                            >
                              {member.role}
                            </Badge>
                          </div>
                          <Badge
                            variant='outline'
                            className={`text-xs border ${statusConfig.color}`}
                          >
                            {statusConfig.label}
                          </Badge>
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        );
      })}

      {/* Show more/less */}
      {data.length > 10 && (
        <div className='text-center'>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => setShowAll(!showAll)}
          >
            {showAll
              ? 'Show less'
              : `Show all ${data.length} solutions`}
          </Button>
        </div>
      )}
    </div>
  );
}
