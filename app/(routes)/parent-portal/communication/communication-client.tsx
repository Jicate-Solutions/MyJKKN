'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft,
  Bell,
  Mail,
  AlertTriangle,
  CheckCheck,
  Filter,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useParentDashboard,
  useParentCommunications,
  useMarkCommunicationRead,
  useMarkAllCommunicationsRead,
} from '@/hooks/parent-portal';
import { cn } from '@/lib/utils';
import {
  getCommunicationTypeLabel,
  getPriorityColor,
  getPriorityLabel,
} from '@/types/parent-portal';
import type { ParentCommunication, CommunicationType } from '@/types/parent-portal';

export function CommunicationClient() {
  const router = useRouter();
  const [parentId, setParentId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<CommunicationType | 'all'>('all');
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [selectedMessage, setSelectedMessage] = useState<ParentCommunication | null>(
    null
  );

  const { data: dashboardData } = useParentDashboard();

  useEffect(() => {
    const storedParentId = localStorage.getItem('parent_portal_id');
    if (!storedParentId) {
      router.push('/auth/parent/login');
      return;
    }
    setParentId(storedParentId);
  }, [router]);

  const institutionId = dashboardData?.parent?.institution_id || '';

  const { data, isLoading } = useParentCommunications({
    institution_id: institutionId,
    parent_id: parentId || '',
    type: typeFilter === 'all' ? undefined : typeFilter,
    is_read: readFilter === 'all' ? undefined : readFilter === 'read',
    limit: 50,
  });

  const { mutate: markRead } = useMarkCommunicationRead();
  const { mutate: markAllRead, isPending: isMarkingAll } =
    useMarkAllCommunicationsRead();

  const handleSelectMessage = (message: ParentCommunication) => {
    setSelectedMessage(message);
    if (!message.read_at) {
      markRead({ id: message.id });
    }
  };

  const handleMarkAllRead = () => {
    if (parentId) {
      markAllRead(parentId);
    }
  };

  const getIcon = (type: ParentCommunication['communication_type']) => {
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

  const getIconBg = (type: ParentCommunication['communication_type']) => {
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

  if (!parentId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const unreadCount = data?.data.filter((m: any) => !m.read_at).length || 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold">Messages</h1>
              {unreadCount > 0 && (
                <p className="text-sm text-gray-500">
                  {unreadCount} unread message{unreadCount !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllRead}
              disabled={isMarkingAll}
            >
              <CheckCheck className="mr-2 h-4 w-4" />
              Mark All Read
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <Select
              value={typeFilter}
              onValueChange={(v) => setTypeFilter(v as CommunicationType | 'all')}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="announcement">Announcements</SelectItem>
                <SelectItem value="message">Messages</SelectItem>
                <SelectItem value="alert">Alerts</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Select
            value={readFilter}
            onValueChange={(v) => setReadFilter(v as 'all' | 'unread' | 'read')}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="unread">Unread</SelectItem>
              <SelectItem value="read">Read</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Message List */}
          <div className="lg:col-span-1">
            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : data?.data.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Mail className="h-10 w-10 text-gray-300" />
                    <p className="mt-2 text-gray-500">No messages found</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {data?.data.map((message: any) => (
                      <button
                        key={message.id}
                        onClick={() => handleSelectMessage(message as ParentCommunication)}
                        className={cn(
                          'flex w-full gap-3 p-4 text-left transition-colors hover:bg-gray-50',
                          !message.read_at && 'bg-blue-50/50',
                          selectedMessage?.id === message.id && 'bg-blue-100'
                        )}
                      >
                        <div
                          className={cn(
                            'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full',
                            getIconBg(message.type)
                          )}
                        >
                          {getIcon(message.type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              'truncate text-sm',
                              !message.read_at && 'font-medium'
                            )}
                          >
                            {message.subject}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-gray-500">
                            {formatDistanceToNow(new Date(message.created_at), {
                              addSuffix: true,
                            })}
                          </p>
                        </div>
                        {!message.read_at && (
                          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Message Detail */}
          <div className="lg:col-span-2">
            <Card className="h-full">
              {selectedMessage ? (
                <>
                  <CardHeader className="border-b">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-semibold">
                          {selectedMessage.subject}
                        </h2>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                          <Badge
                            variant="outline"
                            className={cn('text-xs', getPriorityColor(selectedMessage.priority))}
                          >
                            {getCommunicationTypeLabel(selectedMessage.type)}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {getPriorityLabel(selectedMessage.priority)}
                          </Badge>
                          <span>
                            {new Date(
                              selectedMessage.created_at
                            ).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    {selectedMessage.sender && (
                      <div className="mt-3 text-sm text-gray-600">
                        From: {selectedMessage.sender.name}
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="prose prose-sm max-w-none">
                      <p className="whitespace-pre-wrap">
                        {selectedMessage.content}
                      </p>
                    </div>
                    {selectedMessage.attachments &&
                      selectedMessage.attachments.length > 0 && (
                        <div className="mt-6 border-t pt-4">
                          <h4 className="mb-2 text-sm font-medium">
                            Attachments
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {selectedMessage.attachments.map((att, idx) => (
                              <a
                                key={idx}
                                href={att.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded border px-2 py-1 text-sm hover:bg-gray-50"
                              >
                                {att.name}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                  </CardContent>
                </>
              ) : (
                <CardContent className="flex h-full items-center justify-center py-12">
                  <div className="text-center text-gray-500">
                    <Mail className="mx-auto h-10 w-10 text-gray-300" />
                    <p className="mt-2">Select a message to read</p>
                  </div>
                </CardContent>
              )}
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
