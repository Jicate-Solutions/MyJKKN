'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Settings, IndianRupee, MessageCircle, Wifi, WifiOff,
  Megaphone, Users, RotateCcw, BarChart3,
} from 'lucide-react';
import Link from 'next/link';
import { ConversationList } from './_components/conversation-list';
import { ChatThread } from './_components/chat-thread';
import { LeadProfileSidebar } from './_components/lead-profile-sidebar';
import { BroadcastTab } from './_components/broadcast-tab';
import { SegmentsTab } from './_components/segments-tab';
import { ReengageTab } from './_components/reengage-tab';
import { AnalyticsTab } from './_components/analytics-tab';
import { useChatRealtime } from '@/hooks/admission/use-chat-realtime';
import { useChatStats } from '@/hooks/admission/use-chat-stats';
import { useCostDashboard } from '@/hooks/admission/use-communication-costs';
import { usePersonalWhatsAppStatus } from '@/hooks/admission/use-whatsapp-personal';
import { useAuth } from '@/hooks/use-auth';
import type { Conversation } from '@/lib/services/whatsapp/whatsapp-chat-service';

type Channel = 'inbox' | 'personal' | 'broadcast' | 'segments' | 'reengage' | 'analytics';

const TABS: { id: Channel; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'inbox', label: 'Inbox', icon: MessageCircle, color: 'bg-blue-600' },
  { id: 'broadcast', label: 'Broadcast', icon: Megaphone, color: 'bg-orange-600' },
  { id: 'segments', label: 'Segments', icon: Users, color: 'bg-purple-600' },
  { id: 'reengage', label: 'Re-engage', icon: RotateCcw, color: 'bg-teal-600' },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, color: 'bg-indigo-600' },
  { id: 'personal', label: 'Personal', icon: Wifi, color: '' },
];

function ChatInboxContent() {
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [showSidebar] = useState(true);
  const [channel, setChannel] = useState<Channel>('inbox');
  const { profile } = useAuth();
  const institutionId = profile?.institution_id;

  const departmentId = profile?.department_id;
  const { data: personalStatus } = usePersonalWhatsAppStatus(
    channel === 'personal' ? departmentId : undefined
  );

  const { stats } = useChatStats();
  const { dashboard: costDashboard } = useCostDashboard(institutionId);

  useChatRealtime(
    activeConversation?.institution_id || null,
    activeConversation?.id || null
  );

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="WhatsApp Command Center">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>WhatsApp</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <div className="flex items-center gap-3">
              {/* Inbox stats */}
              {channel === 'inbox' && (
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
                  <Badge variant="outline" className="text-xs gap-1">
                    <IndianRupee className="h-3 w-3" />
                    Today: {costDashboard.daily_average.toFixed(2)} | Month: {costDashboard.monthly_spend.toFixed(2)}
                  </Badge>
                </div>
              )}

              {/* Personal status */}
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

          {/* Tab Bar */}
          <div className="flex items-center rounded-lg border p-0.5 gap-0.5 overflow-x-auto">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = channel === tab.id;
              const isPersonal = tab.id === 'personal';
              return (
                <button
                  key={tab.id}
                  onClick={() => setChannel(tab.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? `${isPersonal ? '' : tab.color} text-white shadow-sm`
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                  style={isActive && isPersonal ? { backgroundColor: '#25D366' } : undefined}
                >
                  <Icon className="h-3 w-3 inline mr-1.5" />
                  {tab.label}
                  {tab.id === 'inbox' && stats.total_unread > 0 && (
                    <span className="ml-1.5 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                      {stats.total_unread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Content */}
          {channel === 'inbox' && (
            <Card className="overflow-hidden" style={{ height: 'calc(100vh - 220px)' }}>
              <div className="flex h-full">
                <div className="w-80 flex-shrink-0 h-full">
                  <ConversationList
                    activeId={activeConversation?.id || null}
                    onSelect={(conv: Conversation) => setActiveConversation(conv)}
                  />
                </div>
                <div className="flex-1 h-full min-w-0">
                  <ChatThread conversationId={activeConversation?.id || null} />
                </div>
                {showSidebar && (
                  <div className="w-[300px] flex-shrink-0 h-full hidden lg:block">
                    <LeadProfileSidebar conversationId={activeConversation?.id || null} />
                  </div>
                )}
              </div>
            </Card>
          )}

          {channel === 'broadcast' && (
            <Card className="overflow-hidden" style={{ height: 'calc(100vh - 220px)' }}>
              <div className="h-full overflow-y-auto p-6">
                <BroadcastTab institutionId={institutionId || ''} />
              </div>
            </Card>
          )}

          {channel === 'segments' && (
            <Card className="overflow-hidden" style={{ height: 'calc(100vh - 220px)' }}>
              <div className="h-full overflow-y-auto p-6">
                <SegmentsTab institutionId={institutionId || ''} />
              </div>
            </Card>
          )}

          {channel === 'reengage' && (
            <Card className="overflow-hidden" style={{ height: 'calc(100vh - 220px)' }}>
              <div className="h-full overflow-y-auto p-6">
                <ReengageTab institutionId={institutionId || ''} />
              </div>
            </Card>
          )}

          {channel === 'analytics' && (
            <Card className="overflow-hidden" style={{ height: 'calc(100vh - 220px)' }}>
              <div className="h-full overflow-y-auto p-6">
                <AnalyticsTab institutionId={institutionId || ''} />
              </div>
            </Card>
          )}

          {channel === 'personal' && (
            <Card className="overflow-hidden" style={{ height: 'calc(100vh - 220px)' }}>
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
