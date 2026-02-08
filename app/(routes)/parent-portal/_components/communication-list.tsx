'use client';

import { formatDistanceToNow } from 'date-fns';
import { Bell, Mail, AlertTriangle, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  getCommunicationTypeLabel,
  getPriorityColor,
} from '@/types/parent-portal';
import type { ParentCommunication } from '@/types/parent-portal';

interface CommunicationListProps {
  communications: ParentCommunication[];
  onMarkRead: (id: string) => void;
  onViewAll: () => void;
  className?: string;
}

export function CommunicationList({
  communications,
  onMarkRead,
  onViewAll,
  className,
}: CommunicationListProps) {
  const getIcon = (type: ParentCommunication['type']) => {
    switch (type) {
      case 'announcement':
        return <Bell className="h-4 w-4" />;
      case 'alert':
        return <AlertTriangle className="h-4 w-4" />;
      case 'message':
      default:
        return <Mail className="h-4 w-4" />;
    }
  };

  const getIconBg = (type: ParentCommunication['type']) => {
    switch (type) {
      case 'announcement':
        return 'bg-blue-100 text-blue-600';
      case 'alert':
        return 'bg-red-100 text-red-600';
      case 'message':
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-medium">
          Recent Messages
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={onViewAll}>
          View All
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {communications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Mail className="h-10 w-10 text-gray-300" />
            <p className="mt-2 text-sm text-gray-500">No messages yet</p>
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="divide-y">
              {communications.map((comm) => (
                <div
                  key={comm.id}
                  className={cn(
                    'flex gap-3 p-4 transition-colors hover:bg-gray-50',
                    !comm.read_at && 'bg-blue-50/50'
                  )}
                >
                  <div
                    className={cn(
                      'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full',
                      getIconBg(comm.type)
                    )}
                  >
                    {getIcon(comm.type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p
                          className={cn(
                            'truncate text-sm',
                            !comm.read_at && 'font-medium'
                          )}
                        >
                          {comm.subject}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-gray-500">
                          {comm.content.slice(0, 60)}
                          {comm.content.length > 60 && '...'}
                        </p>
                      </div>
                      <div className="flex flex-shrink-0 flex-col items-end gap-1">
                        <span className="text-xs text-gray-400">
                          {formatDistanceToNow(new Date(comm.created_at), {
                            addSuffix: true,
                          })}
                        </span>
                        <div className="flex items-center gap-1">
                          <Badge
                            variant="outline"
                            className="text-xs"
                          >
                            {getCommunicationTypeLabel(comm.type)}
                          </Badge>
                          {!comm.read_at && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => onMarkRead(comm.id)}
                              title="Mark as read"
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
