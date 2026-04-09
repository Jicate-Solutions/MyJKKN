'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, StickyNote, UserX } from 'lucide-react';
import toast from 'react-hot-toast';

import { useAuth } from '@/hooks/use-auth';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useLeadWorkQueue } from '@/hooks/admission/use-lead-work-queue';
import { createClientSupabaseClient } from '@/lib/supabase/client';

import { PermissionGuard } from '@/components/auth/permission-guard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

import { LeadCard } from './_components/lead-card';
import { MobileActions } from './_components/mobile-actions';
import { TimelineSnippet } from './_components/timeline-snippet';
import { BottomNav } from './_components/bottom-nav';
import { LogCallDialog } from '@/components/admission/log-call-dialog';
import { SendPersonalMessageDialog } from '@/components/whatsapp/send-personal-message-dialog';

// =============================================================================
// Note Dialog (inline, simple)
// =============================================================================

interface NoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string | undefined;
  userId: string | undefined;
  onSaved: () => void;
}

function NoteDialog({ open, onOpenChange, leadId, userId, onSaved }: NoteDialogProps) {
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!noteText.trim() || !leadId) return;

    setSaving(true);
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase.from('admission_lead_activities').insert({
        lead_id: leadId,
        activity_type: 'note',
        subject: 'Note',
        description: noteText.trim(),
        created_by: userId ?? null,
      });

      if (error) {
        console.error('[admission/leads/work] Failed to save note:', error);
        toast.error('Failed to save note');
        return;
      }

      toast.success('Note saved');
      setNoteText('');
      onOpenChange(false);
      onSaved();
    } catch (err) {
      console.error('[admission/leads/work] Note save error:', err);
      toast.error('Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[340px] rounded-xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Note</DialogTitle>
          <DialogDescription>Write a quick note about this lead.</DialogDescription>
        </DialogHeader>

        <Textarea
          placeholder="Type your note..."
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          rows={4}
          className="resize-none"
          autoFocus
        />

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !noteText.trim()}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <StickyNote className="mr-2 h-4 w-4" />
                Save
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Loading Skeleton
// =============================================================================

function WorkPageSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col bg-gray-50 pb-20">
      {/* Header skeleton */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-6 rounded" />
          <Skeleton className="h-5 w-24" />
        </div>
        <Skeleton className="h-5 w-20 rounded-full" />
      </header>

      <div className="flex flex-1 flex-col gap-4 p-4">
        {/* Card skeleton */}
        <Skeleton className="h-48 w-full rounded-xl" />
        {/* Actions skeleton */}
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
        </div>
        {/* Timeline skeleton */}
        <Skeleton className="h-32 w-full rounded-xl" />
        {/* Nav skeleton */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-20 rounded-md" />
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-9 w-20 rounded-md" />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Empty State
// =============================================================================

function EmptyState() {
  return (
    <div className="flex min-h-dvh flex-col bg-gray-50 pb-20">
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b bg-white px-4 py-3 shadow-sm">
        <Link href="/admission/leads" className="rounded-md p-1 transition-colors hover:bg-gray-100">
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </Link>
        <h1 className="text-base font-semibold text-gray-900">My Leads</h1>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
          <UserX className="h-8 w-8 text-gray-400" />
        </div>
        <div>
          <p className="text-base font-medium text-gray-900">No leads assigned</p>
          <p className="mt-1 text-sm text-gray-500">Check with your admin to get leads assigned to you.</p>
        </div>
        <Link href="/admission/leads">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Leads
          </Button>
        </Link>
      </div>
    </div>
  );
}

// =============================================================================
// Main Page
// =============================================================================

type Tab = 'today' | 'leads' | 'call' | 'tasks';

function LeadWorkContent() {
  const { profile } = useAuth();
  const { selectedInstitutionId } = useUserInstitutionAccess();

  const {
    leads,
    currentLead,
    currentIndex,
    totalLeads,
    next,
    prev,
    overdueCount,
    hotCount,
    isLoading,
  } = useLeadWorkQueue(profile?.id, selectedInstitutionId);

  // ---- Dialog state ----
  const [showLogCall, setShowLogCall] = useState(false);
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('today');

  // A key that resets TimelineSnippet queries after adding a note
  const [timelineKey, setTimelineKey] = useState(0);

  const handleNoteSaved = useCallback(() => {
    setTimelineKey((k) => k + 1);
  }, []);

  // ---- Loading ----
  if (isLoading) {
    return <WorkPageSkeleton />;
  }

  // ---- Empty ----
  if (!currentLead || totalLeads === 0) {
    return <EmptyState />;
  }

  const isFirst = currentIndex === 0;
  const isLast = currentIndex === totalLeads - 1;

  return (
    <div className="flex min-h-dvh flex-col bg-gray-50 pb-20">
      {/* ── Header ────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/admission/leads"
            className="rounded-md p-1 transition-colors hover:bg-gray-100"
            aria-label="Back to leads list"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </Link>
          <h1 className="text-base font-semibold text-gray-900">My Leads</h1>
        </div>

        <Badge variant="secondary" className="text-xs font-medium">
          {totalLeads} pending
        </Badge>
      </header>

      {/* ── Scrollable body ───────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {/* Lead card */}
        <LeadCard lead={currentLead} />

        {/* Action buttons */}
        <MobileActions
          phone={currentLead.phone}
          onLogCall={() => setShowLogCall(true)}
          onWhatsApp={() => setShowWhatsApp(true)}
          onNote={() => setShowNote(true)}
        />

        {/* Timeline */}
        <TimelineSnippet key={`${currentLead.id}-${timelineKey}`} leadId={currentLead.id} />

        {/* ── Prev / Counter / Next ─────────────────────────────── */}
        <div className="flex items-center justify-between py-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isFirst}
            onClick={prev}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Button>

          <span className="text-sm font-medium text-gray-600">
            {currentIndex + 1}/{totalLeads}
          </span>

          <Button
            variant="outline"
            size="sm"
            disabled={isLast}
            onClick={next}
            className="gap-1"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Fixed bottom nav ──────────────────────────────────────── */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        pendingTasks={overdueCount}
        pendingLeads={hotCount}
      />

      {/* ── Dialogs ───────────────────────────────────────────────── */}
      <LogCallDialog
        open={showLogCall}
        onOpenChange={setShowLogCall}
        lead={currentLead}
        onSendWhatsApp={() => {
          setShowLogCall(false);
          setShowWhatsApp(true);
        }}
      />

      <SendPersonalMessageDialog
        departmentId={selectedInstitutionId ?? ''}
        open={showWhatsApp}
        onOpenChange={setShowWhatsApp}
        defaultPhone={currentLead.phone}
        leadId={currentLead.id}
        recipientName={currentLead.full_name ?? undefined}
      />

      <NoteDialog
        open={showNote}
        onOpenChange={setShowNote}
        leadId={currentLead.id}
        userId={profile?.id}
        onSaved={handleNoteSaved}
      />
    </div>
  );
}

export default function LeadWorkPage() {
  return (
    <PermissionGuard module="admission" action="leads.view">
      <LeadWorkContent />
    </PermissionGuard>
  );
}
