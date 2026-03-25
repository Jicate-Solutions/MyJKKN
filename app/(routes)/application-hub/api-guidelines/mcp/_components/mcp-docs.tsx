'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CodeBlock } from '@/components/code-block';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  AlertCircle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Code2,
  Key,
  MessageSquare,
  Monitor,
  Shield,
  Terminal,
  Users,
  Wrench,
  Zap,
  GraduationCap,
  Building2,
  BookOpen,
  Activity,
  FileText,
  Target,
  Briefcase,
  HeartPulse,
  Calendar,
  DollarSign,
  UserCheck,
  Settings
} from 'lucide-react';

// ─── Code snippets ──────────────────────────────────────────────────────────

const claudeDesktopConfig = `// No file editing needed — use the Claude Desktop UI:
// 1. Open Claude Desktop
// 2. Go to Settings > Connectors
// 3. Click "Add Connector"
// 4. Fill in:
//    - Name:  MyJKKN
//    - URL:   https://www.jkkn.ai/api/mcp/mcp
//    - Auth:  Bearer Token
//    - Token: jkkn_YOUR_API_KEY
// 5. Click Save`;

const claudeCodeConfig = `// Add to your project's .mcp.json file:
{
  "mcpServers": {
    "myjkkn": {
      "url": "https://www.jkkn.ai/api/mcp/mcp",
      "headers": {
        "Authorization": "Bearer jkkn_YOUR_API_KEY"
      }
    }
  }
}`;

const cursorConfig = `// Add to your MCP client configuration (mcp.json or settings):
{
  "mcpServers": {
    "myjkkn": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://www.jkkn.ai/api/mcp/mcp",
        "--header",
        "Authorization: Bearer jkkn_YOUR_API_KEY"
      ]
    }
  }
}`;

const chatgptConfig = `// ChatGPT with Connectors (requires Plus/Team/Enterprise):
// 1. Open ChatGPT
// 2. Go to Settings > Connectors > Advanced > Developer Mode
// 3. Click "Add URL"
// 4. Enter: https://www.jkkn.ai/api/mcp/mcp
// 5. Set Auth: Bearer Token
// 6. Paste your API key: jkkn_YOUR_API_KEY
// 7. Save`;

const jsonRpcInitialize = `// Step 1: Initialize the connection
POST https://www.jkkn.ai/api/mcp/mcp
Authorization: Bearer jkkn_YOUR_API_KEY
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {
      "name": "my-app",
      "version": "1.0"
    }
  }
}`;

const jsonRpcListTools = `// Step 2: List available tools
POST https://www.jkkn.ai/api/mcp/mcp
Authorization: Bearer jkkn_YOUR_API_KEY
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {}
}`;

const jsonRpcCallTool = `// Step 3: Call a tool
POST https://www.jkkn.ai/api/mcp/mcp
Authorization: Bearer jkkn_YOUR_API_KEY
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "myjkkn_morning_brief",
    "arguments": {}
  }
}`;

const jsonRpcCallToolWithArgs = `// Example: Query attendance with parameters
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "myjkkn_query_attendance",
    "arguments": {
      "date": "2026-03-05",
      "department": "Computer Science"
    }
  }
}`;

