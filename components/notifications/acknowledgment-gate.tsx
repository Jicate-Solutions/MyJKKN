'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  Bell,
  ChevronRight,
  Shield
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RichTextDisplay } from '@/components/ui/rich-text-editor';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { UnacknowledgedNotification, VerificationQuestion } from '@/types/notifications';

/**
 * AcknowledgmentGate — The core component that replaces Google Chat's voluntary 🙏
 *
 * This renders a full-screen blocking overlay when there are unacknowledged
 * mandatory notifications. The user CANNOT interact with the app until they
 * read and acknowledge every pending notification.
 *
 * Design principle: Cookie-consent pattern — you must deal with it to proceed.
 */
export function AcknowledgmentGate({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [acknowledging, setAcknowledging] = useState(false);

  // Fetch unacknowledged notifications
  const { data, isLoading } = useQuery({
    queryKey: ['unacknowledged-notifications'],
    queryFn: async () => {
      const res = await fetch('/api/notifications/acknowledge');
      if (!res.ok) return { unacknowledged: [], count: 0, has_pending: false };
      return res.json();
    },
    refetchInterval: 60000, // Check every minute for new mandatory notifications
    refetchOnWindowFocus: true
  });

  const notifications: UnacknowledgedNotification[] =
    data?.unacknowledged || [];
  const hasPending = notifications.length > 0;

  // Acknowledge mutation
  const acknowledgeMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const res = await fetch('/api/notifications/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_id: notificationId })
      });
      if (!res.ok) throw new Error('Failed to acknowledge');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['unacknowledged-notifications']
      });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  const handleAcknowledge = useCallback(async () => {
    const current = notifications[currentIndex];
    if (!current) return;

    setAcknowledging(true);
    try {
      await acknowledgeMutation.mutateAsync(current.notification_id);

      if (currentIndex < notifications.length - 1) {
        // Move to next notification
        setCurrentIndex((prev) => prev + 1);
        toast.success(
          `Acknowledged (${currentIndex + 1}/${notifications.length})`
        );
      } else {
        // All done
        toast.success('All notifications acknowledged!', {
          icon: '✅',
          duration: 3000
        });
        setCurrentIndex(0);
      }
    } catch {
      toast.error('Failed to acknowledge. Please try again.');
    } finally {
      setAcknowledging(false);
    }
  }, [notifications, currentIndex, acknowledgeMutation]);

  // Don't block while loading
  if (isLoading) return <>{children}</>;

  // No pending acknowledgments — render app normally
  if (!hasPending) return <>{children}</>;

  const current = notifications[currentIndex];
  if (!current) return <>{children}</>;

  const deadlineDate = new Date(current.deadline_at);
  const isOverdue = current.is_overdue;
  const timeLeft = isOverdue
    ? 'OVERDUE'
    : getTimeRemaining(deadlineDate);

  return (
    <AcknowledgmentModal
      current={current}
      isOverdue={isOverdue}
      timeLeft={timeLeft}
      deadlineDate={deadlineDate}
      notifications={notifications}
      currentIndex={currentIndex}
      acknowledging={acknowledging}
      onAcknowledge={handleAcknowledge}
    >
      {children}
    </AcknowledgmentModal>
  );
}

