'use client';

// INTEGRATION: This modal should be rendered in the root layout or a global provider.
// The parent component should:
// 1. Call usePulseLock() to check for pending pulses
// 2. If hasPending, render <PulseLockModal {...pulse} onComplete={refetch} />
// 3. The modal blocks all interaction until the student responds
//
// Example integration in app/(routes)/layout.tsx or a PulseProvider:
//   const { hasPending, pulse, refetch } = usePulseLock();
//   if (hasPending && pulse) return <PulseLockModal {...pulse} onComplete={refetch} />;

import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { useRespondToPulse } from '@/hooks/learners/use-learner-pulse';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface PulseLockModalProps {
  notification_id: string;
  question: string;
  response_type: 'yes_no' | 'free_text';
  pulse_type: string;
  onComplete: () => void;
}

const MAX_FREE_TEXT_LENGTH = 500;

export function PulseLockModal({
  notification_id,
  question,
  response_type,
  pulse_type,
  onComplete,
}: PulseLockModalProps) {
  const [freeTextValue, setFreeTextValue] = useState('');
  const respondMutation = useRespondToPulse();

  // Block escape key from dismissing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Block browser back/navigation
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const handleResponse = useCallback(
    (value: string) => {
      respondMutation.mutate(
        {
          notification_id,
          response_value: value,
        },
        {
          onSuccess: () => {
            onComplete();
          },
        }
      );
    },
    [notification_id, respondMutation, onComplete]
  );

  const handleFreeTextSubmit = useCallback(() => {
    const trimmed = freeTextValue.trim();
    if (!trimmed) return;
    handleResponse(trimmed);
  }, [freeTextValue, handleResponse]);

  const isSubmitting = respondMutation.isPending;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-white"
      role="dialog"
      aria-modal="true"
      aria-label="Belonging pulse check"
    >
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-green-50/50 via-white to-green-50/30" />

      <div className="relative z-10 mx-auto w-full max-w-lg px-4 sm:px-6">
        {/* JKKN Logo placeholder */}
        <div className="mb-8 text-center">
          <div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: '#0b6d41' }}
          >
            <span className="text-2xl font-bold text-white">J</span>
          </div>
        </div>

        {/* Heading */}
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">
            Before you continue, we&apos;d love to hear from you
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            This takes just a moment
          </p>
        </div>

        {/* Question card */}
        <Card className="border-0 shadow-lg">
          <CardContent className="p-6 sm:p-8">
            {/* Question text */}
            <p className="mb-6 text-center text-base font-medium text-gray-800 sm:text-lg">
              {question}
            </p>

            {/* Response area */}
            {response_type === 'yes_no' ? (
              <YesNoButtons
                onResponse={handleResponse}
                isSubmitting={isSubmitting}
              />
            ) : (
              <FreeTextInput
                value={freeTextValue}
                onChange={setFreeTextValue}
                onSubmit={handleFreeTextSubmit}
                isSubmitting={isSubmitting}
                maxLength={MAX_FREE_TEXT_LENGTH}
              />
            )}
          </CardContent>
        </Card>

        {/* Footer text */}
        <p className="mt-6 text-center text-xs text-gray-400">
          Your response helps us support you better
        </p>
      </div>
    </div>
  );
}

// ============================================
// YES / NO BUTTONS
// ============================================

function YesNoButtons({
  onResponse,
  isSubmitting,
}: {
  onResponse: (value: string) => void;
  isSubmitting: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
      <Button
        onClick={() => onResponse('yes')}
        disabled={isSubmitting}
        className="flex-1 gap-2 py-6 text-base font-medium text-white"
        style={{ backgroundColor: '#0b6d41' }}
      >
        {isSubmitting ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <CheckCircle2 className="h-5 w-5" />
        )}
        Yes
      </Button>
      <Button
        onClick={() => onResponse('no')}
        disabled={isSubmitting}
        variant="outline"
        className="flex-1 gap-2 border-gray-300 py-6 text-base font-medium text-gray-700 hover:bg-gray-50"
      >
        {isSubmitting ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <XCircle className="h-5 w-5" />
        )}
        No
      </Button>
    </div>
  );
}

// ============================================
// FREE TEXT INPUT
// ============================================

function FreeTextInput({
  value,
  onChange,
  onSubmit,
  isSubmitting,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  maxLength: number;
}) {
  return (
    <div className="space-y-3">
      <Textarea
        value={value}
        onChange={(e) => {
          if (e.target.value.length <= maxLength) {
            onChange(e.target.value);
          }
        }}
        placeholder="Share your thoughts..."
        className="min-h-[120px] resize-none text-base"
        disabled={isSubmitting}
        autoFocus
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">
          {value.length}/{maxLength}
        </span>
        <Button
          onClick={onSubmit}
          disabled={isSubmitting || !value.trim()}
          className="gap-2 text-white"
          style={{ backgroundColor: '#0b6d41' }}
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Submit
        </Button>
      </div>
    </div>
  );
}
