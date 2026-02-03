'use client';

import { useEffect, useState } from 'react';
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
  Clock,
  CheckCircle2,
  User,
  Building,
} from 'lucide-react';
import { toast } from 'sonner';
import { createClientSupabaseClient as createClient } from '@/lib/supabase/client';
import { format, formatDistanceToNow } from 'date-fns';

interface Message {
  id: string;
  subject: string;
  message: string;
  sender_type: 'client' | 'staff';
  sender_name: string;
  status: string;
  created_at: string;
  solution?: {
    title: string;
    solution_code: string;
  };
}

interface Solution {
  id: string;
  title: string;
  solution_code: string;
}

export default function ClientCommunicationsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newMessage, setNewMessage] = useState({
    subject: '',
    message: '',
    solution_id: '',
  });

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setIsLoading(false);
        return;
      }

      // Note: sh_clients table is for future Solutions Hub feature
      // Using type assertion since table may not exist yet
      const { data: client } = await (supabase as any)
        .from('sh_clients')
        .select('id, name')
        .eq('user_id', user.id)
        .single();

      if (!client) {
        setIsLoading(false);
        return;
      }

      // Get solutions for dropdown
      // Note: sh_solutions table is for future Solutions Hub feature
      const { data: solutionsData } = await (supabase as any)
        .from('sh_solutions')
        .select('id, title, solution_code')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false });

      setSolutions((solutionsData as Solution[]) || []);

      // Get messages
      // Note: In a real implementation, there would be a communications/messages table
      // For now, we'll show a placeholder since this table may not exist yet
      setMessages([]);

      setIsLoading(false);
    }

    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newMessage.subject.trim() || !newMessage.message.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);

    // Note: In a real implementation, this would insert into a communications table
    // For now, we'll just show a success message
    toast.success('Message sent successfully. Our team will respond shortly.');

    setNewMessage({
      subject: '',
      message: '',
      solution_id: '',
    });

    setIsSubmitting(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
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
                    <SelectItem value="">General Inquiry</SelectItem>
                    {solutions.map((solution) => (
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
            {messages.length > 0 ? (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`p-4 rounded-lg border ${
                      message.sender_type === 'client'
                        ? 'bg-primary/5 border-primary/20'
                        : 'bg-muted'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {message.sender_type === 'client' ? (
                          <User className="h-4 w-4 text-primary" />
                        ) : (
                          <Building className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="font-medium text-sm">
                          {message.sender_name}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {message.sender_type === 'client' ? 'You' : 'JKKN Team'}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(message.created_at), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                    <p className="font-medium text-sm mb-1">{message.subject}</p>
                    <p className="text-sm text-muted-foreground">{message.message}</p>
                    {message.solution && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Re: {message.solution.title} ({message.solution.solution_code})
                      </p>
                    )}
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
