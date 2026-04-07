'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Phone,
  Mail,
  Tag,
  ExternalLink,
  X,
  ArrowLeft,
  User,
  UserCheck,
  CheckCircle,
  RotateCcw,
  ShieldAlert,
  Calendar,
  Clock,
  Layers,
  Star,
  Radio,
  Plus,
  UserPlus,
} from 'lucide-react';
import { useConversation } from '@/hooks/admission/use-conversation';
import { useChatMutations } from '@/hooks/admission/use-chat-mutations';
import type { Conversation } from '@/lib/services/whatsapp/whatsapp-chat-service';

interface LeadProfileSidebarProps {
  conversationId: string | null;
  onClose: () => void;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function getInitials(name: string | null | undefined, phone: string | null | undefined): string {
  if (name && name.trim()) {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name[0].toUpperCase();
  }
  return (phone ?? '?')[0].toUpperCase();
}

function getAvatarBg(seed: string): string {
  const colors = [
    'bg-teal-600',
    'bg-indigo-600',
    'bg-violet-600',
    'bg-rose-600',
    'bg-amber-600',
    'bg-cyan-600',
    'bg-emerald-600',
    'bg-orange-600',
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function getStagePill(stage: string): string {
  switch (stage?.toLowerCase()) {
    case 'new':       return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'contacted': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'qualified': return 'bg-green-100 text-green-800 border-green-200';
    case 'applied':   return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'enrolled':  return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'lost':      return 'bg-red-100 text-red-800 border-red-200';
    default:          return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

function getStatusBadge(status: string): { label: string; cls: string } {
  switch (status?.toLowerCase()) {
    case 'open':     return { label: 'Open',     cls: 'bg-green-100 text-green-800 border-green-200' };
    case 'resolved': return { label: 'Resolved', cls: 'bg-gray-100 text-gray-600 border-gray-200' };
    case 'pending':  return { label: 'Pending',  cls: 'bg-amber-100 text-amber-800 border-amber-200' };
    default:         return { label: status,     cls: 'bg-gray-100 text-gray-600 border-gray-200' };
  }
}

// ─── sub-components ──────────────────────────────────────────────────────────

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
      <Icon className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-gray-400 leading-none mb-0.5">{label}</p>
        <div className="text-[13px] text-gray-800 break-words">{value}</div>
      </div>
    </div>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-100 rounded-lg overflow-hidden mx-3 my-2">
      {children}
    </div>
  );
}

function ActionRow({
  icon: Icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        'w-full flex items-center gap-3 px-4 py-3.5',
        'border-b border-gray-100 last:border-0',
        'text-[13px] font-medium text-left',
        'transition-colors duration-150',
        danger
          ? 'text-red-500 hover:bg-red-50 active:bg-red-100'
          : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      <Icon
        className={[
          'h-4 w-4 flex-shrink-0',
          danger ? 'text-red-400' : 'text-gray-400',
        ].join(' ')}
      />
      {label}
    </button>
  );
}

// ─── empty state ─────────────────────────────────────────────────────────────

function EmptyState({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col h-full bg-[#f0f2f5]">
      {/* header */}
      <div className="bg-[#0b6d41] px-4 py-3 flex items-center gap-3">
        <button
          onClick={onClose}
          className="text-white/80 hover:text-white transition-colors md:hidden"
          aria-label="Close"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <button
          onClick={onClose}
          className="text-white/80 hover:text-white transition-colors hidden md:block"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
        <span className="text-white text-[15px] font-medium">Contact Info</span>
      </div>
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm px-6 text-center">
        Select a conversation to view contact info
      </div>
    </div>
  );
}

// ─── predefined tags ─────────────────────────────────────────────────────────

const PREDEFINED_TAGS = [
  'hot-lead', 'follow-up', 'docs-pending', 'callback-requested',
  'enrolled', 'lost', 'scholarship', 'hostel-inquiry', 'parent-contact',
  'neet-qualified', 'walk-in', 'expo-lead', 'referred',
];

// ─── main component ───────────────────────────────────────────────────────────

export function LeadProfileSidebar({ conversationId, onClose }: LeadProfileSidebarProps) {
  const { conversation, isLoading } = useConversation(conversationId);
  const { resolve, reopen, assign, isResolving, isReopening } = useChatMutations();
  const queryClient = useQueryClient();

  const [showTagInput, setShowTagInput] = useState(false);
  const [tagSearch, setTagSearch] = useState('');

  const { data: staffList } = useQuery({
    queryKey: ['institution-staff', conversation?.institution_id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/users?institution_id=${conversation?.institution_id}&role=admission`);
      if (!res.ok) return [];
      const json = await res.json();
      return json.data || json || [];
    },
    enabled: !!conversation?.institution_id,
  });

  if (!conversationId || (!conversation && !isLoading)) {
    return <EmptyState onClose={onClose} />;
  }

  if (isLoading || !conversation) {
    return (
      <div className="flex flex-col h-full bg-[#f0f2f5]">
        {/* header skeleton */}
        <div className="bg-[#0b6d41] px-4 py-3 flex items-center gap-3">
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors md:hidden"
            aria-label="Close"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors hidden md:block"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <span className="text-white text-[15px] font-medium">Contact Info</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-20 w-20 rounded-full bg-gray-200 animate-pulse" />
            <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  const lead = conversation.lead;
  const displayName = conversation.contact_name || lead?.full_name || 'Unknown Contact';
  const phone = conversation.contact_phone || lead?.phone || '';
  const avatarSeed = displayName + phone;
  const statusInfo = getStatusBadge(conversation.status);

  const currentTags: string[] = conversation.tags || [];

  const filteredTags = PREDEFINED_TAGS
    .filter(t => !currentTags.includes(t))
    .filter(t => !tagSearch || t.includes(tagSearch.toLowerCase()));

  const addTag = async (tag: string) => {
    const newTags = [...currentTags, tag];
    await fetch(`/api/admission/chat/conversations/${conversation.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: newTags }),
    });
    queryClient.invalidateQueries({ queryKey: ['wa-conversation-detail'] });
    setTagSearch('');
  };

  const removeTag = async (tag: string) => {
    const newTags = currentTags.filter(t => t !== tag);
    await fetch(`/api/admission/chat/conversations/${conversation.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: newTags }),
    });
    queryClient.invalidateQueries({ queryKey: ['wa-conversation-detail'] });
  };

  return (
    /* Outer wrapper — parent decides width; we fill it */
    <div className="flex flex-col h-full bg-[#f0f2f5]">

      {/* ── 1. Header bar ─────────────────────────────────────────────── */}
      <div className="bg-[#0b6d41] px-4 py-3 flex items-center gap-3 flex-shrink-0">
        {/* back arrow on mobile */}
        <button
          onClick={onClose}
          className="text-white/80 hover:text-white transition-colors md:hidden"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        {/* X on desktop */}
        <button
          onClick={onClose}
          className="text-white/80 hover:text-white transition-colors hidden md:block"
          aria-label="Close panel"
        >
          <X className="h-5 w-5" />
        </button>
        <span className="text-white text-[15px] font-medium tracking-wide">Contact Info</span>
      </div>

      {/* ── 2. Scrollable body ────────────────────────────────────────── */}
      <ScrollArea className="flex-1">
        <div className="pb-6">

          {/* ── 2a. Avatar section ──────────────────────────────────── */}
          <div className="bg-white border-b border-gray-100 py-6 flex flex-col items-center gap-1">
            {/* avatar */}
            <div
              className={[
                'h-24 w-24 rounded-full flex items-center justify-center',
                'text-3xl font-semibold text-white shadow-sm',
                getAvatarBg(avatarSeed),
              ].join(' ')}
              aria-hidden="true"
            >
              {getInitials(displayName, phone)}
            </div>

            {/* name */}
            <h2 className="mt-3 text-xl font-bold text-gray-900 text-center px-4 leading-tight">
              {displayName}
            </h2>

            {/* phone */}
            {phone && (
              <p className="text-[13px] text-gray-500 flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                {phone}
              </p>
            )}

            {/* status badge */}
            <span
              className={[
                'mt-1 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full',
                'text-[11px] font-semibold border',
                statusInfo.cls,
              ].join(' ')}
            >
              <Radio className="h-2.5 w-2.5" />
              {statusInfo.label}
            </span>
          </div>

          {/* ── 2b. Info section ────────────────────────────────────── */}
          <SectionCard>
            <div className="px-4 pt-2 pb-1">
              {lead?.email && (
                <InfoRow icon={Mail} label="Email" value={
                  <a
                    href={`mailto:${lead.email}`}
                    className="text-[#0b6d41] underline-offset-2 hover:underline"
                  >
                    {lead.email}
                  </a>
                } />
              )}

              {lead?.stage && (
                <InfoRow icon={Layers} label="Funnel Stage" value={
                  <span
                    className={[
                      'inline-flex items-center px-2 py-0.5 rounded-full text-[11px]',
                      'font-semibold border',
                      getStagePill(lead.stage),
                    ].join(' ')}
                  >
                    {lead.stage.charAt(0).toUpperCase() + lead.stage.slice(1)}
                  </span>
                } />
              )}

              {lead?.score != null && (
                <InfoRow icon={Star} label="Lead Score" value={
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#0b6d41] rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, lead.score)}%` }}
                      />
                    </div>
                    <span className="text-[12px] font-semibold text-gray-700 w-6 text-right">
                      {lead.score}
                    </span>
                  </div>
                } />
              )}

