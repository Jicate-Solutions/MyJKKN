// lib/services/admission/form-submission-service.ts
// Handles public form submissions → lead creation pipeline.
// Refactored 2026-05-12: now flows through capture_admission_lead RPC so
// campaign attribution + multi-source dedup are atomic.

import type {
  AdmissionForm,
  AdmissionFormField,
  AdmissionFormSection,
  CreateLeadInput,
  LeadSource,
} from '@/types/admission';

interface SubmissionInput {
  formData: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrerUrl?: string;
  deviceType?: string;
  /** Resolved campaign_link UUID (server-validated) — never raw token. */
  campaignLinkId?: string;
  /** Anonymous browser session ID forwarded from the public form. */
  sessionId?: string;
}

interface SubmissionResult {
  success: boolean;
  submissionId?: string;
  leadId?: string;
  isNewLead?: boolean;
  wasReactivated?: boolean;
  error?: string;
  isDuplicate?: boolean;
}

export class FormSubmissionService {
  /**
   * Process a public form submission:
   * 1. Validate form data against field schema
   * 2. Extract lead fields via lead_field_map
   * 3. Determine institution_id from program selection
   * 4. Atomic capture via capture_admission_lead RPC (handles dedup +
   *    campaign attribution + lead_source_captures row)
   * 5. Store raw form_submissions row tied to the resolved lead_id
   */
  static async processSubmission(
    form: AdmissionForm & {
      sections: (AdmissionFormSection & { fields: AdmissionFormField[] })[];
    },
    input: SubmissionInput,
    supabaseServiceClient: any,
  ): Promise<SubmissionResult> {
    const { formData } = input;

    const allFields = form.sections.flatMap((s) => s.fields ?? []);

    for (const field of allFields) {
      if (field.is_required) {
        const value = formData[field.field_key];
        if (value === undefined || value === null || value === '') {
          return { success: false, error: `${field.field_label} is required` };
        }
      }
    }

    const leadData: Partial<CreateLeadInput> & Record<string, unknown> = {
      source: (form.lead_source ?? 'website') as LeadSource,
      tags: [`form:${form.slug}`],
      notes: `Submitted via public form: ${form.name}`,
    };

    for (const field of allFields) {
      if (
        field.lead_field_map &&
        formData[field.field_key] !== undefined
      ) {
        (leadData as Record<string, unknown>)[field.lead_field_map] =
          formData[field.field_key];
      }
    }

    const programSelectorField = allFields.find(
      (f) => f.field_type === 'institution_program_selector',
    );
    let institutionId: string;

    if (programSelectorField && formData[programSelectorField.field_key]) {
      const selection = formData[programSelectorField.field_key] as {
        institution_id: string;
        program_id: string;
      };
      institutionId = selection.institution_id;
      leadData.interested_programs = [selection.program_id];
    } else if (
      form.institution_ids &&
      form.institution_ids.length === 1
    ) {
      institutionId = form.institution_ids[0];
    } else {
      institutionId = form.institution_id;
    }

    leadData.institution_id = institutionId;

    if (!leadData.first_name) {
      const fullName = formData['full_name'] as string;
      if (fullName) {
        const parts = fullName.trim().split(/\s+/);
        leadData.first_name = parts[0];
        leadData.last_name = parts.slice(1).join(' ') || null;
      } else {
        return { success: false, error: 'Name is required' };
      }
    }

    if (!leadData.phone) {
      return { success: false, error: 'Phone number is required' };
    }

    if (input.utmSource) {
      leadData.tags = [
        ...((leadData.tags as string[]) ?? []),
        `utm:${input.utmSource}`,
      ];
    }

    if (formData['wa_opt_in'] === true) {
      leadData.wa_opt_in = true;
      leadData.wa_opt_in_source = 'public_form';
    }

    // ─── Atomic capture via RPC ──────────────────────────────────────────
    const leadSource = (form.lead_source ?? 'website') as LeadSource;
    const { data: rpcData, error: rpcError } = await supabaseServiceClient.rpc(
      'capture_admission_lead',
      {
        p_lead: {
          first_name: leadData.first_name,
          last_name: leadData.last_name ?? null,
          phone: leadData.phone,
          email: (leadData as any).email ?? null,
          institution_id: institutionId,
          interested_programs: leadData.interested_programs ?? null,
          source: leadSource,
          tags: leadData.tags ?? [],
          notes: leadData.notes ?? null,
          wa_opt_in: leadData.wa_opt_in ?? false,
          wa_opt_in_source: leadData.wa_opt_in_source ?? null,
        },
        p_capture: {
          source: leadSource,
          source_detail: form.slug,
          captured_at: new Date().toISOString(),
          captured_by: null,
          utm_source: input.utmSource ?? null,
          utm_medium: input.utmMedium ?? null,
          utm_campaign: input.utmCampaign ?? null,
          campaign_link_id: input.campaignLinkId ?? null,
          raw_payload: {
            form_id: form.id,
            session_id: input.sessionId ?? null,
            ip_address: input.ipAddress ?? null,
            user_agent: input.userAgent ?? null,
            device_type: input.deviceType ?? null,
            referrer_url: input.referrerUrl ?? null,
            submission: formData,
          },
        },
      },
    );

    if (rpcError) {
      // Phone-unique duplicate → friendly duplicate response (preserves
      // the previous 409 contract that the route handler relies on).
      if (
        rpcError?.message?.toLowerCase()?.includes('duplicate') ||
        rpcError?.code === '23505'
      ) {
        return {
          success: false,
          error:
            'An application with this phone number already exists. Our team will contact you.',
          isDuplicate: true,
        };
      }
      console.error(
        '[admission/forms] capture_admission_lead failed:',
        rpcError,
      );
      return {
        success: false,
        error: 'Failed to submit application. Please try again.',
      };
    }

    const captureResult = rpcData as
      | {
          lead_id?: string;
          is_new_lead?: boolean;
          was_reactivated?: boolean;
        }
      | null
      | undefined;
    const leadId = captureResult?.lead_id;

    if (!leadId) {
      console.error(
        '[admission/forms] capture_admission_lead returned no lead_id',
        rpcData,
      );
      return {
        success: false,
        error: 'Failed to submit application. Please try again.',
      };
    }

    // ─── Persist raw form submission row (best-effort) ──────────────────
    const { data: submission, error: subError } = await supabaseServiceClient
      .from('admission_form_submissions')
      .insert({
        form_id: form.id,
        lead_id: leadId,
        institution_id: institutionId,
        submission_data: formData,
        ip_address: input.ipAddress,
        user_agent: input.userAgent,
        utm_source: input.utmSource,
        utm_medium: input.utmMedium,
        utm_campaign: input.utmCampaign,
        campaign_link_id: input.campaignLinkId ?? null,
        referrer_url: input.referrerUrl,
        device_type: input.deviceType,
      })
      .select('id')
      .single();

    if (subError) {
      console.error(
        '[admission/forms] Failed to store submission row:',
        subError,
      );
      // Lead is the commercially valuable artifact — do not fail.
    }

    return {
      success: true,
      submissionId: submission?.id,
      leadId,
      isNewLead: captureResult?.is_new_lead,
      wasReactivated: captureResult?.was_reactivated,
    };
  }
}