const toolSchemas = {
  myjkkn_morning_brief: `{
  "name": "myjkkn_morning_brief",
  "description": "Daily institutional overview including attendance, billing, admissions, and alerts",
  "inputSchema": {
    "type": "object",
    "properties": {},
    "required": []
  }
}`,
  myjkkn_query_attendance: `{
  "name": "myjkkn_query_attendance",
  "description": "Query attendance records filtered by date, department, or student",
  "inputSchema": {
    "type": "object",
    "properties": {
      "date": { "type": "string", "description": "Date in YYYY-MM-DD format" },
      "department": { "type": "string", "description": "Department name to filter by" },
      "student_id": { "type": "string", "description": "Specific student UUID" },
      "status": { "type": "string", "enum": ["present", "absent", "late"], "description": "Attendance status filter" }
    }
  }
}`,
  myjkkn_query_billing: `{
  "name": "myjkkn_query_billing",
  "description": "Query bills and invoices, filter by status and due date",
  "inputSchema": {
    "type": "object",
    "properties": {
      "status": { "type": "string", "enum": ["pending", "paid", "overdue", "partial"], "description": "Bill status" },
      "due_before": { "type": "string", "description": "Filter bills due before this date (YYYY-MM-DD)" },
      "student_id": { "type": "string", "description": "Specific student UUID" }
    }
  }
}`,
  myjkkn_query_learners: `{
  "name": "myjkkn_query_learners",
  "description": "Query student profiles with optional filters",
  "inputSchema": {
    "type": "object",
    "properties": {
      "department": { "type": "string", "description": "Department name" },
      "program": { "type": "string", "description": "Program name" },
      "semester": { "type": "string", "description": "Semester filter" },
      "search": { "type": "string", "description": "Search by name or ID" }
    }
  }
}`,
  myjkkn_query_staff: `{
  "name": "myjkkn_query_staff",
  "description": "Query staff records with optional filters",
  "inputSchema": {
    "type": "object",
    "properties": {
      "department": { "type": "string", "description": "Department name" },
      "role": { "type": "string", "description": "Staff role filter" },
      "search": { "type": "string", "description": "Search by name" }
    }
  }
}`,
  myjkkn_query_grievance: `{
  "name": "myjkkn_query_grievance",
  "description": "Query grievance and service requests",
  "inputSchema": {
    "type": "object",
    "properties": {
      "status": { "type": "string", "enum": ["open", "in_progress", "resolved", "closed"], "description": "Grievance status" },
      "category": { "type": "string", "description": "Grievance category" }
    }
  }
}`,
  myjkkn_query_admission: `{
  "name": "myjkkn_query_admission",
  "description": "Query admission applications",
  "inputSchema": {
    "type": "object",
    "properties": {
      "status": { "type": "string", "enum": ["pending", "approved", "rejected", "waitlisted"], "description": "Application status" },
      "program": { "type": "string", "description": "Program applied to" }
    }
  }
}`,
  myjkkn_query_okr: `{
  "name": "myjkkn_query_okr",
  "description": "Query OKR objectives and key results",
  "inputSchema": {
    "type": "object",
    "properties": {
      "department": { "type": "string", "description": "Department name" },
      "status": { "type": "string", "enum": ["on_track", "at_risk", "behind"], "description": "OKR progress status" }
    }
  }
}`,
  myjkkn_query_organizations: `{
  "name": "myjkkn_query_organizations",
  "description": "Query institutions, departments, programs, and courses",
  "inputSchema": {
    "type": "object",
    "properties": {
      "type": { "type": "string", "enum": ["institution", "department", "program", "course"], "description": "Entity type to query" },
      "search": { "type": "string", "description": "Search by name" }
    }
  }
}`,
  myjkkn_at_risk_learners: `{
  "name": "myjkkn_at_risk_learners",
  "description": "Cross-module analysis identifying at-risk students based on attendance, billing, and academic factors",
  "inputSchema": {
    "type": "object",
    "properties": {
      "department": { "type": "string", "description": "Filter by department" },
      "risk_factors": { "type": "array", "items": { "type": "string" }, "description": "Specific risk factors to check" }
    }
  }
}`,
  myjkkn_department_health: `{
  "name": "myjkkn_department_health",
  "description": "Cross-module department metrics including learner count, staff ratio, attendance rate, and billing status",
  "inputSchema": {
    "type": "object",
    "properties": {
      "department": { "type": "string", "description": "Specific department name (omit for all departments)" }
    }
  }
}`
};

const errorExample = `// Error response format
{
  "jsonrpc": "2.0",
  "id": 3,
  "error": {
    "code": -32600,
    "message": "Authentication required"
  }
}

// Common errors:
// -32600  Authentication required — missing or invalid Bearer token
// -32601  Method not found — typo in method name
// -32602  Invalid params — wrong argument types
// -32603  Internal error — server-side failure`;

// ─── Tool metadata ──────────────────────────────────────────────────────────

const tools = [
  { name: 'myjkkn_morning_brief', description: 'Daily institutional overview with attendance, billing, admissions, and alerts', icon: Calendar, category: 'Module' },
  { name: 'myjkkn_query_attendance', description: 'Query attendance records by date, department, or student', icon: UserCheck, category: 'Module' },
  { name: 'myjkkn_query_billing', description: 'Query bills and invoices, filter by status or due date', icon: DollarSign, category: 'Module' },
  { name: 'myjkkn_query_learners', description: 'Query student profiles and enrollment data', icon: GraduationCap, category: 'Module' },
  { name: 'myjkkn_query_staff', description: 'Query staff records and assignments', icon: Users, category: 'Module' },
  { name: 'myjkkn_query_grievance', description: 'Query grievance and service requests', icon: FileText, category: 'Module' },
  { name: 'myjkkn_query_admission', description: 'Query admission applications and status', icon: BookOpen, category: 'Module' },
  { name: 'myjkkn_query_okr', description: 'Query OKR objectives and key results', icon: Target, category: 'Module' },
  { name: 'myjkkn_query_organizations', description: 'Query institutions, departments, programs, and courses', icon: Building2, category: 'Module' },
  { name: 'myjkkn_at_risk_learners', description: 'Cross-module at-risk student analysis (attendance + billing + academics)', icon: HeartPulse, category: 'Smart' },
  { name: 'myjkkn_department_health', description: 'Cross-module department metrics and health score', icon: Activity, category: 'Smart' }
];

// ─── Chat message component ────────────────────────────────────────────────

