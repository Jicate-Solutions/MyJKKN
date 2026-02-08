// app/api/parent-portal/auth/register/route.ts
// SECURITY: Uses validation middleware to prevent XSS and injection attacks

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { parentRegistrationSchema, ParentRegistrationInput } from '@/lib/validations/parent-portal';
import { ParentSessionService } from '@/lib/services/parent-portal/parent-session-service';
import { setCSRFCookie } from '@/lib/utils/csrf';
import { withValidation, withRateLimit, composeValidation } from '@/lib/middleware/validate-input';

// Handler with validated and sanitized input
async function registerHandler(
  request: NextRequest,
  validated: ParentRegistrationInput
) {
  try {
    const supabase = await createClient();

    // Find the learner by enrollment number
    const { data: learner, error: learnerError } = await supabase
      .from('learners_profiles')
      .select('id, name, institution_id')
      .eq('enrollment_number', validated.learner_enrollment_number)
      .eq('institution_id', validated.institution_id)
      .single();

    if (learnerError || !learner) {
      return NextResponse.json(
        {
          success: false,
          message: 'Learner not found with the provided enrollment number',
        },
        { status: 404 }
      );
    }

    // Check if parent already exists with this phone
    const { data: existingParent } = await supabase
      .from('parent_profiles')
      .select('id')
      .eq('phone', validated.phone)
      .eq('institution_id', validated.institution_id)
      .single();

    if (existingParent) {
      // Check if already linked to this learner
      const { data: existingLink } = await supabase
        .from('parent_learner_links')
        .select('id')
        .eq('parent_id', existingParent.id)
        .eq('learner_id', learner.id)
        .single();

      if (existingLink) {
        return NextResponse.json(
          {
            success: false,
            message: 'You are already linked to this learner. Please login.',
          },
          { status: 409 }
        );
      }

      // Link existing parent to new learner
      const { error: linkError } = await supabase
        .from('parent_learner_links')
        .insert({
          parent_id: existingParent.id,
          learner_id: learner.id,
          relationship: validated.relationship,
        });

      if (linkError) throw linkError;

      // Create secure session for existing parent
      const ipAddress = request.headers.get('x-forwarded-for') ||
                       request.headers.get('x-real-ip') ||
                       'unknown';
      const userAgent = request.headers.get('user-agent') || 'unknown';

      const sessionData = await ParentSessionService.createSession(
        existingParent.id,
        ipAddress,
        userAgent
      );

      await ParentSessionService.setSessionCookie(sessionData.sessionToken);
      const csrfToken = await setCSRFCookie();

      return NextResponse.json({
        success: true,
        message: 'Learner added to your account. Please verify your phone.',
        parent_id: existingParent.id,
        requires_verification: true,
        csrf_token: csrfToken,
      });
    }

    // New parent - return that registration needs OTP verification first
    return NextResponse.json({
      success: true,
      message: 'Please verify your phone number to complete registration',
      requires_verification: true,
      learner_id: learner.id,
      learner_name: learner.name,
    });
  } catch (error) {
    console.error('[parent-portal/auth/register] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to register' },
      { status: 500 }
    );
  }
}

// Export with validation and rate limiting middleware
// SECURITY: Rate limit prevents brute force attacks
// SECURITY: Validation middleware sanitizes all inputs
export const POST = composeValidation(
  (handler) => withRateLimit(20, 60000, handler), // Max 20 requests per minute
)(withValidation(parentRegistrationSchema, registerHandler));
