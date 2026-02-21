'use client';

import { useState, useRef, useEffect } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useChatbotConfig, useChatbotConfigMutations } from '@/hooks/admission/use-chatbot-config';
import { useChatbotAnalytics } from '@/hooks/admission/use-chatbot-analytics';
import { useChatbotKnowledge } from '@/hooks/admission/use-chatbot-knowledge';
import { useChatbotSessions } from '@/hooks/admission/use-chatbot-sessions';
import { AdmissionErrorBoundary } from '@/components/admission';
import {
  Bot,
  MessageSquare,
  Brain,
  Settings,
  BarChart3,
  BookOpen,
  Send,
  Loader2,
  Power,
  Users,
  ArrowUpRight,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';

// ═══════════════════════════════════════════════════════════════════════════
// TEST CHAT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function TestChatInterface({ chatbotId }: { chatbotId: string }) {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startChat = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/chatbot/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatbot_id: chatbotId, channel: 'website' }),
      });
      const data = await res.json();
      if (data.session) {
        setSessionId(data.session.id);
        // The welcome message was stored server-side, fetch it
        setMessages([{
          role: 'assistant',
          content: 'Hello! I am the JKKN Admissions Assistant. How can I help you today?',
        }]);
      }
    } catch (err) {
      console.error('Failed to start chat:', err);
    }
    setIsLoading(false);
  };

  const sendMessage = async () => {
    if (!input.trim() || !sessionId || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/chatbot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          chatbot_id: chatbotId,
          message: userMsg,
        }),
      });
      const data = await res.json();
      if (data.response) {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.response }]);
      }
      if (data.action?.type === 'handoff') {
        setMessages((prev) => [...prev, {
          role: 'system',
          content: 'Conversation handed off to a counselor.',
        }]);
      }
    } catch (err) {
      setMessages((prev) => [...prev, {
        role: 'system',
        content: 'Failed to get response. Please try again.',
      }]);
    }
    setIsLoading(false);
  };

  if (!sessionId) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Bot className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-4">Test the chatbot as a prospective learner</p>
        <Button onClick={startChat} disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MessageSquare className="h-4 w-4 mr-2" />}
          Start Test Chat
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[400px]">
      <div className="flex-1 overflow-y-auto space-y-3 p-4 bg-muted/30 rounded-lg">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : msg.role === 'system'
                  ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                  : 'bg-card border'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-card border rounded-lg px-4 py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="flex gap-2 mt-3">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          disabled={isLoading}
        />
        <Button onClick={sendMessage} disabled={isLoading || !input.trim()} size="icon">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE CONTENT
// ═══════════════════════════════════════════════════════════════════════════

