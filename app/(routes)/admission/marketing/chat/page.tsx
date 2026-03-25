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
import { Settings, BarChart3, IndianRupee, MessageCircle, Wifi, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { ConversationList } from './_components/conversation-list';
import { ChatThread } from './_components/chat-thread';
import { LeadProfileSidebar } from './_components/lead-profile-sidebar';
import { useChatRealtime } from '@/hooks/admission/use-chat-realtime';
import { useChatStats } from '@/hooks/admission/use-chat-stats';
import { useCostDashboard } from '@/hooks/admission/use-communication-costs';
import { usePersonalWhatsAppStatus } from '@/hooks/admission/use-whatsapp-personal';
import { useAuth } from '@/hooks/use-auth';
import type { Conversation } from '@/lib/services/whatsapp/whatsapp-chat-service';

function ChatInboxContent() {
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [channel, setChannel] = useState<'business' | 'personal'>('business');
  const { profile } = useAuth();
  const institutionId = profile?.institution_id;

  // Personal WhatsApp connection status (only fetched when personal tab is active)
  const departmentId = profile?.department_id;
  const { data: personalStatus } = usePersonalWhatsAppStatus(
    channel === 'personal' ? departmentId : undefined
  );

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
              {/* Channel Toggle */}
              <div className="flex items-center rounded-lg border p-0.5 gap-0.5">
                <button
                  onClick={() => setChannel('business')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    channel === 'business'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  <MessageCircle className="h-3 w-3 inline mr-1.5" />
                  Business
                </button>
                <button
                  onClick={() => setChannel('personal')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    channel === 'personal'
                      ? 'text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                  style={channel === 'personal' ? { backgroundColor: '#25D366' } : undefined}
                >
                  <MessageCircle className="h-3 w-3 inline mr-1.5" />
                  Personal
                </button>
              </div>

              {/* Stats badges (Business channel only) */}
              {channel === 'business' && (
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
              )}

              {/* Connection status badge (Personal channel only) */}
              {channel === 'personal' && (
                <div className="hidden md:flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`text-xs ${
                      personalStatus?.status === 'connected'
                        ? 'border-green-500 text-green-700'
                        : 'border-red-400 text-red-600'
                    }`}
                  >
                    {personalStatus?.status === 'connected' ? (
                      <><Wifi className="h-3 w-3 mr-1.5" /> Connected</>
                    ) : (
                      <><WifiOff className="h-3 w-3 mr-1.5" /> Not Connected</>
                    )}
                  </Badge>
                </div>
              )}

              <Button variant="outline" size="sm" asChild>
                <Link href="/admission/marketing/chat/settings">
                  <Settings className="h-4 w-4 mr-1" />
                  Settings
                </Link>
              </Button>
            </div>
          </div>

          {channel === 'business' ? (
            /* Three-panel Chat Layout (Business) */
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
          ) : (
            /* Personal WhatsApp View */
            <Card className="overflow-hidden" style={{ height: 'calc(100vh - 180px)' }}>
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <div
                  className="h-16 w-16 rounded-full flex items-center justify-center mb-4"
                  style={{ backgroundColor: personalStatus?.status === 'connected' ? '#25D366' : '#e5e7eb' }}
                >
                  {personalStatus?.status === 'connected' ? (
                    <Wifi className="h-8 w-8 text-white" />
                  ) : (
                    <WifiOff className="h-8 w-8 text-gray-400" />
                  )}
                </div>
                <h3 className="text-lg font-semibold mb-1">Personal WhatsApp</h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-md">
                  {personalStatus?.status === 'connected'
                    ? 'Your personal WhatsApp is connected. Messages sent via personal channel will appear in lead timelines.'
                    : 'Your personal WhatsApp is not connected. Go to Settings to scan the QR code and connect.'}
                </p>
                <p className="text-xs text-muted-foreground mb-6">
                  Message history and connection management are available in the Settings page.
                </p>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/admission/marketing/chat/settings">
                    <Settings className="h-4 w-4 mr-1" />
                    Manage Connection
                  </Link>
                </Button>
              </div>
            </Card>
          )}
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function AdmissionChatPage() {
  return <ChatInboxContent />;
}
