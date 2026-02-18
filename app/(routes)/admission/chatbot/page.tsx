'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bot, MessageSquare, HelpCircle, Zap, Brain } from 'lucide-react';
import { AdmissionErrorBoundary } from '@/components/admission';

const plannedFeatures = [
  'AI-powered chatbot for admission inquiries',
  'FAQ management with category organization',
  'Live conversation monitoring and takeover',
  'Multi-channel support (WhatsApp, Website, Email)',
  'Auto-response with escalation triggers',
  'Bot training with custom Q&A datasets',
  'Sentiment analysis and satisfaction tracking',
  'Conversation analytics and reporting',
];

function ChatbotComingSoon() {
  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-lg w-full text-center p-8">
          <CardHeader className="pb-4">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-purple-100">
              <Bot className="h-8 w-8 text-purple-600" />
            </div>
            <CardTitle className="text-2xl">AI Chatbot & FAQ Management</CardTitle>
            <CardDescription className="text-base">
              <Badge variant="outline" className="mt-2 text-sm font-normal">
                Coming Soon
              </Badge>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-muted-foreground">
              Automated 24/7 lead engagement and support with AI-powered responses,
              FAQ management, and multi-channel conversation tracking.
            </p>

            <div className="text-left space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Planned Features
              </h3>
              <ul className="space-y-2">
                {plannedFeatures.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-purple-400 shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-center gap-6 pt-4 border-t text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" /> Multi-channel</span>
              <span className="flex items-center gap-1"><Brain className="h-3.5 w-3.5" /> AI-powered</span>
              <span className="flex items-center gap-1"><Zap className="h-3.5 w-3.5" /> Real-time</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function ChatbotPage() {
  return (
    <AdmissionErrorBoundary>
      <ChatbotComingSoon />
    </AdmissionErrorBoundary>
  );
}

/*
 * ============================================================================
 * LEGACY CODE - Previous mock implementation (kept for future reference)
 * ============================================================================
 *
 * This page previously contained a full mock UI with:
 * - mockFAQs: Array of FAQ objects with categories, views, helpful counts
 * - mockConversations: Array of chat conversations with sentiment tracking
 * - chatbotStats: Dashboard metrics (conversations, resolution rate, response time)
 * - Tabs: Overview, FAQ Management, Live Conversations, Bot Training
 * - Dialog: Add FAQ form
 * - Features: Channel distribution, escalation management, bot personality config
 *
 * To restore: check git history for this file before the "Coming Soon" conversion.
 */