function ChatbotPageContent() {
  const { profile } = useAuth();
  const { selectedInstitutionId, loading: accessLoading } = useUserInstitutionAccess();
  const institutionId = selectedInstitutionId;

  const { config, isLoading: configLoading } = useChatbotConfig(institutionId || undefined);
  const { saveConfig, toggleActive } = useChatbotConfigMutations();

  const { analytics, isLoading: analyticsLoading } = useChatbotAnalytics({
    chatbot_id: config?.id || '',
  });
  const { documents } = useChatbotKnowledge(config?.id || undefined);
  const { sessions, total: totalSessions } = useChatbotSessions({
    institution_id: institutionId || '',
    limit: 5,
  });

  // Welcome message editor state
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [chatbotName, setChatbotName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Sync form state when config loads
  useEffect(() => {
    if (config) {
      setWelcomeMessage(config.welcome_message || '');
      setChatbotName(config.name || '');
    }
  }, [config]);

  const isLoading = accessLoading || configLoading;

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      await saveConfig.mutateAsync({
        institution_id: institutionId,
        name: chatbotName,
        welcome_message: welcomeMessage,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (active: boolean) => {
    if (!config?.id) {
      // Create config first
      await saveConfig.mutateAsync({
        institution_id: institutionId,
        name: chatbotName || 'JKKN Admissions Assistant',
        welcome_message: welcomeMessage || 'Hello! I am the JKKN Admissions Assistant. How can I help you today?',
        is_active: active,
      });
    } else {
      await toggleActive.mutateAsync({ id: config.id, is_active: active });
    }
  };

  if (isLoading) {
    return (
      <ContentLayout title="AI Chatbot">
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}><CardContent className="pt-6"><Skeleton className="h-16" /></CardContent></Card>
            ))}
          </div>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="AI Chatbot">
      <div className="space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center justify-between">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>AI Chatbot</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="chatbot-toggle" className="text-sm">
                {config?.is_active ? 'Active' : 'Inactive'}
              </Label>
              <Switch
                id="chatbot-toggle"
                checked={config?.is_active || false}
                onCheckedChange={handleToggle}
              />
            </div>
            <Badge variant={config?.is_active ? 'default' : 'secondary'}>
              {config?.is_active ? (
                <><Power className="h-3 w-3 mr-1" /> Online</>
              ) : (
                <><Power className="h-3 w-3 mr-1" /> Offline</>
              )}
            </Badge>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Sessions</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics?.total_sessions || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Now</CardTitle>
              <Users className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics?.active_sessions || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Handoff Rate</CardTitle>
              <ArrowUpRight className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics?.handoff_rate || 0}%</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Lead Conversion</CardTitle>
              <TrendingUp className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics?.lead_conversion_rate || 0}%</div>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="settings" className="space-y-4">
          <TabsList>
            <TabsTrigger value="settings">
              <Settings className="h-4 w-4 mr-2" /> Settings
            </TabsTrigger>
            <TabsTrigger value="test">
              <Bot className="h-4 w-4 mr-2" /> Test Chat
            </TabsTrigger>
            <TabsTrigger value="sessions">
              <MessageSquare className="h-4 w-4 mr-2" /> Sessions
            </TabsTrigger>
          </TabsList>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Configuration */}
              <Card>
                <CardHeader>
                  <CardTitle>Chatbot Configuration</CardTitle>
                  <CardDescription>Configure how the chatbot behaves</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="bot-name">Bot Name</Label>
                    <Input
                      id="bot-name"
                      value={chatbotName}
                      onChange={(e) => setChatbotName(e.target.value)}
                      placeholder="JKKN Admissions Assistant"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="welcome-msg">Welcome Message</Label>
                    <Textarea
                      id="welcome-msg"
                      value={welcomeMessage}
                      onChange={(e) => setWelcomeMessage(e.target.value)}
                      placeholder="Hello! How can I help you today?"
                      rows={3}
                    />
                  </div>
                  <Button onClick={handleSaveConfig} disabled={isSaving}>
                    {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Save Configuration
                  </Button>
                </CardContent>
              </Card>

              {/* Quick Links */}
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BookOpen className="h-5 w-5" /> Knowledge Base
                    </CardTitle>
                    <CardDescription>
                      {documents.length} document{documents.length !== 1 ? 's' : ''} loaded
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-3">
                      Add program brochures, FAQs, and other documents for the chatbot to reference.
                    </p>
                    <Button variant="outline" asChild>
                      <Link href="/admission/chatbot/knowledge">
                        Manage Knowledge Base
                        <ArrowUpRight className="h-4 w-4 ml-2" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" /> Analytics
                    </CardTitle>
                    <CardDescription>
                      View detailed chatbot performance metrics
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-3">
                      Session volume, top questions, intent distribution, and conversion metrics.
                    </p>
                    <Button variant="outline" asChild>
                      <Link href="/admission/chatbot/analytics">
                        View Analytics
                        <ArrowUpRight className="h-4 w-4 ml-2" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>

                {/* Widget embed code */}
                <Card>
                  <CardHeader>
                    <CardTitle>Embed Widget</CardTitle>
                    <CardDescription>Add the chatbot to your website</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {config?.id ? (
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                          Copy and paste this code before the closing &lt;/body&gt; tag:
                        </p>
                        <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
{`<script src="${typeof window !== 'undefined' ? window.location.origin : ''}/chatbot-widget.js"
  data-chatbot-id="${config.id}"
  data-institution="JKKN"></script>`}
                        </pre>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Save the chatbot configuration first to get the embed code.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Test Chat Tab */}
          <TabsContent value="test">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" /> Test Chat
                </CardTitle>
                <CardDescription>
                  Preview how the chatbot responds to prospective learners
                </CardDescription>
              </CardHeader>
              <CardContent>
                {config?.id ? (
                  <TestChatInterface chatbotId={config.id} />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Save the chatbot configuration first to test it.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Sessions Tab */}
          <TabsContent value="sessions">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Recent Sessions</CardTitle>
                    <CardDescription>{totalSessions} total sessions</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {sessions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No chatbot sessions yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sessions.map((session: any) => (
                      <div
                        key={session.id}
                        className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`h-2 w-2 rounded-full ${
                            session.status === 'active' ? 'bg-green-500' :
                            session.status === 'handed_off' ? 'bg-orange-500' : 'bg-gray-400'
                          }`} />
                          <div>
                            <p className="text-sm font-medium">
                              {session.context?.collected_name || session.visitor_id || 'Anonymous'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {session.channel} &middot; {session.message_count || 0} messages
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {session.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(session.last_activity_at || session.started_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}

export default function ChatbotPage() {
  return (
    <PermissionGuard module="admission" action="view">
      <AdmissionErrorBoundary>
        <ChatbotPageContent />
      </AdmissionErrorBoundary>
    </PermissionGuard>
  );
}
