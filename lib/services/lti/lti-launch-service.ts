/**
 * LTI Launch Service
 *
 * Orchestrates LTI 1.3 tool launches
 * Coordinates JWT generation, role mapping, context building
 *
 * Created: 2026-01-12
 */

import { createClient } from '@/lib/supabase/server';
import { LtiJwtService } from './lti-jwt-service';
import { LtiRoleService } from './lti-role-service';
import { LtiContextService } from './lti-context-service';
import { LtiToolService } from './lti-tool-service';
import {
  LtiTool,
  LtiLaunch,
  LtiError,
  LTI_ERROR_CODES
} from '@/types/lti';

interface LaunchParams {
  toolId: string;
  userId: string;
  userRole: string | string[];
  learnerProfileId?: string;
  institutionId: string;
  programId?: string;
  semesterId?: string;
  sectionId?: string;
  academicYearId?: string;
  resourceLinkId?: string;
  resourceLinkTitle?: string;
  resourceLinkDescription?: string;
  launchType?: 'assignment' | 'resource' | 'deep_link' | 'content_selection';
  ipAddress?: string;
  userAgent?: string;
}

interface LaunchResult {
  jwt: string;
  tool: LtiTool;
  launchId: string;
  formHtml: string;
}

export class LtiLaunchService {
  /**
   * Execute complete LTI launch flow
   */
  static async launch(params: LaunchParams): Promise<LaunchResult> {
    try {
      // Step 1: Validate and fetch tool
      const tool = await this.validateAndFetchTool(params.toolId);

      // Step 2: Validate user permissions
      await this.validateUserPermissions(params);

      // Step 3: Fetch user details
      const userDetails = await this.fetchUserDetails(params.userId);

      // Step 4: Map roles to LTI
      const ltiRoles = LtiRoleService.mapUserRoleToLti(params.userRole);
      const primaryRole = LtiRoleService.getPrimaryRole(ltiRoles);

      // Step 5: Build context claim (if academic context provided)
      const contextClaim = await this.buildContextClaim(params);

      // Step 6: Build resource link claim (if assignment context)
      const resourceLinkClaim = this.buildResourceLinkClaim(params);

      // Step 7: Build custom claims
      const customClaims = await this.buildCustomClaims(params);

      // Step 8: Generate JWT
      const jwt = await LtiJwtService.generateLaunchToken({
        tool,
        user: {
          id: params.userId,
          email: userDetails.email,
          name: userDetails.name,
          givenName: userDetails.givenName,
          familyName: userDetails.familyName
        },
        roles: ltiRoles,
        context: contextClaim || undefined,
        resourceLink: resourceLinkClaim || undefined,
        customClaims
      });

      // Step 9: Record launch in database
      const launchId = await this.recordLaunch(params, ltiRoles, jwt);

      // Step 10: Generate auto-submit form HTML
      const formHtml = this.generateLaunchForm(tool.launch_url, jwt);

      return {
        jwt,
        tool,
        launchId,
        formHtml
      };
    } catch (error) {
      console.error('[LTI Launch Service] Launch failed:', error);

      if (error instanceof LtiError) {
        throw error;
      }

      throw new LtiError(
        'LTI launch failed',
        LTI_ERROR_CODES.LAUNCH_FAILED,
        500,
        error
      );
    }
  }

  /**
   * Validate tool exists and is active
   */
  private static async validateAndFetchTool(toolId: string): Promise<LtiTool> {
    const tool = await LtiToolService.getToolById(toolId);

    if (!tool.is_active) {
      throw new LtiError(
        `LTI tool is not active: ${tool.name}`,
        LTI_ERROR_CODES.TOOL_NOT_FOUND,
        403
      );
    }

    // Check license expiry
    const isExpired = await LtiToolService.isLicenseExpired(toolId);
    if (isExpired) {
      throw new LtiError(
        `LTI tool license has expired: ${tool.name}`,
        LTI_ERROR_CODES.TOOL_NOT_FOUND,
        403
      );
    }

    return tool;
  }

