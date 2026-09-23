# MyJKKN MCP Server - Connection Guide

## What Is This?

MyJKKN exposes an MCP (Model Context Protocol) server that lets you connect your AI assistant
(Claude, ChatGPT, Cursor, etc.) to query JKKN institutional data through natural language.

## Prerequisites

1. A MyJKKN key: your own personal key (`jkkn_pk_…`, made on **Connect an outside AI**) or an administrator key (`jkkn_…`)
2. A paid AI platform account (Claude Pro/Max/Team, ChatGPT Plus/Pro, etc.)

## Getting Your API Key

There are two kinds of key. Both use the same address and the same `Authorization: Bearer <key>` header.

### Your own key (personal key) — make it yourself

Anyone who can open the **AI Assistant** (permission `ai_query.view`) can make their own key:

1. In MyJKKN open **Connect an outside AI** (sidebar, under AI Assistant — `/ai-query/connect`).
2. Give the key a name (for example "Claude on my laptop"), choose 30, 60 or 90 days, and press **Make key**.
3. **Copy the key straight away.** It starts with `jkkn_pk_` and is shown only once. MyJKKN keeps only a fingerprint (SHA-256) of it.
4. Paste it into your AI as described below.

What a personal key can do:

- It sees **only what you can see** in MyJKKN. Every tool runs as you, through your own sign-in, with the same rules the AI Assistant uses. It never uses the system's all-access key.
- It can **only read**. Tools that send, mark, change or manage anything are never offered through this door.
- It offers the tools listed in MyJKKN's AI tool catalog (`public.ai_tool_catalog`, audience `door`) — the same list the AI Assistant uses, so a new ability added there reaches your outside AI too. The 12 `myjkkn_*` tools in the table below are for administrator keys only.
- It lasts at most **90 days**, and you can have at most **3 working keys** at a time.
- You can **turn a key off** on the same page at any time; it stops working at once. If you lose the AI Assistant permission, your keys stop working too.
- Every tool call is recorded (which key, which tool, when, and whether it worked — never the data), and each key is limited to 60 requests a minute.
- A personal key does **not** work on the other MyJKKN APIs (`/api/b2a/*`, `/api/api-management/*`); only here.

Treat it like a password: paste it only into your own AI app, never into a chat, email or document.

### Administrator key

An administrator can issue an institution key in **System → API Keys**. These keys are scoped by role:
- **Admin keys**: See all institution data
- **Faculty keys**: See your department's data
- **Learner keys**: See only your own data

## Connecting from Gemini CLI

Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "myjkkn": {
      "httpUrl": "https://www.jkkn.ai/api/mcp/mcp",
      "headers": { "Authorization": "Bearer jkkn_pk_YOUR_KEY" }
    }
  }
}
```

## Connecting from Zoho Zia

If your Zoho plan lets Zia connect to outside tools (MCP servers), add a server with the address
`https://www.jkkn.ai/api/mcp/mcp` and a header `Authorization: Bearer jkkn_pk_YOUR_KEY`.
The exact menu depends on your Zoho product and plan.

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
| "This key is not valid, has been turned off, or has expired" | Personal key: make a new one on **Connect an outside AI** |
| "Too many requests" | Wait a minute; each key allows 60 requests a minute |
| "Access denied: requires X module" | Your key doesn't have permission for that module. Contact admin. |
| Tool not appearing | Restart your AI client after adding the MCP server |
| Connection timeout | Check that the server URL is correct and accessible |
