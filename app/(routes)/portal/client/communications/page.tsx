'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  MessageSquare,
  Send,
  User,
  Building,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import {
  useCurrentClient,
  useClientSolutions,
  useClientCommunicationsQuery,
  useSendClientMessage,
} from '@/hooks/solutions';

export default function ClientCommunicationsPage() {
  const [newMessage, setNewMessage] = useState({
    subject: '',
    message: '',
    solution_id: 'general', // Use 'general' instead of empty string for Select compatibility
  });

  const { data: client, isLoading: clientLoading, error: clientError } = useCurrentClient();
  const clientId = client?.id;

  const { data: solutions, isLoading: solutionsLoading } = useClientSolutions(clientId ?? '');
  const { data: messages, isLoading: messagesLoading, refetch } = useClientCommunicationsQuery(clientId ?? '');

  const sendMessageMutation = useSendClientMessage();

  // Only consider other queries loading if we have a client
  const isLoading = clientLoading || (!!clientId && (solutionsLoading || messagesLoading));
  const isSubmitting = sendMessageMutation.isPending;
  const solutionsList = solutions || [];
  const messagesList = messages || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newMessage.subject.trim() || !newMessage.message.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (!clientId) {
      toast.error('Unable to identify client');
      return;
    }

    try {
      await sendMessageMutation.mutateAsync({
        clientId: clientId!,
        subject: newMessage.subject,
        message: newMessage.message,
        solutionId: newMessage.solution_id === 'general' ? undefined : newMessage.solution_id,
      });
      toast.success('Message sent successfully. Our team will respond shortly.');
      setNewMessage({
        subject: '',
        message: '',
        solution_id: 'general',
      });
      refetch();
    } catch (error) {
      toast.error('Failed to send message. Please try again.');
    }
  };

  // Error state
  if (clientError) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
            <h2 className="text-lg font-semibold mb-2">Error Loading Communications</h2>
            <p className="text-muted-foreground mb-4">
              {clientError instanceof Error ? clientError.message : 'Failed to load data'}
            </p>
            <Button onClick={() => window.location.reload()}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  // No client found state
  if (!client) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h2 className="text-lg font-semibold mb-2">No Client Profile Found</h2>
            <p className="text-muted-foreground">
              Your account is not linked to a client profile. Please contact support.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Communications</h1>
        <p className="text-muted-foreground">
          Send messages and view communication history with our team
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* New Message Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Send a Message
            </CardTitle>
            <CardDescription>
              Have a question or feedback? Send us a message and we will get back to you.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="solution">Related Solution (Optional)</Label>
                <Select
                  value={newMessage.solution_id}
                  onValueChange={(value) =>
                    setNewMessage({ ...newMessage, solution_id: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a solution" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General Inquiry</SelectItem>
                    {solutionsList.map((solution) => (
                      <SelectItem key={solution.id} value={solution.id}>
                        {solution.title} ({solution.solution_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">Subject *</Label>
                <Input
                  id="subject"
                  placeholder="What is your message about?"
                  value={newMessage.subject}
                  onChange={(e) =>
                    setNewMessage({ ...newMessage, subject: e.target.value })
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Message *</Label>
                <Textarea
                  id="message"
                  placeholder="Type your message here..."
                  value={newMessage.message}
                  onChange={(e) =>
                    setNewMessage({ ...newMessage, message: e.target.value })
                  }
                  rows={6}
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Sending...' : 'Send Message'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Message History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Message History
            </CardTitle>
            <CardDescription>
              View your past communications with our team
            </CardDescription>
          </CardHeader>
          <CardContent>
            {messagesList.length > 0 ? (
              <div className="space-y-4 max-h-[500px] overflow-y-auto">
                {messagesList.map((message) => (
                  <div
                    key={message.id}
                    className={`p-4 rounded-lg border ${
                      message.direction === 'inbound'
                        ? 'bg-primary/5 border-primary/20'
                        : 'bg-muted'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {message.direction === 'inbound' ? (
                          <User className="h-4 w-4 text-primary" />
                        ) : (
                          <Building className="h-4 w-4 text-muted-foreground" />
                        )}
                        <Badge variant="outline" className="text-xs">
                          {message.direction === 'inbound' ? 'You' : 'JKKN Team'}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(message.communication_date), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                    {message.subject && (
                      <p className="font-medium text-sm mb-1">{message.subject}</p>
                    )}
                    <p className="text-sm text-muted-foreground">{message.summary}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium mb-2">No messages yet</h3>
                <p className="text-sm text-muted-foreground">
                  Send your first message using the form on the left.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Contact Info */}
      <Card className="bg-muted/50">
        <CardContent className="py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="font-medium">Need immediate assistance?</p>
              <p className="text-sm text-muted-foreground">
                For urgent matters, contact your account manager directly or call our support line.
              </p>
            </div>
            <div className="text-sm text-muted-foreground">
              <p>Email: solutions@jkkn.ac.in</p>
              <p>Phone: +91 4294 220 333</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
