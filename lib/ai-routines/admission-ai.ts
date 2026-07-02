import { type AIRoutine } from './types';
// Populated 2026-07-01 from the parallel discovery swarm (deep-read of jicate/main).
export const ADMISSION_AI_ROUTINES: AIRoutine[] = [
  {
    "id": "admission-insights-generate",
    "name": "Admission CRM AI Insights Generator",
    "category": "admission-ai",
    "type": "endpoint",
    "schedule": "On demand",
    "triggerPath": "/api/admission/insights/generate",
    "callsClaude": true,
    "whatItDoes": "Reads every admission lead for one institution, computes pipeline health stats (hot leads with no recent contact, stale leads, near-conversion, overdue follow-ups, weekly trend), then asks Claude to write 5-8 prioritized, actionable CRM insights and saves them for the admission Insights dashboard.",
    "configKnobs": "MODEL=claude-sonnet-4-5, MAX_TOKENS=4096, HOT_LEAD_NO_CONTACT_DAYS=3, STALE_LEAD_DAYS=7, OVERDUE_FOLLOWUP_DAYS=7, WEEKLY_TREND_WINDOW_DAYS=7, PRIOR_WEEK_WINDOW_DAYS=14, MIN_SOURCE_LEADS_SHOWN=3, LEAD_ID_SAMPLE_CAP=20, INSIGHT_COUNT_TARGET=5-8, EXPIRES_HOURS_CRITICAL=24, EXPIRES_HOURS_GENERAL=72",
    "sideEffects": "DB write (regenerate-guarded): DELETEs all existing non-dismissed rows in admission_ai_insights for the institution, then INSERTs the newly generated insight rows. No emails/WhatsApp/notifications sent.",
    "safeToManualTrigger": true,
    "notes": "POST only. Requires a logged-in user, an institutionId in the JSON body, and institution access (verified via role_has_institution_access RPC — rejects other tenants' IDs). Needs CLAUDE_API_KEY (or ANTHROPIC_API_KEY) set. Uses the service-role client to bypass RLS for the lead read + insight write. This IS the live path: admission Insights page -> AIInsightsService.generateInsights -> this route. Idempotent regen (delete-then-insert), so re-running just refreshes the insight set; honest-empty if Claude returns 0 insights."
  },
  {
    "id": "ai-query",
    "name": "AI Query Assistant (natural-language data)",
    "category": "admission-ai",
    "type": "endpoint",
    "schedule": "On demand (on submit)",
    "triggerPath": "/api/ai-query",
    "callsClaude": true,
    "whatItDoes": "Answers a user's plain-English question about learners, facilitators, billing, admissions and analytics by letting Claude call a set of read-only data tools in a loop, then returns a natural-language answer plus tables/charts. Enforces JKKN terminology in responses.",
    "configKnobs": "MODEL=claude-sonnet-4-20250514, MAX_TOKENS=4096, MAX_TOOL_RESULT_CHARS=80000, MAX_DATA_RECORDS=100 (per-user rate limit + query-count are delegated to AIQueryService, not hardcoded here)",
    "sideEffects": "Writes an audit row via AIQueryService.logQuery on both success and error, and increments a per-user rate-limit/query counter (incrementQueryCount). The underlying data is READ-ONLY: every wired tool is a get_*/search_*/export_csv read. A send_notification tool is DEFINED in the tool list but has NO executor case (falls through to default -> TOOL_NOT_FOUND), so no notification is ever actually sent. No outbound human messages.",
    "safeToManualTrigger": true,
    "notes": "POST requires a JSON body with {message, conversation_id?} and an authenticated user; enforces a per-user rate limit (checkRateLimit) before calling Claude. Needs CLAUDE_API_KEY (or ANTHROPIC_API_KEY). The agentic tool-use loop runs `while (response.stop_reason === 'tool_use')` with NO explicit max-iteration cap — bounded only by Claude deciding to stop. Interactive UI lives at /ai-query (and /ai-query/admin). Manual-run writes only an audit log + rate counter, so it is safe to fire, but it needs a real question in the body to do anything."
  },
  {
    "id": "admission-analytics-ai-service",
    "name": "Admission Analytics AI Insights (service, dormant)",
    "category": "admission-ai",
    "type": "service",
    "schedule": "On demand",
    "triggerPath": "",
    "callsClaude": true,
    "whatItDoes": "Library class (AdmissionAIService.generateInsights): takes a full admissions analytics snapshot and asks Claude for an executive summary plus key findings, recommendations, predictions, trends, risk assessment, opportunities and competitive insights as structured JSON.",
    "configKnobs": "MODEL=claude-sonnet-4-5, MAX_TOKENS=4096, requires CLAUDE_API_KEY (rejects placeholder 'your-api-key-here'); prompt caps: string fields <500 chars, response <6000 tokens",
    "sideEffects": "Read-only — returns an insights object to the caller; performs no DB writes and sends no messages.",
    "safeToManualTrigger": false,
    "notes": "DORMANT in production: this class is NOT imported by any route, component or hook on jicate/main (grep found zero callers), and it has no HTTP endpoint. The live admission Insights feature uses a DIFFERENT service — ai-insights-service.ts -> /api/admission/insights/generate — not this class. File: lib/services/admission/admission-ai-service.ts. Pure compute so it would be safe to run, but there is no operator trigger surface."
  },
  {
    "id": "agentic-query-service",
    "name": "Agentic CRM Query (service, dormant)",
    "category": "admission-ai",
    "type": "service",
    "schedule": "On demand",
    "triggerPath": "",
    "callsClaude": true,
    "whatItDoes": "Library class (AgenticQueryService.processQuery): turns a natural-language admissions-CRM question into a structured intent, builds a filtered Supabase query over admission_leads/counselors/activities/admissions, runs it, then asks Claude to summarize the results and pick a visualization type. Emits step-by-step progress (understanding/planning/executing/analyzing/responding).",
    "configKnobs": "MODEL=claude-3-5-haiku-20241022 (intent parse MAX_TOKENS=1024, summary MAX_TOKENS=256), DEFAULT_LIST_LIMIT=100, DEFAULT_CONFIDENCE=0.8 (parse-fail fallback=0.5), HISTORY_DEFAULT_LIMIT=10, DATA_PREVIEW_CHARS=2000, TABLE_ALLOWLIST=[admission_leads, admission_counselors, admission_lead_activities, admissions]",
    "sideEffects": "The query path is read-only SELECTs run through the browser Supabase client under the user's own RLS session. A separate saveQueryToHistory method INSERTs into admission_query_history only if a caller invokes it. No outbound messages.",
    "safeToManualTrigger": false,
    "notes": "DORMANT in production: the class is not imported anywhere on jicate/main, and the endpoint its hook (hooks/admission/use-agentic-query.ts) targets — /api/ai/agentic-query — does NOT exist on jicate/main (no app/api/ai/ dir). Specs also flag its admission_query_history table as not yet created. It uses createClientSupabaseClient (BROWSER client), so it is designed to run client-side under the user's session, not from a server cron. File: lib/services/admission/agentic-query-service.ts. No operator trigger surface."
  },
  {
    "id": "admission-ai-response-service",
    "name": "Admission Reply Drafter (service; AI path dormant)",
    "category": "admission-ai",
    "type": "service",
    "schedule": "On demand",
    "triggerPath": "",
    "callsClaude": true,
    "whatItDoes": "Library class (AIResponseService): drafts 3 suggested counselor reply messages (email/WhatsApp/SMS) for a lead based on funnel stage and recent interactions. It also fills {{variables}} in message templates with lead data — but that template method is plain string substitution with no AI.",
    "configKnobs": "MODEL=claude-3-5-haiku-20241022, MAX_TOKENS=2048, TEMPERATURE=0.7, RECENT_INTERACTIONS_CAP=5, DEFAULT_CONFIDENCE=0.8, SMS_CHAR_LIMIT=160; requires CLAUDE_API_KEY (rejects placeholder 'your-api-key-here')",
    "sideEffects": "Read-only — it GENERATES draft reply text only. It does NOT send any email/WhatsApp/SMS and writes nothing to the database (a human counselor reviews and sends separately).",
    "safeToManualTrigger": false,
    "notes": "The Claude drafting path (generateResponse/getSuggestedReplies) is DORMANT: the hook useGenerateResponse POSTs to /api/ai/generate-response, which does NOT exist on jicate/main (no app/api/ai/ dir). The only LIVE method is personalizeTemplate — pure {{var}} substitution, NO Claude call — used by usePersonalizeTemplate in the CRM template editor. So today the service does not actually invoke Claude in production. Even when wired it only drafts text and never sends, so it is safe. File: lib/services/admission/ai-response-service.ts."
  }
];
