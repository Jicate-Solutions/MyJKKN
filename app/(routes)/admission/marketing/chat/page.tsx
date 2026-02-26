'use client';

import { useState, useEffect } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Settings, BarChart3, IndianRupee } from 'lucide-react';
import Link from 'next/link';
import { ConversationList } from './_components/conversation-list';
import { ChatThread } from './_components/chat-thread';
import { LeadProfileSidebar } from './_components/lead-profile-sidebar';
import { useChatRealtime } from '@/hooks/admission/use-chat-realtime';
import { useChatStats } from '@/hooks/admission/use-chat-stats';
import { useCostDashboard } from '@/hooks/admission/use-communication-costs';
import { useAuth } from '@/hooks/use-auth';
import type { Conversation } from '@/lib/services/whatsapp/whatsapp-chat-service';

function ChatInboxContent() {
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const { profile } = useAuth();
  const institutionId = profile?.institution_id;

  const { stats } = useChatStats();
  const { dashboard: costDashboard } = useCostDashboard(institutionId);

  // Real-time: pass institution_id from active conversation (or null)
  useChatRealtime(
    activeConversation?.institution_id || null,
    activeConversation?.id || null
  );

  const handleSelectConversation = (conv: Conversation) => {
    setActiveConversation(conv);
  };

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="WhatsApp Chat">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Chat</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <div className="flex items-center gap-3">
              {/* Stats badges */}
              <div className="hidden md:flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  <span className="h-2 w-2 rounded-full bg-green-500 mr-1.5" />
                  {stats.total_open} Open
                </Badge>
                <Badge variant="outline" className="text-xs">
                  <span className="h-2 w-2 rounded-full bg-yellow-500 mr-1.5" />
                  {stats.total_waiting} Waiting
                </Badge>
                {stats.total_unread > 0 && (
                  <Badge variant="default" className="text-xs">
                    {stats.total_unread} Unread
                  </Badge>
                )}
                {/* Gap 15: Cost Widget */}
                <Badge variant="outline" className="text-xs gap-1">
                  <IndianRupee className="h-3 w-3" />
                  Today: {costDashboard.daily_average.toFixed(2)} | Month: {costDashboard.monthly_spend.toFixed(2)}
                </Badge>
              </div>

              <Button variant="outline" size="sm" asChild>
                <Link href="/admission/marketing/chat/settings">
                  <Settings className="h-4 w-4 mr-1" />
                  Settings
                </Link>
              </Button>
            </div>
          </div>

          {/* Three-panel Chat Layout */}
          <Card className="overflow-hidden" style={{ height: 'calc(100vh - 180px)' }}>
            <div className="flex h-full">
              {/* Left: Conversation List (320px) */}
              <div className="w-80 flex-shrink-0 h-full">
                <ConversationList
                  activeId={activeConversation?.id || null}
                  onSelect={handleSelectConversation}
                />
              </div>

              {/* Center: Chat Thread */}
              <div className="flex-1 h-full min-w-0">
                <ChatThread conversationId={activeConversation?.id || null} />
              </div>

              {/* Right: Lead Profile Sidebar (300px) */}
              {showSidebar && (
                <div className="w-[300px] flex-shrink-0 h-full hidden lg:block">
                  <LeadProfileSidebar conversationId={activeConversation?.id || null} />
                </div>
              )}
            </div>
          </Card>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function AdmissionChatPage() {
  return <ChatInboxContent />;
}