// ─── Calculate minimum read time based on word count ────
function calculateReadTimeSeconds(body: string): number {
  // Strip HTML tags for word count
  const plainText = (body || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const wordCount = plainText.split(' ').filter(Boolean).length;

  // ~150 words/min for non-native English readers (JKKN context)
  // Minimum 5s, maximum 30s — we're enforcing reading, not punishment
  const readTimeSeconds = Math.ceil((wordCount / 150) * 60);
  return Math.max(5, Math.min(30, readTimeSeconds));
}

// ─── The actual modal with read-time + scroll enforcement ───
function AcknowledgmentModal({
  current,
  isOverdue,
  timeLeft,
  deadlineDate,
  notifications,
  currentIndex,
  acknowledging,
  onAcknowledge,
  children
}: {
  current: UnacknowledgedNotification;
  isOverdue: boolean;
  timeLeft: string;
  deadlineDate: Date;
  notifications: UnacknowledgedNotification[];
  currentIndex: number;
  acknowledging: boolean;
  onAcknowledge: () => void;
  children: React.ReactNode;
}) {
  const [readTimeLeft, setReadTimeLeft] = useState<number>(-1);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [timerStarted, setTimerStarted] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answerStatus, setAnswerStatus] = useState<'pending' | 'correct' | 'wrong'>('pending');
  const contentRef = useRef<HTMLDivElement>(null);
  const requiredReadTime = calculateReadTimeSeconds(current.body);
  const verificationQ: VerificationQuestion | undefined = current.metadata?.verification_question;

  // Reset state when notification changes
  useEffect(() => {
    setReadTimeLeft(-1);
    setHasScrolledToBottom(false);
    setTimerStarted(false);
    setSelectedAnswer(null);
    setAnswerStatus('pending');
  }, [current.notification_id]);

  // Check if content needs scrolling
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    // If content fits without scrolling, mark as scrolled and start timer immediately
    const needsScroll = el.scrollHeight > el.clientHeight + 20;
    if (!needsScroll) {
      setHasScrolledToBottom(true);
      if (!timerStarted) {
        setTimerStarted(true);
        setReadTimeLeft(requiredReadTime);
      }
    }
  }, [current.notification_id, requiredReadTime, timerStarted]);

  // Track scroll position — start timer only when scrolled to bottom
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const handleScroll = () => {
      const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      if (isAtBottom && !hasScrolledToBottom) {
        setHasScrolledToBottom(true);
        if (!timerStarted) {
          setTimerStarted(true);
          setReadTimeLeft(requiredReadTime);
        }
      }
    };

    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, [hasScrolledToBottom, timerStarted, requiredReadTime]);

  // Countdown timer
  useEffect(() => {
    if (!timerStarted || readTimeLeft <= 0) return;

    const interval = setInterval(() => {
      setReadTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timerStarted, readTimeLeft]);

  // Must pass: timer done + scrolled + quiz correct (if quiz exists)
  const timerDone = readTimeLeft === 0;
  const quizPassed = verificationQ ? answerStatus === 'correct' : true;
  const canAcknowledge = timerDone && hasScrolledToBottom && quizPassed;
  const needsScroll = contentRef.current
    ? contentRef.current.scrollHeight > contentRef.current.clientHeight + 20
    : false;

  // Label for disabled state — shows why button is locked
  const disabledLabel = !canAcknowledge
    ? !hasScrolledToBottom && needsScroll
      ? 'Scroll down to read all content'
      : !timerDone
        ? `Read carefully (${readTimeLeft}s)`
        : verificationQ && !quizPassed
          ? 'Answer the verification question'
          : ''
    : '';

  // Check answer handler
  const handleAnswerSelect = (index: number) => {
    if (answerStatus === 'correct') return; // Already answered correctly
    setSelectedAnswer(index);
    if (verificationQ && index === verificationQ.correct_index) {
      setAnswerStatus('correct');
      toast.success('Correct! You may now acknowledge.', { duration: 2000 });
    } else {
      setAnswerStatus('wrong');
      toast.error('Incorrect — please re-read the notification and try again.', { duration: 3000 });
      // Reset after 2 seconds so they can try again
      setTimeout(() => {
        setSelectedAnswer(null);
        setAnswerStatus('pending');
      }, 2000);
    }
  };

  return (
    <>
      {/* Blocked app content (blurred) */}
      <div className="pointer-events-none select-none blur-sm opacity-30">
        {children}
      </div>

      {/* Full-screen acknowledgment overlay */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <div className="w-full max-w-lg bg-background rounded-2xl shadow-2xl border overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div
            className={cn(
              'px-6 py-4 flex items-center gap-3',
              isOverdue
                ? 'bg-destructive text-destructive-foreground'
                : current.priority === 'urgent'
                  ? 'bg-orange-500 text-white'
                  : 'bg-primary text-primary-foreground'
            )}
          >
            <Shield className="h-6 w-6 shrink-0" />
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold truncate">
                Mandatory Acknowledgment
              </h2>
              <p className="text-sm opacity-90">
                {notifications.length === 1
                  ? '1 notification requires your acknowledgment'
                  : `${currentIndex + 1} of ${notifications.length} notifications`}
              </p>
            </div>
            {isOverdue && (
              <Badge variant="outline" className="bg-white/20 text-white border-white/30 shrink-0">
                OVERDUE
              </Badge>
            )}
          </div>

          {/* Notification content — scroll tracked */}
          <div ref={contentRef} className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Title and metadata */}
            <div>
              <h3 className="text-xl font-semibold">{current.title}</h3>
              <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Bell className="h-3.5 w-3.5" />
                  {current.category}
                </span>
                <span>·</span>
                <span>From: {current.created_by_name}</span>
                <span>·</span>
                <Badge
                  variant={
                    current.priority === 'urgent'
                      ? 'destructive'
                      : current.priority === 'high'
                        ? 'default'
                        : 'secondary'
                  }
                  className="text-xs"
                >
                  {current.priority}
                </Badge>
              </div>
            </div>

            {/* Body */}
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <RichTextDisplay content={current.body} />
            </div>

            {/* Attachments */}
            {current.metadata?.attachments && current.metadata.attachments.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Attachments:</p>
                <div className="space-y-1.5">
                  {current.metadata.attachments.map((att: any, idx: number) => (
                    <a
                      key={idx}
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/30 hover:bg-muted/60 transition-colors text-sm"
                    >
                      <span className="truncate flex-1">{att.name}</span>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {att.type?.split('/').pop()?.toUpperCase() || 'FILE'}
                      </Badge>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Deadline indicator */}
            <div
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
                isOverdue
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {isOverdue ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <Clock className="h-4 w-4" />
              )}
              <span>
                {isOverdue
                  ? `Acknowledgment was due ${getTimeAgo(deadlineDate)}. Your supervisor will be notified.`
                  : `Deadline: ${timeLeft}`}
              </span>
            </div>
          </div>

          {/* Verification question — appears after timer completes */}
          {verificationQ && timerDone && hasScrolledToBottom && (
            <div className="px-6 pb-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className={cn(
                'p-4 rounded-xl border-2',
                answerStatus === 'correct' ? 'border-green-300 bg-green-50 dark:bg-green-950/20' :
                answerStatus === 'wrong' ? 'border-red-300 bg-red-50 dark:bg-red-950/20' :
                'border-primary/20 bg-primary/5'
              )}>
                <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Verification: {verificationQ.question}
                </p>
                <div className="space-y-2">
                  {verificationQ.options.map((option, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleAnswerSelect(idx)}
                      disabled={answerStatus === 'correct'}
                      className={cn(
                        'w-full text-left px-4 py-2.5 rounded-lg border text-sm font-medium transition-all',
                        selectedAnswer === idx && answerStatus === 'correct'
                          ? 'bg-green-100 border-green-400 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                          : selectedAnswer === idx && answerStatus === 'wrong'
                            ? 'bg-red-100 border-red-400 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                            : 'bg-background border-border hover:bg-muted/50 hover:border-primary/30',
                        answerStatus === 'correct' && idx !== verificationQ.correct_index && 'opacity-50'
                      )}
                    >
                      <span className="font-bold mr-2">{String.fromCharCode(65 + idx)}.</span>
                      {option}
                    </button>
                  ))}
                </div>
                {answerStatus === 'wrong' && (
                  <p className="text-xs text-red-600 mt-2 font-medium">
                    Incorrect. Please re-read the notification and try again.
                  </p>
                )}
                {answerStatus === 'correct' && (
                  <p className="text-xs text-green-600 mt-2 font-medium flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Correct! You may now acknowledge.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Action area — gated by read time + scroll + quiz */}
          <div className="px-6 py-4 bg-muted/30 border-t">
            {disabledLabel ? (
              <Button
                disabled
                className="w-full h-12 text-base font-semibold gap-2 opacity-60"
              >
                {!hasScrolledToBottom && needsScroll ? (
                  <>
                    <span className="text-lg">↓</span>
                    Scroll down to read all content
                  </>
                ) : (
                  <>
                    <Clock className="h-5 w-5 animate-pulse" />
                    Read carefully ({readTimeLeft}s)
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={onAcknowledge}
                disabled={acknowledging || !canAcknowledge}
                className={cn(
                  'w-full h-12 text-base font-semibold gap-2 animate-in fade-in duration-300',
                  isOverdue && 'bg-destructive hover:bg-destructive/90'
                )}
              >
                {acknowledging ? (
                  'Acknowledging...'
                ) : (
                  <>
                    <span className="text-lg">🙏</span>
                    Vanakkam — I Acknowledge
                    {notifications.length > 1 && currentIndex < notifications.length - 1 && (
                      <ChevronRight className="h-4 w-4 ml-1" />
                    )}
                  </>
                )}
              </Button>
            )}
            <p className="text-xs text-center text-muted-foreground mt-2">
              {!hasScrolledToBottom && needsScroll
                ? 'Please scroll down to read the full notification.'
                : !timerDone
                  ? 'Please read the notification carefully.'
                  : verificationQ && !quizPassed
                    ? 'Answer the verification question to proceed.'
                    : 'By acknowledging, you confirm that you have read and understood this notification. This action is permanently recorded.'}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function getTimeRemaining(deadline: Date): string {
  const now = new Date();
  const diff = deadline.getTime() - now.getTime();
  if (diff <= 0) return 'OVERDUE';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h remaining`;
  }
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
  if (hours > 0) return `${hours}h ${minutes}m ago`;
  return `${minutes}m ago`;
}
