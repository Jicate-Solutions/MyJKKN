import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMorningBriefTool } from '@/lib/mcp/tools/morning-brief';
import { registerAttendanceTool } from '@/lib/mcp/tools/attendance';
import { registerBillingTool } from '@/lib/mcp/tools/billing';
import { registerLearnersTool } from '@/lib/mcp/tools/learners';
import { registerStaffTool } from '@/lib/mcp/tools/staff';
import { registerServiceRequestTool } from '@/lib/mcp/tools/service-request';
import { registerGrievanceTool } from '@/lib/mcp/tools/grievance';
import { registerRequirementTool } from '@/lib/mcp/tools/requirement';
import { registerAdmissionTool } from '@/lib/mcp/tools/admission';
import { registerOkrTool } from '@/lib/mcp/tools/okr';
import { registerOrganizationsTool } from '@/lib/mcp/tools/organizations';
import { registerAtRiskLearnersTool } from '@/lib/mcp/tools/at-risk-learners';
import { registerDepartmentHealthTool } from '@/lib/mcp/tools/department-health';

export function registerAllTools(server: McpServer): void {
  // ── Module tools (11) ─────────────────────────────────────────────────────
  registerMorningBriefTool(server);
  registerAttendanceTool(server);
  registerBillingTool(server);
  registerLearnersTool(server);
  registerStaffTool(server);
  registerServiceRequestTool(server);
  registerGrievanceTool(server);
  registerRequirementTool(server);
  registerAdmissionTool(server);
  registerOkrTool(server);
  registerOrganizationsTool(server);

  // ── Smart composite tools (2) ─────────────────────────────────────────────
  registerAtRiskLearnersTool(server);
  registerDepartmentHealthTool(server);
}
