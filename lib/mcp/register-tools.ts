import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMorningBriefTool } from '@/lib/mcp/tools/morning-brief';
import { registerAttendanceTool } from '@/lib/mcp/tools/attendance';
import { registerBillingTool } from '@/lib/mcp/tools/billing';
import { registerLearnersTool } from '@/lib/mcp/tools/learners';
import { registerStaffTool } from '@/lib/mcp/tools/staff';
import { registerGrievanceTool } from '@/lib/mcp/tools/grievance';
import { registerAdmissionTool } from '@/lib/mcp/tools/admission';
import { registerOkrTool } from '@/lib/mcp/tools/okr';
import { registerOrganizationsTool } from '@/lib/mcp/tools/organizations';

export function registerAllTools(server: McpServer): void {
  registerMorningBriefTool(server);
  registerAttendanceTool(server);
  registerBillingTool(server);
  registerLearnersTool(server);
  registerStaffTool(server);
  registerGrievanceTool(server);
  registerAdmissionTool(server);
  registerOkrTool(server);
  registerOrganizationsTool(server);
}
