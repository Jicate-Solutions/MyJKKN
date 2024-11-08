'use client';

import React from 'react';
import Link from 'next/link';
import { Eye, ExternalLink } from 'lucide-react';
import { Application } from '@/types/applications';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';

interface ApplicationCardProps {
  application: Application;
}

export function ApplicationCard({ application }: ApplicationCardProps) {
  return (
    <Card className="group relative flex flex-col overflow-hidden transition-all hover:shadow-lg">
      <CardHeader className="space-y-1 p-4">
        <div className="flex items-start justify-between space-x-2">
          <CardTitle className="line-clamp-1 flex-1 text-lg">
            {application.name}
          </CardTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link 
                  href={application.url} 
                  target="_blank"
                  className="text-muted-foreground hover:text-primary"
                >
                  <ExternalLink className="h-5 w-5" />
                </Link>
              </TooltipTrigger>
              <TooltipContent>
                <p>Open application</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {application.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {application.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {application.tags.length > 3 && (
              <Badge variant="secondary" className="text-xs">
                +{application.tags.length - 3}
              </Badge>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 p-4 pt-0">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger className="text-left">
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {application.description || 'No description available'}
              </p>
            </TooltipTrigger>
            {application.description && (
              <TooltipContent side="right" className="max-w-[300px]">
                <p className="text-sm">{application.description}</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </CardContent>

      <CardFooter className="p-4 pt-0">
        <div className="flex w-full items-center justify-between space-x-2">
          <Badge 
            variant={application.is_active ? "default" : "secondary"}
            className="text-xs"
          >
            {application.is_active ? 'Active' : 'Inactive'}
          </Badge>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="ml-auto gap-2"
          >
            <Link href={application.url}>
              <Eye className="h-4 w-4" />
              <span>View</span>
            </Link>
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}