function ChatMessage({ role, children }: { role: 'user' | 'ai'; children: React.ReactNode }) {
  return (
    <div className={`flex gap-3 ${role === 'user' ? 'justify-end' : 'justify-start'}`}>
      {role === 'ai' && (
        <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10'>
          <Bot className='h-4 w-4 text-primary' />
        </div>
      )}
      <div
        className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm leading-relaxed ${
          role === 'user'
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted'
        }`}
      >
        {children}
      </div>
      {role === 'user' && (
        <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted'>
          <MessageSquare className='h-4 w-4 text-muted-foreground' />
        </div>
      )}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function McpDocs() {
  return (
    <Tabs defaultValue='overview' className='w-full'>
      <TabsList className='grid w-full grid-cols-5'>
        <TabsTrigger value='overview'>Overview</TabsTrigger>
        <TabsTrigger value='connect'>Connect AI Tools</TabsTrigger>
        <TabsTrigger value='examples'>Examples</TabsTrigger>
        <TabsTrigger value='reference'>Technical Reference</TabsTrigger>
        <TabsTrigger value='troubleshooting'>Troubleshooting</TabsTrigger>
      </TabsList>

      {/* ── Tab 1: Overview ──────────────────────────────────────────────────── */}
      <TabsContent value='overview' className='space-y-6 mt-6'>
        {/* What is MCP */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Bot className='h-5 w-5' />
              What is the Model Context Protocol (MCP)?
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <p className='text-sm text-muted-foreground'>
              The <strong>Model Context Protocol (MCP)</strong> is an open standard that allows AI assistants to connect to external data sources and tools.
              Instead of copying data into prompts, your AI assistant connects directly to MyJKKN and can query live institutional data using natural language.
            </p>

            <div className='flex items-center justify-center gap-2 py-6 flex-wrap'>
              <div className='flex items-center gap-2 rounded-lg border bg-background px-4 py-3'>
                <MessageSquare className='h-5 w-5 text-blue-500' />
                <span className='text-sm font-medium'>Your AI Assistant</span>
              </div>
              <ArrowRight className='h-4 w-4 text-muted-foreground' />
              <div className='flex items-center gap-2 rounded-lg border bg-background px-4 py-3 border-primary'>
                <Zap className='h-5 w-5 text-primary' />
                <span className='text-sm font-medium'>MCP Protocol</span>
              </div>
              <ArrowRight className='h-4 w-4 text-muted-foreground' />
              <div className='flex items-center gap-2 rounded-lg border bg-background px-4 py-3'>
                <Monitor className='h-5 w-5 text-green-500' />
                <span className='text-sm font-medium'>MyJKKN Server</span>
              </div>
              <ArrowRight className='h-4 w-4 text-muted-foreground' />
              <div className='flex items-center gap-2 rounded-lg border bg-background px-4 py-3'>
                <Building2 className='h-5 w-5 text-orange-500' />
                <span className='text-sm font-medium'>JKKN Database</span>
              </div>
            </div>

            <div className='grid gap-4 sm:grid-cols-3'>
              <div className='rounded-lg border p-4'>
                <h4 className='mb-1 text-sm font-semibold flex items-center gap-2'>
                  <MessageSquare className='h-4 w-4 text-blue-500' />
                  Natural Language
                </h4>
                <p className='text-xs text-muted-foreground'>
                  Ask questions in plain English. No SQL or API knowledge needed.
                </p>
              </div>
              <div className='rounded-lg border p-4'>
                <h4 className='mb-1 text-sm font-semibold flex items-center gap-2'>
                  <Shield className='h-4 w-4 text-green-500' />
                  Role-Based Access
                </h4>
                <p className='text-xs text-muted-foreground'>
                  Data is scoped by your role. Admins see all data, faculty see department data, students see their own.
                </p>
              </div>
              <div className='rounded-lg border p-4'>
                <h4 className='mb-1 text-sm font-semibold flex items-center gap-2'>
                  <Wrench className='h-4 w-4 text-purple-500' />
                  Works Everywhere
                </h4>
                <p className='text-xs text-muted-foreground'>
                  Compatible with Claude Desktop, ChatGPT, Cursor, Claude Code, Windsurf, and any MCP client.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Authentication */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Key className='h-5 w-5' />
              Authentication
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <p className='text-sm text-muted-foreground'>
              The MCP server uses the same API key system as the B2A API. Every request must include a
              Bearer token in the <code className='bg-muted px-1 rounded text-xs'>Authorization</code> header.
            </p>

            <div className='rounded-lg border p-4 bg-muted/50'>
              <p className='text-sm font-mono'>
                Authorization: Bearer <span className='text-primary'>jkkn_YOUR_API_KEY</span>
              </p>
            </div>

            <Alert>
              <Key className='h-4 w-4' />
              <AlertTitle>API Keys</AlertTitle>
              <AlertDescription>
                Generate API keys from the <strong>Application Hub &gt; API Keys</strong> page.
                Keys use the format <code className='bg-muted px-1 rounded text-xs'>jkkn_xxxx</code>.
                Each key is scoped to your role and institution.
              </AlertDescription>
            </Alert>

            <div className='space-y-2'>
              <h4 className='text-sm font-semibold'>Data Scoping by Role</h4>
              <div className='grid gap-2 sm:grid-cols-3'>
                <div className='rounded-lg border p-3'>
                  <Badge variant='default' className='mb-2'>Admin</Badge>
                  <p className='text-xs text-muted-foreground'>Full access to all institution data across every module.</p>
                </div>
                <div className='rounded-lg border p-3'>
                  <Badge variant='secondary' className='mb-2'>Faculty</Badge>
                  <p className='text-xs text-muted-foreground'>Access to department-scoped data: students, attendance, staff in your department.</p>
                </div>
                <div className='rounded-lg border p-3'>
                  <Badge variant='outline' className='mb-2'>Student</Badge>
                  <p className='text-xs text-muted-foreground'>Access to own records: billing, attendance, grievances, and profile data.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Available Tools */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Wrench className='h-5 w-5' />
              Available Tools ({tools.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='space-y-1'>
              <div className='grid grid-cols-[auto_1fr_auto] gap-x-4 gap-y-0 items-center px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b'>
                <span>Tool</span>
                <span>Description</span>
                <span>Type</span>
              </div>
              {tools.map((tool) => {
                const Icon = tool.icon;
                return (
                  <div
                    key={tool.name}
                    className='grid grid-cols-[auto_1fr_auto] gap-x-4 items-center px-3 py-2.5 rounded-md hover:bg-muted/50 transition-colors'
                  >
                    <div className='flex items-center gap-2 min-w-0'>
                      <Icon className='h-4 w-4 text-muted-foreground shrink-0' />
                      <code className='bg-muted px-1.5 py-0.5 rounded text-xs font-mono truncate'>
                        {tool.name}
                      </code>
                    </div>
                    <span className='text-sm text-muted-foreground truncate'>
                      {tool.description}
                    </span>
                    <Badge variant={tool.category === 'Smart' ? 'default' : 'secondary'} className='text-xs'>
                      {tool.category}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── Tab 2: Connect AI Tools ──────────────────────────────────────────── */}
      <TabsContent value='connect' className='space-y-6 mt-6'>
        <Alert>
          <CheckCircle2 className='h-4 w-4' />
          <AlertTitle>Before You Start</AlertTitle>
          <AlertDescription>
            Make sure you have an API key. Go to <strong>Application Hub &gt; API Keys</strong> to generate one.
            The server URL for all clients is: <code className='bg-muted px-1 rounded text-xs'>https://www.jkkn.ai/api/mcp/mcp</code>
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Settings className='h-5 w-5' />
              Setup Instructions by AI Tool
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type='single' collapsible className='w-full'>
              {/* Claude Desktop */}
              <AccordionItem value='claude-desktop'>
                <AccordionTrigger>
                  <div className='flex items-center gap-3'>
                    <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-950'>
                      <Bot className='h-4 w-4 text-orange-600 dark:text-orange-400' />
                    </div>
                    <div className='text-left'>
                      <div className='font-semibold'>Claude Desktop / Claude.ai</div>
                      <div className='text-xs text-muted-foreground'>Native MCP support via Connectors</div>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className='space-y-4 pt-2'>
                  <div className='space-y-3'>
                    <div className='flex gap-3'>
                      <div className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold'>1</div>
                      <div>
                        <p className='text-sm font-medium'>Open Claude Desktop</p>
                        <p className='text-xs text-muted-foreground'>Launch the Claude Desktop app or go to claude.ai</p>
                      </div>
                    </div>
                    <div className='flex gap-3'>
                      <div className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold'>2</div>
                      <div>
                        <p className='text-sm font-medium'>Open Settings</p>
                        <p className='text-xs text-muted-foreground'>
                          Click the settings icon, then navigate to <strong>Settings &gt; Connectors</strong>
                        </p>
                      </div>
                    </div>
                    <div className='flex gap-3'>
                      <div className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold'>3</div>
                      <div>
                        <p className='text-sm font-medium'>Add a new Connector</p>
                        <p className='text-xs text-muted-foreground'>
                          Click <strong>Add Connector</strong> and fill in the details:
                        </p>
                        <div className='mt-2 rounded-lg border bg-muted/50 p-3 space-y-1.5'>
                          <div className='grid grid-cols-[100px_1fr] gap-1 text-xs'>
                            <span className='font-semibold'>Name:</span>
                            <span>MyJKKN</span>
                          </div>
                          <div className='grid grid-cols-[100px_1fr] gap-1 text-xs'>
                            <span className='font-semibold'>URL:</span>
                            <code className='bg-background px-1 rounded'>https://www.jkkn.ai/api/mcp/mcp</code>
                          </div>
                          <div className='grid grid-cols-[100px_1fr] gap-1 text-xs'>
                            <span className='font-semibold'>Auth Type:</span>
                            <span>Bearer Token</span>
                          </div>
                          <div className='grid grid-cols-[100px_1fr] gap-1 text-xs'>
                            <span className='font-semibold'>Token:</span>
                            <code className='bg-background px-1 rounded'>jkkn_YOUR_API_KEY</code>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className='flex gap-3'>
                      <div className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold'>4</div>
                      <div>
                        <p className='text-sm font-medium'>Save and Test</p>
                        <p className='text-xs text-muted-foreground'>
                          Click <strong>Save</strong>. Start a new conversation and try asking: &quot;Give me today&apos;s morning brief&quot;
                        </p>
                      </div>
                    </div>
                  </div>
                  <CodeBlock code={claudeDesktopConfig} language='javascript' />
                </AccordionContent>
              </AccordionItem>

              {/* ChatGPT */}
              <AccordionItem value='chatgpt'>
                <AccordionTrigger>
                  <div className='flex items-center gap-3'>
                    <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-green-100 dark:bg-green-950'>
                      <MessageSquare className='h-4 w-4 text-green-600 dark:text-green-400' />
                    </div>
                    <div className='text-left'>
                      <div className='font-semibold'>ChatGPT</div>
                      <div className='text-xs text-muted-foreground'>Requires Plus, Team, or Enterprise plan</div>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className='space-y-4 pt-2'>
                  <div className='space-y-3'>
                    <div className='flex gap-3'>
                      <div className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold'>1</div>
                      <div>
                        <p className='text-sm font-medium'>Open ChatGPT Settings</p>
                        <p className='text-xs text-muted-foreground'>
                          Navigate to <strong>Settings &gt; Connectors &gt; Advanced &gt; Developer Mode</strong>
                        </p>
                      </div>
                    </div>
                    <div className='flex gap-3'>
                      <div className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold'>2</div>
                      <div>
                        <p className='text-sm font-medium'>Add the MCP URL</p>
                        <p className='text-xs text-muted-foreground'>
                          Click <strong>Add URL</strong> and enter: <code className='bg-muted px-1 rounded text-xs'>https://www.jkkn.ai/api/mcp/mcp</code>
                        </p>
                      </div>
                    </div>
                    <div className='flex gap-3'>
                      <div className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold'>3</div>
                      <div>
                        <p className='text-sm font-medium'>Set Authentication</p>
                        <p className='text-xs text-muted-foreground'>
                          Choose <strong>Bearer Token</strong> and paste your API key: <code className='bg-muted px-1 rounded text-xs'>jkkn_YOUR_API_KEY</code>
                        </p>
                      </div>
                    </div>
                    <div className='flex gap-3'>
                      <div className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold'>4</div>
                      <div>
                        <p className='text-sm font-medium'>Save</p>
                        <p className='text-xs text-muted-foreground'>
                          Save the connector. Start a new chat and ask about your institutional data.
                        </p>
                      </div>
                    </div>
                  </div>
                  <CodeBlock code={chatgptConfig} language='javascript' />
                </AccordionContent>
              </AccordionItem>

              {/* Claude Code */}
              <AccordionItem value='claude-code'>
                <AccordionTrigger>
                  <div className='flex items-center gap-3'>
                    <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-950'>
                      <Terminal className='h-4 w-4 text-purple-600 dark:text-purple-400' />
                    </div>
                    <div className='text-left'>
                      <div className='font-semibold'>Claude Code (CLI)</div>
                      <div className='text-xs text-muted-foreground'>Native Streamable HTTP support</div>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className='space-y-4 pt-2'>
                  <p className='text-sm text-muted-foreground'>
                    Add the MCP server to your project&apos;s <code className='bg-muted px-1 rounded text-xs'>.mcp.json</code> file
                    at the root of your project directory.
                  </p>
                  <CodeBlock code={claudeCodeConfig} language='json' />
                  <Alert>
                    <AlertCircle className='h-4 w-4' />
                    <AlertTitle>Restart Required</AlertTitle>
                    <AlertDescription>
                      After editing <code className='bg-muted px-1 rounded text-xs'>.mcp.json</code>, restart Claude Code for the changes to take effect.
                    </AlertDescription>
                  </Alert>
                </AccordionContent>
              </AccordionItem>

              {/* Cursor / Windsurf */}
              <AccordionItem value='cursor'>
                <AccordionTrigger>
                  <div className='flex items-center gap-3'>
                    <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950'>
                      <Code2 className='h-4 w-4 text-blue-600 dark:text-blue-400' />
                    </div>
                    <div className='text-left'>
                      <div className='font-semibold'>Cursor / Windsurf / Other MCP Clients</div>
                      <div className='text-xs text-muted-foreground'>Uses mcp-remote proxy for stdio-based clients</div>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className='space-y-4 pt-2'>
                  <p className='text-sm text-muted-foreground'>
                    Clients that only support stdio-based MCP (like Cursor and Windsurf) need the
                    <code className='bg-muted px-1 rounded text-xs'>mcp-remote</code> proxy package to connect to HTTP-based servers.
                  </p>
                  <CodeBlock code={cursorConfig} language='json' />
                  <Alert>
                    <AlertCircle className='h-4 w-4' />
                    <AlertTitle>Prerequisite</AlertTitle>
                    <AlertDescription>
                      You need <code className='bg-muted px-1 rounded text-xs'>npx</code> (comes with Node.js) installed on your machine.
                      The <code className='bg-muted px-1 rounded text-xs'>mcp-remote</code> package will be downloaded automatically on first use.
                    </AlertDescription>
                  </Alert>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── Tab 3: Example Conversations ─────────────────────────────────────── */}
      <TabsContent value='examples' className='space-y-6 mt-6'>
        <p className='text-sm text-muted-foreground'>
          Once connected, you can ask questions in natural language. Here are example conversations organized by role.
        </p>

        {/* Admin Examples */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Shield className='h-5 w-5' />
              Admin Examples
              <Badge variant='default'>Full Access</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='space-y-3 rounded-lg border bg-background p-4'>
              <ChatMessage role='user'>Give me today&apos;s morning brief</ChatMessage>
              <ChatMessage role='ai'>
                <strong>Morning Briefing - JKKN College of Engineering</strong>
                <br />
                <br />
                Today&apos;s attendance: 89.2% (1,247 of 1,398 students present). 3 departments below 80% threshold.
                Billing: 12 new payments received totaling INR 4,85,000. 7 students with overdue fees totaling INR 16,60,004.98.
                Admissions: 5 new applications pending review.
              </ChatMessage>
            </div>

            <div className='space-y-3 rounded-lg border bg-background p-4'>
              <ChatMessage role='user'>How many students have overdue fees?</ChatMessage>
              <ChatMessage role='ai'>
                There are <strong>7 students</strong> with overdue fees totaling <strong>INR 16,60,004.98</strong>. The largest outstanding balance is INR 4,25,000 from a final-year B.Tech student. Would you like to see the full breakdown by department?
              </ChatMessage>
            </div>

            <div className='space-y-3 rounded-lg border bg-background p-4'>
              <ChatMessage role='user'>Show me the department health for Computer Science</ChatMessage>
              <ChatMessage role='ai'>
                <strong>Department Health - Computer Science</strong>
                <br />
                <br />
                Learners: 245 enrolled | Staff: 12 faculty (20.4:1 ratio)
                <br />
                Attendance: 91.3% average this month
                <br />
                Billing: 96% collection rate, 3 overdue accounts
                <br />
                OKR Progress: 72% on track
              </ChatMessage>
            </div>

            <div className='space-y-3 rounded-lg border bg-background p-4'>
              <ChatMessage role='user'>Are there any at-risk students?</ChatMessage>
              <ChatMessage role='ai'>
                I found <strong>3 at-risk students</strong> based on cross-module analysis:
                <br /><br />
                1. <strong>Rahul K.</strong> - Attendance: 62% (below 75% threshold), 2 overdue bills
                <br />
                2. <strong>Priya S.</strong> - Attendance: 68%, grievance filed last week
                <br />
                3. <strong>Arun M.</strong> - 3 overdue bills totaling INR 2,15,000, attendance declining
              </ChatMessage>
            </div>
          </CardContent>
        </Card>

        {/* Faculty Examples */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Briefcase className='h-5 w-5' />
              Faculty Examples
              <Badge variant='secondary'>Department Scoped</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='space-y-3 rounded-lg border bg-background p-4'>
              <ChatMessage role='user'>List students in my department</ChatMessage>
              <ChatMessage role='ai'>
                Your department (Computer Science) has <strong>245 students</strong> across 4 semesters.
                Semester 1: 68 students | Semester 3: 62 students | Semester 5: 58 students | Semester 7: 57 students.
                Would you like details for a specific semester?
              </ChatMessage>
            </div>

            <div className='space-y-3 rounded-lg border bg-background p-4'>
              <ChatMessage role='user'>What&apos;s the OKR progress for my department?</ChatMessage>
              <ChatMessage role='ai'>
                <strong>Computer Science - OKR Progress</strong>
                <br /><br />
                Objective: &quot;Improve student placement rate to 90%&quot; - <strong>On Track (78%)</strong>
                <br />
                KR1: Mock interviews completed - 85%
                <br />
                KR2: Industry partnerships signed - 60%
                <br />
                KR3: Skills certification target - 92%
              </ChatMessage>
            </div>

            <div className='space-y-3 rounded-lg border bg-background p-4'>
              <ChatMessage role='user'>Are there any at-risk students in my department?</ChatMessage>
              <ChatMessage role='ai'>
                I found <strong>1 at-risk student</strong> in your department:
                <br /><br />
                <strong>Rahul K.</strong> (Semester 5) - Attendance has dropped to 62% over the past 2 weeks. Also has 2 overdue fee payments. Recommend scheduling a counseling session.
              </ChatMessage>
            </div>
          </CardContent>
        </Card>

        {/* Student Examples */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <GraduationCap className='h-5 w-5' />
              Student Examples
              <Badge variant='outline'>Own Data Only</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='space-y-3 rounded-lg border bg-background p-4'>
              <ChatMessage role='user'>What&apos;s my billing status?</ChatMessage>
              <ChatMessage role='ai'>
                <strong>Your Billing Summary</strong>
                <br /><br />
                Total Fees: INR 1,25,000 | Paid: INR 75,000 | Pending: INR 50,000
                <br />
                Next Due: INR 25,000 by March 15, 2026
                <br />
                Status: No overdue payments. You&apos;re up to date!
              </ChatMessage>
            </div>

            <div className='space-y-3 rounded-lg border bg-background p-4'>
              <ChatMessage role='user'>Show my attendance records for this week</ChatMessage>
              <ChatMessage role='ai'>
                <strong>Your Attendance - This Week</strong>
                <br /><br />
                Monday: Present (all 5 periods)
                <br />
                Tuesday: Present (4 of 5 periods - late for Period 1)
                <br />
                Wednesday: Present (all 5 periods)
                <br />
                Thursday: Absent
                <br />
                Friday: Present (all 5 periods)
                <br /><br />
                Weekly Rate: <strong>80%</strong> | Overall: <strong>87.5%</strong>
              </ChatMessage>
            </div>

            <div className='space-y-3 rounded-lg border bg-background p-4'>
              <ChatMessage role='user'>What&apos;s the status of my grievance?</ChatMessage>
              <ChatMessage role='ai'>
                You have <strong>1 open grievance</strong>:
                <br /><br />
                <strong>#GRV-2026-0089</strong> - &quot;Library access timing extension request&quot;
                <br />
                Filed: Feb 28, 2026 | Status: <strong>In Progress</strong>
                <br />
                Assigned to: Dr. Kumar (Library Committee)
                <br />
                Last update: &quot;Under review by committee, expected resolution by March 10&quot;
              </ChatMessage>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── Tab 4: Technical Reference ───────────────────────────────────────── */}
      <TabsContent value='reference' className='space-y-6 mt-6'>
        {/* Connection Details */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Zap className='h-5 w-5' />
              Connection Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='grid gap-3 sm:grid-cols-2'>
              <div className='rounded-lg border p-3'>
                <span className='text-xs font-semibold text-muted-foreground uppercase'>Endpoint URL</span>
                <p className='text-sm font-mono mt-1'>https://www.jkkn.ai/api/mcp/mcp</p>
              </div>
              <div className='rounded-lg border p-3'>
                <span className='text-xs font-semibold text-muted-foreground uppercase'>Protocol</span>
                <p className='text-sm mt-1'>Streamable HTTP (POST with JSON-RPC 2.0)</p>
              </div>
              <div className='rounded-lg border p-3'>
                <span className='text-xs font-semibold text-muted-foreground uppercase'>Authentication</span>
                <p className='text-sm mt-1'>Bearer token in Authorization header</p>
              </div>
              <div className='rounded-lg border p-3'>
                <span className='text-xs font-semibold text-muted-foreground uppercase'>Transport</span>
                <p className='text-sm mt-1'>Stateless (each request is independent)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* JSON-RPC Examples */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Code2 className='h-5 w-5' />
              JSON-RPC Protocol Examples
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <p className='text-sm text-muted-foreground'>
              The MCP server communicates via JSON-RPC 2.0 over HTTP POST. Most AI clients handle this automatically,
              but here are the raw requests for custom integrations.
            </p>

            <div className='space-y-4'>
              <div>
                <h4 className='text-sm font-semibold mb-2'>1. Initialize Connection</h4>
                <CodeBlock code={jsonRpcInitialize} language='json' />
              </div>
              <div>
                <h4 className='text-sm font-semibold mb-2'>2. List Available Tools</h4>
                <CodeBlock code={jsonRpcListTools} language='json' />
              </div>
              <div>
                <h4 className='text-sm font-semibold mb-2'>3. Call a Tool (No Arguments)</h4>
                <CodeBlock code={jsonRpcCallTool} language='json' />
              </div>
              <div>
                <h4 className='text-sm font-semibold mb-2'>4. Call a Tool (With Arguments)</h4>
                <CodeBlock code={jsonRpcCallToolWithArgs} language='json' />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tool Parameter Schemas */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Wrench className='h-5 w-5' />
              Tool Parameter Schemas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-sm text-muted-foreground mb-4'>
              Each tool accepts specific input parameters. Expand a tool below to see its full JSON schema.
            </p>
            <Accordion type='single' collapsible className='w-full'>
              {tools.map((tool) => {
                const Icon = tool.icon;
                const schema = toolSchemas[tool.name as keyof typeof toolSchemas];
                return (
                  <AccordionItem key={tool.name} value={tool.name}>
                    <AccordionTrigger>
                      <div className='flex items-center gap-2'>
                        <Icon className='h-4 w-4 text-muted-foreground' />
                        <code className='text-xs font-mono'>{tool.name}</code>
                        <Badge variant={tool.category === 'Smart' ? 'default' : 'secondary'} className='text-xs ml-2'>
                          {tool.category}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <CodeBlock code={schema} language='json' />
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </CardContent>
        </Card>

        {/* Error Handling */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <AlertCircle className='h-5 w-5' />
              Error Handling
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <p className='text-sm text-muted-foreground'>
              Errors follow the JSON-RPC 2.0 error format. The AI client typically handles these automatically
              and shows a user-friendly message.
            </p>
            <CodeBlock code={errorExample} language='json' />
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Shield className='h-5 w-5' />
              Security Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='space-y-3'>
              <div className='flex items-start gap-3'>
                <CheckCircle2 className='h-4 w-4 text-green-500 mt-0.5 shrink-0' />
                <div>
                  <p className='text-sm font-medium'>Role-Scoped Keys</p>
                  <p className='text-xs text-muted-foreground'>
                    Each API key is tied to a specific user role. Admins see institution-wide data, faculty see department data, students see their own records.
                  </p>
                </div>
              </div>
              <div className='flex items-start gap-3'>
                <CheckCircle2 className='h-4 w-4 text-green-500 mt-0.5 shrink-0' />
                <div>
                  <p className='text-sm font-medium'>All Queries Logged</p>
                  <p className='text-xs text-muted-foreground'>
                    Every MCP tool call is logged with the API key, tool name, parameters, and timestamp for audit purposes.
                  </p>
                </div>
              </div>
              <div className='flex items-start gap-3'>
                <CheckCircle2 className='h-4 w-4 text-green-500 mt-0.5 shrink-0' />
                <div>
                  <p className='text-sm font-medium'>Key Expiration</p>
                  <p className='text-xs text-muted-foreground'>
                    API keys have configurable expiration dates. Expired keys are automatically rejected.
                  </p>
                </div>
              </div>
              <div className='flex items-start gap-3'>
                <CheckCircle2 className='h-4 w-4 text-green-500 mt-0.5 shrink-0' />
                <div>
                  <p className='text-sm font-medium'>Read-Only Access</p>
                  <p className='text-xs text-muted-foreground'>
                    The MCP server provides read-only access. No tool can create, update, or delete records.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── Tab 5: Troubleshooting ───────────────────────────────────────────── */}
      <TabsContent value='troubleshooting' className='space-y-6 mt-6'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Wrench className='h-5 w-5' />
              Common Issues
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b'>
                    <th className='text-left py-3 px-4 font-semibold'>Issue</th>
                    <th className='text-left py-3 px-4 font-semibold'>Solution</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className='border-b'>
                    <td className='py-3 px-4'>
                      <code className='bg-muted px-1 rounded text-xs'>&quot;Authentication required&quot;</code>
                    </td>
                    <td className='py-3 px-4 text-muted-foreground'>
                      Check that your API key is correct and has not expired. Ensure the key starts with <code className='bg-muted px-1 rounded text-xs'>jkkn_</code>.
                    </td>
                  </tr>
                  <tr className='border-b'>
                    <td className='py-3 px-4'>
                      <code className='bg-muted px-1 rounded text-xs'>&quot;Access denied: requires X module&quot;</code>
                    </td>
                    <td className='py-3 px-4 text-muted-foreground'>
                      Your API key does not have permission for this module. Contact your institution admin to update key permissions.
                    </td>
                  </tr>
                  <tr className='border-b'>
                    <td className='py-3 px-4'>Tools not appearing in AI client</td>
                    <td className='py-3 px-4 text-muted-foreground'>
                      Restart the AI client after adding the MCP server configuration. For Claude Code, restart the CLI session.
                    </td>
                  </tr>
                  <tr className='border-b'>
                    <td className='py-3 px-4'>Connection timeout</td>
                    <td className='py-3 px-4 text-muted-foreground'>
                      Verify the server URL is exactly <code className='bg-muted px-1 rounded text-xs'>https://www.jkkn.ai/api/mcp/mcp</code>. Check your network connection and firewall settings.
                    </td>
                  </tr>
                  <tr className='border-b'>
                    <td className='py-3 px-4'>&quot;No data returned&quot;</td>
                    <td className='py-3 px-4 text-muted-foreground'>
                      Check your role scope. Students only see their own data. Faculty see department data. Try a broader query or verify your role has access to the requested data.
                    </td>
                  </tr>
                  <tr className='border-b'>
                    <td className='py-3 px-4'>
                      <code className='bg-muted px-1 rounded text-xs'>mcp-remote</code> not found
                    </td>
                    <td className='py-3 px-4 text-muted-foreground'>
                      Ensure Node.js is installed and <code className='bg-muted px-1 rounded text-xs'>npx</code> is available in your PATH. Run <code className='bg-muted px-1 rounded text-xs'>npx mcp-remote --version</code> to test.
                    </td>
                  </tr>
                  <tr>
                    <td className='py-3 px-4'>AI not using the MCP tools</td>
                    <td className='py-3 px-4 text-muted-foreground'>
                      Try being explicit: &quot;Use the MyJKKN MCP server to check today&apos;s attendance.&quot; Some AI clients need a prompt to discover connected tools.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Terminal className='h-5 w-5' />
              Testing Your Connection
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <p className='text-sm text-muted-foreground'>
              You can test the MCP server directly using <code className='bg-muted px-1 rounded text-xs'>curl</code> to verify your API key works before configuring an AI client.
            </p>
            <CodeBlock
              code={`curl -X POST https://www.jkkn.ai/api/mcp/mcp \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer jkkn_YOUR_API_KEY" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {"name": "test", "version": "1.0"}
    }
  }'

# Expected: JSON response with server capabilities
# If you get "Authentication required", your key is invalid`}
              language='bash'
            />
          </CardContent>
        </Card>

        <Alert>
          <AlertCircle className='h-4 w-4' />
          <AlertTitle>Still having issues?</AlertTitle>
          <AlertDescription>
            File a support request through the <strong>Grievance</strong> module or contact your institution&apos;s IT administrator.
            Include the error message, the AI tool you&apos;re using, and your API key prefix (first 8 characters only).
          </AlertDescription>
        </Alert>
      </TabsContent>
    </Tabs>
  );
}
