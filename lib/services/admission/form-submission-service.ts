// lib/services/admission/form-submission-service.ts
// Handles public form submissions → lead creation pipeline
// Added: 2026-04-08

import type {
  AdmissionForm,
  AdmissionFormField,
  AdmissionFormSection,
  CreateLeadInput,
  LeadSource,
} from '@/types/admission';
import { LeadService } from './lead-service';

interface SubmissionInput {
  formData: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrerUrl?: string;
  deviceType?: string;
}

interface SubmissionResult {
  success: boolean;
  submissionId?: string;
  leadId?: string;
  error?: string;
  isDuplicate?: boolean;
}

export class FormSubmissionService {
  /**
   * Process a public form submission:
   * 1. Validate form data against field schema
   * 2. Extract lead fields via lead_field_map
   * 3. Determine institution_id from program selection
   * 4. Create lead via LeadService.createLead()
   * 5. Store raw submission
   */
  static async processSubmission(
    form: AdmissionForm & { sections: (AdmissionFormSection & { fields: AdmissionFormField[] })[] },
    input: SubmissionInput,
    supabaseServiceClient: any
  ): Promise<SubmissionResult> {
    const { formData } = input;

    // 1. Flatten all fields from sections
    const allFields = form.sections.flatMap((s) => s.fields ?? []);

    // 2. Validate required fields
    for (const field of allFields) {
      if (field.is_required) {
        const value = formData[field.field_key];
        if (value === undefined || value === null || value === '') {
          return { success: false, error: `${field.field_label} is required` };
        }
      }
    }

    // 3. Extract lead data via lead_field_map
    const leadData: Partial<CreateLeadInput> = {
      source: 'website' as LeadSource,
      tags: [`form:${form.slug}`],
      notes: `Submitted via public form: ${form.name}`,
    };

    for (const field of allFields) {
      if (field.lead_field_map && formData[field.field_key] !== undefined) {
        (leadData as any)[field.lead_field_map] = formData[field.field_key];
      }
    }

    // 4. Determine institution_id
    const programSelectorField = allFields.find(
      (f) => f.field_type === 'institution_program_selector'
    );
    let institutionId: string;

    if (programSelectorField && formData[programSelectorField.field_key]) {
      const selection = formData[programSelectorField.field_key] as {
        institution_id: string;
        program_id: string;
      };
      institutionId = selection.institution_id;
      leadData.interested_programs = [selection.program_id];
    } else if (form.institution_ids && form.institution_ids.length === 1) {
      institutionId = form.institution_ids[0];
    } else {
      institutionId = form.institution_id;
    }

    leadData.institution_id = institutionId;

    // 5. Ensure required lead fields with fallback
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

    // 6. Add UTM tags
    if (input.utmSource) {
      leadData.tags = [...(leadData.tags ?? []), `utm:${input.utmSource}`];
    }

    // 7. Set WhatsApp opt-in from form
    if (formData['wa_opt_in'] === true) {
      leadData.wa_opt_in = true;
      leadData.wa_opt_in_source = 'public_form';
    }

    // 8. Create lead via existing service
    try {
      const lead = await LeadService.createLead(
        leadData as CreateLeadInput,
        undefined,
        supabaseServiceClient
      );

      // 9. Store raw submission
      const { data: submission, error: subError } = await supabaseServiceClient
        .from('admission_form_submissions')
        .insert({
          form_id: form.id,
          lead_id: lead.id,
          institution_id: institutionId,
          submission_data: formData,
          ip_address: input.ipAddress,
          user_agent: input.userAgent,
          utm_source: input.utmSource,
          utm_medium: input.utmMedium,
          utm_campaign: input.utmCampaign,
          referrer_url: input.referrerUrl,
          device_type: input.deviceType,
        })
        .select('id')
        .single();

      if (subError) {
        console.error('[admission/forms] Failed to store submission:', subError);
        // Lead was created successfully, don't fail the whole operation
      }

      return {
        success: true,
        submissionId: submission?.id,
        leadId: lead.id,
      };
    } catch (error: any) {
      if (error?.message?.includes('Duplicate lead') || error?.code === '409') {
        return {
          success: false,
          error: 'An application with this phone number already exists. Our team will contact you.',
          isDuplicate: true,
        };
      }
      console.error('[admission/forms] Submission failed:', error);
      return { success: false, error: 'Failed to submit application. Please try again.' };
    }
  }
}
