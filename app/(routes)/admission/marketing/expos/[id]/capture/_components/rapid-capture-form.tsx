'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, Loader2, Check, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { LeadService } from '@/lib/services/admission/lead-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ProgramChipPicker } from './program-chip-picker';
import type { CreateLeadInput } from '@/types/admission';

interface RapidCaptureFormProps {
  eventId: string;
  institutionId: string;
  capturedBy: string;
}

interface FormData {
  name: string;
  phone: string;
  parentName: string;
  parentPhone: string;
  selectedPrograms: string[];
  // Expandable fields
  email: string;
  district: string;
  twelfthMarks: string;
  currentSchool: string;
  zone: 'regular' | 'ai_zone';
  notes: string;
}

const INITIAL_FORM: FormData = {
  name: '',
  phone: '',
  parentName: '',
  parentPhone: '',
  selectedPrograms: [],
  email: '',
  district: '',
  twelfthMarks: '',
  currentSchool: '',
  zone: 'regular',
  notes: '',
};

export function RapidCaptureForm({ eventId, institutionId, capturedBy }: RapidCaptureFormProps) {
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [expanded, setExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<'idle' | 'success' | 'duplicate'>('idle');
  const [duplicateInfo, setDuplicateInfo] = useState<{ id: string; name: string } | null>(null);
  const [captureCount, setCaptureCount] = useState(0);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus name input on mount and after reset
  useEffect(() => {
    nameInputRef.current?.focus();
  }, [captureCount]);

  const updateField = useCallback(<K extends keyof FormData>(field: K, value: FormData[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const resetForm = useCallback(() => {
    // Keep zone selection (rush mode — remembers last zone)
    setForm((prev) => ({ ...INITIAL_FORM, zone: prev.zone }));
    setSubmitState('idle');
    setDuplicateInfo(null);
    setExpanded(false);
    setCaptureCount((c) => c + 1);
  }, []);

  const validate = (): string | null => {
    if (!form.name.trim()) return 'Learner name is required';
    if (!form.phone.trim()) return 'Phone number is required';
    // Basic Indian phone validation (10 digits, starts with 6-9)
    const cleanPhone = form.phone.trim().replace(/[\s\-()]/g, '');
    const phoneRegex = /^(\+91|0)?[6-9]\d{9}$/;
    if (!phoneRegex.test(cleanPhone)) return 'Enter a valid 10-digit Indian mobile number';
    if (!form.parentName.trim()) return 'Parent/Guardian name is required';
    if (!form.parentPhone.trim()) return 'Parent phone is required';
    const cleanParentPhone = form.parentPhone.trim().replace(/[\s\-()]/g, '');
    if (!phoneRegex.test(cleanParentPhone)) return 'Enter a valid parent phone number';
    if (form.selectedPrograms.length === 0) return 'Select at least one program';
    return null;
  };

  const handleSubmit = async () => {
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }

    setIsSubmitting(true);
    setDuplicateInfo(null);

    try {
      // Split name into first/last
      const nameParts = form.name.trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

      const leadInput: CreateLeadInput = {
        institution_id: institutionId,
        first_name: firstName,
        last_name: lastName,
        phone: form.phone.trim(),
        source: 'education_fair',
        expo_event_id: eventId,
        captured_by: capturedBy,
        referral_type: 'learner_ambassador',
        referred_by_id: capturedBy,
        parent_name: form.parentName.trim(),
        parent_phone: form.parentPhone.trim(),
        interested_programs: form.selectedPrograms,
        tags: form.zone === 'ai_zone' ? ['ai-zone'] : [],
        // Optional expanded fields
        ...(form.email && { email: form.email.trim() }),
        ...(form.district && { district: form.district.trim() }),
        ...(form.notes && { notes: form.notes.trim() }),
      };

      await LeadService.createLead(leadInput);

      setSubmitState('success');
      toast.success(`Lead #${captureCount + 1} saved!`, { duration: 2000 });

      // Auto-reset after 1.5 seconds for next capture
      setTimeout(resetForm, 1500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save lead';
      if (message.includes('Duplicate lead')) {
        setSubmitState('duplicate');
        // Try to extract existing lead info from the error
        setDuplicateInfo({ id: '', name: form.name });
        toast.error('This visitor was already captured');
      } else {
        toast.error(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      {/* Core Fields — 5 fields, large inputs for mobile */}
      <div className="space-y-3">
        {/* Learner Name */}
        <div>
          <Label htmlFor="name" className="text-sm font-medium">
            Learner Name / மாணவர் பெயர் <span className="text-destructive">*</span>
          </Label>
          <Input
            ref={nameInputRef}
            id="name"
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="Enter visitor's name"
            className="h-14 text-base mt-1"
            autoComplete="off"
            disabled={isSubmitting}
          />
        </div>

        {/* Phone */}
        <div>
          <Label htmlFor="phone" className="text-sm font-medium">
            Phone / தொலைபேசி <span className="text-destructive">*</span>
          </Label>
          <Input
            id="phone"
            type="tel"
            inputMode="numeric"
            value={form.phone}
            onChange={(e) => updateField('phone', e.target.value)}
            placeholder="98765 43210"
            className="h-14 text-base mt-1"
            autoComplete="off"
            disabled={isSubmitting}
          />
        </div>

        {/* Parent Name */}
        <div>
          <Label htmlFor="parentName" className="text-sm font-medium">
            Parent / Guardian Name / பெற்றோர் பெயர் <span className="text-destructive">*</span>
          </Label>
          <Input
            id="parentName"
            value={form.parentName}
            onChange={(e) => updateField('parentName', e.target.value)}
            placeholder="Parent or guardian name"
            className="h-14 text-base mt-1"
            autoComplete="off"
            disabled={isSubmitting}
          />
        </div>

        {/* Parent Phone */}
        <div>
          <Label htmlFor="parentPhone" className="text-sm font-medium">
            Parent Phone / பெற்றோர் தொலைபேசி <span className="text-destructive">*</span>
          </Label>
          <Input
            id="parentPhone"
            type="tel"
            inputMode="numeric"
            value={form.parentPhone}
            onChange={(e) => updateField('parentPhone', e.target.value)}
            placeholder="98765 43210"
            className="h-14 text-base mt-1"
            autoComplete="off"
            disabled={isSubmitting}
          />
        </div>

        {/* Programs */}
        <div>
          <Label className="text-sm font-medium">
            Programs Interested / ஆர்வமுள்ள படிப்புகள் <span className="text-destructive">*</span>
          </Label>
          <ProgramChipPicker
            institutionId={institutionId}
            selectedIds={form.selectedPrograms}
            onChange={(ids) => updateField('selectedPrograms', ids)}
            disabled={isSubmitting}
          />
        </div>
      </div>

      {/* Expandable "More details" section */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        disabled={isSubmitting}
      >
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        {expanded ? 'Less details' : 'More details (optional)'}
      </button>

      {expanded && (
        <div className="space-y-3 animate-in slide-in-from-top-2 duration-200">
          <div>
            <Label htmlFor="email" className="text-sm">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => updateField('email', e.target.value)}
              placeholder="visitor@email.com"
              className="h-12 text-base mt-1"
              disabled={isSubmitting}
            />
          </div>
          <div>
            <Label htmlFor="district" className="text-sm">District / City</Label>
            <Input
              id="district"
              value={form.district}
              onChange={(e) => updateField('district', e.target.value)}
              placeholder="e.g. Ramanathapuram, Pudukottai"
              className="h-12 text-base mt-1"
              disabled={isSubmitting}
            />
          </div>
          <div>
            <Label htmlFor="twelfthMarks" className="text-sm">12th Marks / Percentage</Label>
            <Input
              id="twelfthMarks"
              value={form.twelfthMarks}
              onChange={(e) => updateField('twelfthMarks', e.target.value)}
              placeholder="e.g. 85%"
              className="h-12 text-base mt-1"
              disabled={isSubmitting}
            />
          </div>
          <div>
            <Label htmlFor="currentSchool" className="text-sm">Current School / College</Label>
            <Input
              id="currentSchool"
              value={form.currentSchool}
              onChange={(e) => updateField('currentSchool', e.target.value)}
              placeholder="School or college name"
              className="h-12 text-base mt-1"
              disabled={isSubmitting}
            />
          </div>
          {/* Zone Toggle */}
          <div>
            <Label className="text-sm">Capture Zone</Label>
            <div className="flex gap-2 mt-1">
              <Badge
                variant={form.zone === 'regular' ? 'default' : 'outline'}
                className="cursor-pointer px-4 py-2 text-sm"
                onClick={() => updateField('zone', 'regular')}
              >
                Regular Stall
              </Badge>
              <Badge
                variant={form.zone === 'ai_zone' ? 'default' : 'outline'}
                className="cursor-pointer px-4 py-2 text-sm"
                onClick={() => updateField('zone', 'ai_zone')}
              >
                AI Experience Zone
              </Badge>
            </div>
          </div>
          <div>
            <Label htmlFor="notes" className="text-sm">Notes</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              placeholder="Any additional notes about the visitor..."
              className="text-base mt-1"
              rows={2}
              disabled={isSubmitting}
            />
          </div>
        </div>
      )}

      {/* Duplicate handling */}
      {submitState === 'duplicate' && (
        <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-yellow-800 dark:text-yellow-200">Already Captured</p>
            <p className="text-yellow-700 dark:text-yellow-300 mt-1">
              A lead with this phone number already exists in the CRM.
            </p>
            <div className="flex gap-2 mt-2">
              <Button size="sm" variant="outline" onClick={resetForm}>
                Skip &amp; Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky Submit Bar */}
      <div className="fixed bottom-16 left-0 right-0 px-4 pb-4 bg-gradient-to-t from-background via-background to-transparent pt-6">
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || submitState === 'success'}
          className={`w-full h-14 text-lg font-semibold transition-all ${
            submitState === 'success'
              ? 'bg-green-600 hover:bg-green-600 text-white'
              : ''
          }`}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Saving...
            </>
          ) : submitState === 'success' ? (
            <>
              <Check className="h-5 w-5 mr-2" />
              Saved! Next visitor...
            </>
          ) : (
            'Save & Next / சேமி & அடுத்தது'
          )}
        </Button>
      </div>
    </div>
  );
}