              {lead?.source && (
                <InfoRow icon={Tag} label="Source" value={lead.source} />
              )}

              {lead?.interested_programs && lead.interested_programs.length > 0 && (
                <InfoRow icon={Layers} label="Interested Programs" value={
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {lead.interested_programs.map((prog: string) => (
                      <span
                        key={prog}
                        className="inline-flex items-center px-2 py-0.5 rounded-full
                                   text-[11px] font-medium bg-[#0b6d41]/10 text-[#0b6d41]
                                   border border-[#0b6d41]/20"
                      >
                        {prog}
                      </span>
                    ))}
                  </div>
                } />
              )}

              <InfoRow icon={Calendar} label="Created" value={
                new Date(conversation.created_at).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })
              } />

              {conversation.last_inbound_at && (
                <InfoRow icon={Clock} label="Last Contacted" value={
                  new Date(conversation.last_inbound_at).toLocaleString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                } />
              )}

              {conversation.assigned_profile && (
                <InfoRow icon={UserCheck} label="Assigned To" value={
                  conversation.assigned_profile.full_name
                } />
              )}
            </div>
          </SectionCard>

          {/* ── 2c. Tags section ────────────────────────────────────── */}
          <SectionCard>
            <div className="px-4 py-3">
              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <Tag className="h-3 w-3" /> Tags
              </p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {currentTags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
                  >
                    {tag}
                    <button
                      onClick={() => removeTag(tag)}
                      className="hover:text-red-500"
                      aria-label={`Remove tag ${tag}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <Popover open={showTagInput} onOpenChange={setShowTagInput}>
                <PopoverTrigger asChild>
                  <button className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 border border-dashed rounded px-2 py-1">
                    <Plus className="h-3 w-3" /> Add tag
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start">
                  <Input
                    placeholder="Search or create tag..."
                    value={tagSearch}
                    onChange={e => setTagSearch(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && tagSearch.trim()) {
                        addTag(tagSearch.trim().toLowerCase().replace(/\s+/g, '-'));
                        setShowTagInput(false);
                      }
                    }}
                    className="mb-2 h-8 text-sm"
                    autoFocus
                  />
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {filteredTags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => { addTag(tag); setShowTagInput(false); }}
                        className="w-full text-left px-2 py-1 text-xs rounded hover:bg-muted"
                      >
                        {tag}
                      </button>
                    ))}
                    {tagSearch && !PREDEFINED_TAGS.includes(tagSearch.toLowerCase().replace(/\s+/g, '-')) && (
                      <button
                        onClick={() => { addTag(tagSearch.trim().toLowerCase().replace(/\s+/g, '-')); setShowTagInput(false); }}
                        className="w-full text-left px-2 py-1 text-xs rounded hover:bg-muted text-green-600"
                      >
                        + Create &quot;{tagSearch.trim().toLowerCase().replace(/\s+/g, '-')}&quot;
                      </button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </SectionCard>

          {/* ── 2d. Action buttons ──────────────────────────────────── */}
          <SectionCard>
            {lead && (
              <a
                href={`/admission/leads/${lead.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ActionRow icon={ExternalLink} label="View Lead Profile" />
              </a>
            )}

            {/* Assign to Counselor — functional Select */}
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <UserPlus className="h-3 w-3" /> Assigned Counselor
              </p>
              <Select
                value={conversation?.assigned_to || ''}
                onValueChange={(val) => assign.mutate({ conversationId: conversation!.id, counselorId: val })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Unassigned — click to assign" />
                </SelectTrigger>
                <SelectContent>
                  {staffList?.map((staff: { id: string; full_name: string }) => (
                    <SelectItem key={staff.id} value={staff.id}>{staff.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {conversation.status !== 'resolved' ? (
              <ActionRow
                icon={CheckCircle}
                label={isResolving ? 'Resolving…' : 'Resolve Conversation'}
                onClick={() => resolve.mutate(conversation.id)}
                disabled={isResolving}
              />
            ) : (
              <ActionRow
                icon={RotateCcw}
                label={isReopening ? 'Reopening…' : 'Reopen Conversation'}
                onClick={() => reopen.mutate(conversation.id)}
                disabled={isReopening}
              />
            )}

            <ActionRow icon={ShieldAlert} label="Block / Report" danger />
          </SectionCard>

        </div>
      </ScrollArea>
    </div>
  );
}