  /**
   * Validate user has permission to launch
   */
  private static async validateUserPermissions(params: LaunchParams): Promise<void> {
    const supabase = await createClient();

    // Check user exists
    const { data: user, error: userError } = await supabase
      .from('auth.users')
      .select('id, email')
      .eq('id', params.userId)
      .single();

    if (userError || !user) {
      throw new LtiError(
        'User not found',
        LTI_ERROR_CODES.USER_NOT_FOUND,
        404
      );
    }

    // If learner profile provided, validate it's active
    if (params.learnerProfileId) {
      const { data: learner, error: learnerError } = await supabase
        .from('learners_profiles')
        .select('lifecycle_status')
        .eq('id', params.learnerProfileId)
        .single();

      if (learnerError || !learner) {
        throw new LtiError(
          'Learner profile not found',
          LTI_ERROR_CODES.LEARNER_NOT_FOUND,
          404
        );
      }

      if (learner.lifecycle_status !== 'active') {
        throw new LtiError(
          'Learner account is not active',
          LTI_ERROR_CODES.USER_INACTIVE,
          403
        );
      }
    }

    // Validate institution access
    const { data: access } = await supabase
      .from('user_institution_access')
      .select('institution_id')
      .eq('user_id', params.userId)
      .eq('institution_id', params.institutionId)
      .single();

    if (!access) {
      throw new LtiError(
        'User does not have access to this institution',
        LTI_ERROR_CODES.UNAUTHORIZED,
        403
      );
    }
  }

  /**
   * Fetch user details for JWT claims
   */
  private static async fetchUserDetails(userId: string): Promise<{
    email: string;
    name: string;
    givenName?: string;
    familyName?: string;
  }> {
    const supabase = await createClient();

    // Try to get from auth.users
    const { data: user } = await supabase
      .from('auth.users')
      .select('email, raw_user_meta_data')
      .eq('id', userId)
      .single();

    if (!user) {
      throw new LtiError(
        'User details not found',
        LTI_ERROR_CODES.USER_NOT_FOUND,
        404
      );
    }

    // Extract name from metadata
    const metadata = user.raw_user_meta_data || {};
    const fullName = metadata.full_name || metadata.name || user.email.split('@')[0];
    const givenName = metadata.given_name || metadata.first_name;
    const familyName = metadata.family_name || metadata.last_name;

    return {
      email: user.email,
      name: fullName,
      givenName,
      familyName
    };
  }

  /**
   * Build context claim
   */
  private static async buildContextClaim(params: LaunchParams) {
    // If no academic context, check if learner profile has one
    if (!params.programId && !params.semesterId && !params.sectionId && params.learnerProfileId) {
      const learnerContext = await LtiContextService.getLearnerAcademicContext(
        params.learnerProfileId
      );

      if (learnerContext) {
        return await LtiContextService.buildContextClaim(learnerContext);
      }
    }

    // Use provided academic context
    if (params.programId || params.semesterId || params.sectionId) {
      return await LtiContextService.buildContextClaim({
        institutionId: params.institutionId,
        programId: params.programId,
        semesterId: params.semesterId,
        sectionId: params.sectionId,
        academicYearId: params.academicYearId
      });
    }

    return null;
  }

  /**
   * Build resource link claim
   */
  private static buildResourceLinkClaim(params: LaunchParams) {
    if (!params.resourceLinkId) {
      return null;
    }

    return {
      id: params.resourceLinkId,
      title: params.resourceLinkTitle,
      description: params.resourceLinkDescription
    };
  }

