# MyJKKN MCP Server - Connection Guide

## What Is This?

MyJKKN exposes an MCP (Model Context Protocol) server that lets you connect your AI assistant
(Claude, ChatGPT, Cursor, etc.) to query JKKN institutional data through natural language.

## Prerequisites

1. A MyJKKN API key (`jkkn_xxxxxxxxxxxx` format)
2. A paid AI platform account (Claude Pro/Max/Team, ChatGPT Plus/Pro, etc.)

## Getting Your API Key

Contact your institution administrator to generate an API key for you.
Keys are scoped to your role:
- **Admin keys**: See all institution data
- **Faculty keys**: See your department's data
- **Student keys**: See only your own data

## Connecting from Claude Desktop / Claude.ai

1. Open Claude Desktop
2. Go to **Settings > Connectors**
3. Click **Add Connector**
4. Enter:
   - **Name**: MyJKKN
   - **URL**: `https://www.jkkn.ai/api/mcp/mcp`
   - **Auth**: Bearer Token > paste your `jkkn_xxxx` key
5. Click **Save**

You can now ask Claude questions like:
- "What's today's morning brief?"
- "Show me overdue bills"
- "List students in the Computer Science department"

## Connecting from ChatGPT

1. Open ChatGPT
2. Go to **Settings > Connectors > Advanced > Developer Mode**
3. Add URL: `https://www.jkkn.ai/api/mcp/mcp`
4. Auth: Bearer token > paste your `jkkn_xxxx` key
5. Save

## Connecting from Claude Code

Add to your `.mcp.json` or project configuration:

```json
{
  "mcpServers": {
    "myjkkn": {
      "url": "https://www.jkkn.ai/api/mcp/mcp",
      "headers": {
        "Authorization": "Bearer jkkn_YOUR_API_KEY"
      }
    }
  }
}
```

## Connecting from Cursor / Other MCP Clients

Use the `mcp-remote` proxy for clients that only support stdio:

```json
{
  "mcpServers": {
    "myjkkn": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://www.jkkn.ai/api/mcp/mcp",
        "--header", "Authorization: Bearer jkkn_YOUR_API_KEY"
      ]
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `myjkkn_morning_brief` | Daily institutional overview (attendance, billing, admissions, staff) |
| `myjkkn_query_attendance` | Query attendance records by date |
| `myjkkn_query_billing` | Query bills, filter by status/due date |
| `myjkkn_query_learners` | Query student profiles |
| `myjkkn_query_staff` | Query staff records |
| `myjkkn_query_grievance` | Query grievance/service requests |
| `myjkkn_query_admission` | Query admission applications |
| `myjkkn_query_okr` | Query OKR objectives |
| `myjkkn_query_organizations` | Query institutions, departments, courses |
| `myjkkn_at_risk_learners` | Cross-module at-risk student analysis |
| `myjkkn_department_health` | Cross-module department metrics |

## Example Conversations

**Admin asking about institution health:**
> "Give me today's morning brief"
> "How many students have overdue fees?"
> "Show me the department health for Computer Science"

**Faculty checking their department:**
> "List my department students"
> "Are there any at-risk students in my department?"
> "What's the OKR progress for my department?"

**Student checking their own data:**
> "What's my billing status?"
> "Show my attendance records for this week"
> "What's the status of my grievance?"

## Security

- Your API key determines what data you can see
- All queries are logged for audit purposes
- Keys expire and must be renewed periodically
- Never share your API key with others

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Authentication required" | Check your API key is correct and not expired |
| "Access denied: requires X module" | Your key doesn't have permission for that module. Contact admin. |
| Tool not appearing | Restart your AI client after adding the MCP server |
| Connection timeout | Check that the server URL is correct and accessible |
