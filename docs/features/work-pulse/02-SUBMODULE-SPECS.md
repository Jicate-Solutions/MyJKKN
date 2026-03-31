# Work Pulse — Submodule Specs

## Submodule 1: Weekly Pulse (My Pulse Page)

**Route:** `/work-pulse`
**Purpose:** Personal dashboard + 2-question weekly form

### User Flow
1. User lands on My Pulse page
2. Sees 4 stat cards (Total Pulses, Patterns Spotted, Agents Originated, This Month)
3. Sees badge display if earned (Pattern Spotter/Agent Originator/Impact Pioneer)
4. If not submitted this week → sees Weekly Pulse form (2 questions)
5. After submission → form collapses to "submitted" confirmation + InstantHelpCard shows pattern matches
6. Below form: Recent Entries list (last 5)
7. If pending micro-interviews exist → inline response form
8. HOD/Principal/SuperAdmin → sees ComplianceTab (department submission rates)

### Files
| File | Type | Lines | Purpose |
|------|------|-------|---------|
| `page.tsx` | Server Component | 144 | Data fetching + layout |
| `weekly-pulse-form.tsx` | Client Component | 208 | react-hook-form + zod, 2 questions |
| `compliance-tab.tsx` | Client Component | 123 | Department submission tracking |
| `micro-interview-response.tsx` | Client Component | 100 | RadioGroup + textarea inline |
| `instant-help-card.tsx` | Client Component | 89 | Post-submit pattern matching |
| `badge-display.tsx` | Client Component | 66 | Achievement badges |
| `pulse-actions.ts` | Server Actions | 108 | submit, quickSubmit, respond, instantHelp |
| `get-pulse-stats.ts` | Data Fetcher | 10 | Personal stats |
| `get-pulse-entries.ts` | Data Fetcher | 12 | Entry history |

### Key Logic
- **Upsert on (user_id, week_of)** — one entry per user per week, re-submit overwrites
- **InstantHelp** — queries wp_patterns matching submitted category, returns count + ETA
- **Badges** — Pattern Spotter (10+ pattern matches), Agent Originator (1+ deployed), Impact Pioneer (50+ hrs saved)
- **ComplianceTab** — visible only for roles: hod, principal, super_admin, administrator

---

## Submodule 2: Agent Opportunity Board

**Route:** `/work-pulse/agents`
**Purpose:** Ranked list of automation opportunities grouped by tier

### User Flow
1. User sees 4 stat cards (Total Opportunities, S-Tier, In Pipeline, Training Wins)
2. Patterns grouped by tier: S (red), A (orange), B (yellow), C (gray)
3. Each pattern shows: name, people affected, hours wasted, feasibility, solution type, status
4. PatternCard expands on click for full details
5. Training Wins section after tiers
6. "Impact This Quarter" footer with deployed agents + hours saved

### Files
| File | Type | Lines | Purpose |
|------|------|-------|---------|
| `agents/page.tsx` | Server Component | 236 | Data fetching + tier layout |
| `pattern-card.tsx` | Client Component | 106 | Expandable pattern card |
| `tier-section.tsx` | Client Component | 53 | Tier grouping wrapper |
| `get-patterns.ts` | Data Fetcher | 14 | Pattern list + impact summary |

### Key Logic
- **Tier thresholds** — S: impact_score 100+, A: 50-99, B: 20-49, C: <20
- **All authenticated users** can see all patterns (full transparency per spec)
- **Impact footer** fetches from WorkPulseService.getImpactSummary()

---

## Submodule 3: Impact Dashboard

**Route:** `/work-pulse/impact`
**Purpose:** Deployed agents + measured hours saved + flywheel metrics

### User Flow
1. User sees 5 summary cards (Agents Deployed, Hours Saved/Week, Training Wins, People Helped, Workflows Absorbed)
2. Deployed agents table with per-agent metrics (pre/post hours, people using, JICATE product flag)
3. Flywheel Health section with trend cards (Coverage Growth, Hours Saved, Workflows)

### Files
| File | Type | Lines | Purpose |
|------|------|-------|---------|
| `impact/page.tsx` | Server Component | 298 | Data fetching + dashboard layout |
| `get-impact.ts` | Data Fetcher | 9 | Impact metrics |

### Key Logic
- **hours_saved_weekly** — GENERATED column (pre_hours - post_hours), computed by DB
- **Flywheel trends** — month-vs-month comparison placeholders (full implementation needs historical data)

---

## Submodule 4: AI Analysis Pipeline

**Route:** `POST /api/work-pulse/analyze`
**Purpose:** Weekly Claude AI pattern clustering + opportunity scoring

### Flow
1. Cron triggers every Sunday midnight
2. Fetches: pulse entries (past week), user_activity_logs (behavioral signals), existing patterns, micro-interview responses
3. Calls Claude API (Sonnet) with structured prompt
4. Claude returns JSON array of patterns with scores
5. Upserts into wp_patterns
6. For patterns classified as 'training' → creates targeted notifications
7. For entries flagged as platform bugs → auto-creates bug report

### Files
| File | Lines | Purpose |
|------|-------|---------|
| `analyze/route.ts` | 557 | Claude API analysis + DB writes |

### Key Logic
- **Impact Score** = People × Hours × Feasibility / BuildEffort
- **Timeout** — 60s AbortController on Claude API call
- **Auth** — x-api-key header OR super_admin session
- **Growing/shrinking detection** — Claude instructed to flag week-over-week trends

---

## Submodule 5: Notification Engine

**Route:** `POST /api/work-pulse/notify?type=<type>`
**Purpose:** 7 scheduled notification types for engagement loop

### Notification Types
| Type | Schedule | Target |
|------|----------|--------|
| `pulse_reminder` | Friday 4 PM | Non-submitters (active users) |
| `pulse_followup` | Saturday 10 AM | Still non-submitters |
| `pattern_building` | Event-driven | Users who reported matching category |
| `agent_deployed` | Event-driven | Affected users |
| `training_win` | Event-driven | Affected users |
| `hod_compliance` | Monday 9 AM | HODs with departments <50% submission |
| `micro_interview` | Event-driven | 30% random sample, 10+ reporters, 1/user/month |

### Files
| File | Lines | Purpose |
|------|-------|---------|
| `notify/route.ts` | 704 | All 7 notification handlers |

### Key Logic
- **Auth** — x-api-key only (cron)
- **SQL injection prevention** — category validated against WP_CATEGORIES allowlist
- **Micro-interview limit** — DB trigger + code check (belt and suspenders)

---

## Submodule 6: Tamil Translation

**Route:** `POST /api/work-pulse/translate`
**Purpose:** Tamil→English translation via Claude API

### Files
| File | Lines | Purpose |
|------|-------|---------|
| `translate/route.ts` | 218 | Tamil detection + Claude translation + DB update |

### Key Logic
- **Tamil detection** — Unicode range `\u0B80-\u0BFF`
- **DB update** — accepts optional `pulse_entry_id` + `field` to update `_en` columns directly
- **Auth** — any authenticated user (session)
- **API key guard** — returns 503 if ANTHROPIC_API_KEY not configured