  /**
   * Build custom MyJKKN claims
   */
  private static async buildCustomClaims(params: LaunchParams) {
    const customClaims: any = {};

    // Institution claim
    const institutionClaim = await LtiContextService.buildInstitutionClaim(
      params.institutionId
    );
    if (institutionClaim) {
      customClaims.institution = institutionClaim;
    }

    // Learner claim
    if (params.learnerProfileId) {
      const learnerClaim = await LtiContextService.buildLearnerClaim(
        params.learnerProfileId
      );
      if (learnerClaim) {
        customClaims.learner = learnerClaim;
      }
    }

    // Academic claim
    if (params.programId || params.semesterId || params.sectionId) {
      customClaims.academic = LtiContextService.buildAcademicClaim({
        institutionId: params.institutionId,
        programId: params.programId,
        semesterId: params.semesterId,
        sectionId: params.sectionId,
        academicYearId: params.academicYearId
      });
    }

    return customClaims;
  }

  /**
   * Record launch in database
   */
  private static async recordLaunch(
    params: LaunchParams,
    ltiRoles: string[],
    jwt: string
  ): Promise<string> {
    const supabase = await createClient();

    // Decode JWT to get nonce and expiration
    const jwtParts = jwt.split('.');
    const payload = JSON.parse(Buffer.from(jwtParts[1], 'base64').toString());

    // Generate context ID
    const contextId = [
      params.programId || 'no-program',
      params.semesterId || 'no-semester',
      params.sectionId || 'no-section'
    ].join('_');

    const launchData = {
      tool_id: params.toolId,
      user_id: params.userId,
      learner_profile_id: params.learnerProfileId || null,
      institution_id: params.institutionId,
      program_id: params.programId || null,
      semester_id: params.semesterId || null,
      section_id: params.sectionId || null,
      academic_year_id: params.academicYearId || null,
      context_id: contextId,
      resource_link_id: params.resourceLinkId || null,
      resource_link_title: params.resourceLinkTitle || null,
      resource_link_description: params.resourceLinkDescription || null,
      launch_type: params.launchType || 'resource',
      user_role_sent: ltiRoles[0], // Primary role
      myjkkn_role: Array.isArray(params.userRole) ? params.userRole[0] : params.userRole,
      jwt_nonce: payload.nonce,
      jwt_expires_at: new Date(payload.exp * 1000).toISOString(),
      ip_address: params.ipAddress || null,
      user_agent: params.userAgent || null,
      created_by: params.userId
    };

    const { data, error } = await supabase
      .from('lti_launches')
      .insert(launchData)
      .select('id')
      .single();

    if (error) {
      console.error('[LTI Launch Service] Failed to record launch:', error);
      throw new LtiError(
        'Failed to record launch',
        LTI_ERROR_CODES.LAUNCH_FAILED,
        500,
        error
      );
    }

    return data.id;
  }

  /**
   * Generate auto-submit HTML form
   */
  private static generateLaunchForm(launchUrl: string, jwt: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Launching...</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .container {
      text-align: center;
      color: white;
    }
    .spinner {
      border: 4px solid rgba(255, 255, 255, 0.3);
      border-top: 4px solid white;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    h2 {
      margin: 0 0 10px;
      font-size: 24px;
    }
    p {
      margin: 0;
      font-size: 14px;
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h2>Launching Application...</h2>
    <p>You will be redirected shortly</p>
  </div>
  <form id="lti_launch_form" method="POST" action="${launchUrl}">
    <input type="hidden" name="id_token" value="${jwt}" />
  </form>
  <script>
    // Auto-submit form after 500ms
    setTimeout(function() {
      document.getElementById('lti_launch_form').submit();
    }, 500);
  </script>
</body>
</html>
`.trim();
  }

  /**
   * Get launch statistics
   */
  static async getLaunchStats(
    institutionId: string,
    startDate: string,
    endDate: string
  ) {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('get_lti_launch_stats', {
      p_institution_id: institutionId,
      p_start_date: startDate,
      p_end_date: endDate
    });

    if (error) {
      console.error('[LTI Launch Service] Failed to get launch stats:', error);
      throw new LtiError(
        'Failed to get launch statistics',
        LTI_ERROR_CODES.LAUNCH_FAILED,
        500,
        error
      );
    }

    return data;
  }
}
