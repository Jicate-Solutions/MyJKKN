# Admission Workflow — Full Funnel Reference (Lead Management · Social Media · Communication)

> **This is the master document** for the admission module. It covers the complete funnel from first touch to enrolled learner.
> **Chains into:** [admission-billing-workflow.md](./admission-billing-workflow.md) (conceptual billing flow) and [admission-billing-page-reference.md](./admission-billing-page-reference.md) (billing pages). Conversion (Part F) is the hand-off point to those docs.
> **Format:** every page has an **End-User Reference** (what you see/do) and a **Technical Reference** (files, components, APIs, services, hooks, tables, permissions).
> **Audience tags:** 🧑‍💼 Staff/Counselor · 👔 Manager/Admin · 🛡️ Super-admin · 🌐 Public/Prospect.
> **Last updated:** 2026-06-24

---

## 0. The funnel at a glance

```
 CAPTURE                MANAGE                 COMMUNICATE              CONVERT            (BILLING)
 ───────                ──────                 ───────────              ───────            ─────────
 manual form     ┐      leads list      ┐      WhatsApp 1:1     ┐      bridge/convert     → see billing
 gate-entry      │      lead detail     │      chatbot          │      → learners_profiles    docs
 expo capture    ├─▶    work queue      ├──▶   broadcast/SMS    ├──▶   (lifecycle=enquiry)
 inbound webhook │      scoring + mood  │      email            │
 Meta Lead Ads   │      status lifecycle│      voice / calls    │
 bulk upload     ┘      allocation      ┘      drip + reminders ┘
                                               (consent gates all)
 ── all doors write to one table: admission_leads ──
```

**Two scopes, one model.** `admission_statuses.scope` is either `lead` (funnel stages: new → contacted → … → enrolled/lost) or `learner` (post-conversion lifecycle: enquiry → admitted → active). The crossover happens at conversion (Part F).

**Institution-agnostic.** Every entity is `institution_id`-scoped; super-admins/global users get a college filter. CAS colleges resolve via `counselling_code` siblings (see project memory).

---

# Part A — Capture (how leads enter)

All six doors converge on `admission_leads` and record a touch in `admission_lead_sources_captured`.

## A1. Manual new-lead form 🧑‍💼

**Route:** `/admission/leads/new` · **File:** `app/(routes)/admission/leads/new/page.tsx`

### End-User
A full entry form: name, email, phone, alternate phone, DOB, gender, parent name/phone, program, admission year, **source**, and **referral** (consultant / student / faculty + who referred). Save creates the lead.

### Technical
| | |
|---|---|
| Services | `LeadService.createLead()`, `ConsultantService`, `CounselorDailyViewService` |
| Hooks | `useActiveLeadSources()`, `AdmissionYearSelect` |
| Tables | `admission_leads`, `admission_lead_sources_master` |
| Permission | `admission.leads.create` |

## A2. Gate-entry kiosk 🧑‍💼

**Route:** `/admission/gate-entry` · **File:** `app/(routes)/admission/gate-entry/page.tsx`

### End-User
A high-throughput walk-in capture screen: first name (auto-focus), last name, numeric phone, program, admission year (pre-filled to current), source radio (walk-in / referral). Form **auto-resets ~1.5s** after each capture; a counter badge tracks the session. Survives tab switches.

### Technical
| | |
|---|---|
| RPC | `capture_gate_entry_lead()` → `{ lead_id, capture_id, action: created\|merged, reactivated }` |
| Pattern | `useFormDraftObject()` persists in-flight values across tab switches |
| Tables | `admission_leads`, `admission_lead_sources_captured` |
| Permission | `admission.gate_entry.create` |

## A3. Expo / education-fair capture 🧑‍💼

**Route:** `/admission/marketing/expos/[id]/capture` · **File:** `…/expos/[id]/capture/page.tsx`

### End-User
On-ground rapid capture at a fair stall: `RapidCaptureForm` (name, phone, program or "undecided", optional email/referral), a live `CaptureStatsBar`, and a `BulkCaptureDialog` for CSV batches. **Auto-sends a WhatsApp welcome** on capture (template `exhibition_thankyou`). Access is by **expo-team membership**, not a permission key.

### Technical
| | |
|---|---|
| Services | `ExpoService`, `StallService`, `ExpoWhatsAppService.sendExpoWelcome()` |
| Hooks | `useExpoEvent()`, `useExpoTeamAccess()` |
| Draft key | `expo-capture-${eventId}` |
| Tables | `expo_events`, `expo_event_stalls`, `expo_event_team_members`, `admission_leads`, `admission_lead_sources_captured` |
| Limit | WhatsApp daily cap from `whatsapp_send_limits` (default ~950), respects `wa_opt_in` |

## A4. Inbound webhook (3rd-party forms) 🌐

**Endpoint:** `POST /api/admission/leads/inbound` · **File:** `app/api/admission/leads/inbound/route.ts`

### End-User
No UI — external landing pages / partner forms POST here with a Bearer API key. Returns `{ success, lead_id, is_duplicate, reference }`.

### Technical
| | |
|---|---|
| Auth | Bearer key from `api_keys` |
| Service | `IntegrationService.processInboundLead()` (validates phone, dedupes by phone, logs) |
| Tables | `api_keys`, `admission_integrations`, `admission_leads`, `admission_integration_logs` |
| Payload | `InboundLeadPayload` (source, name, phone, email, interested_program, referral, custom_fields) |

## A5. Meta Lead Ads ingestion 🌐 / 👔

**Admin route:** `/admission/social/lead-ads` · **File:** `app/(routes)/admission/social/lead-ads/page.tsx`

### End-User (admin)
View synced **Lead-Gen forms**, edit **field mappings** (Meta question → lead column, with transforms: trim / lowercase / phone_e164 / split_first_name), set a **default institution** per form, fire **test leads**, and inspect recent **webhook events** and **received leads** end-to-end.

### Technical
| | |
|---|---|
| Importer | `meta-lead-importer.ts` → `importMetaLead()`: upsert event → resolve form/mappings/institution → hydrate via Graph API → whitelist-map → `LeadService.captureLead()` → status `imported\|merged\|failed\|skipped` |
| CAPI | `lead-capi-hooks.ts`: `fireLeadCreatedCapi()` / `fireLeadConvertedCapi()` (server-side Meta Conversions API; dedup `eventId='lead-{id}'`) |
| Tables | `meta_lead_forms`, `meta_leadgen_events`, `meta_lead_field_mappings`, `meta_capi_events`, `admission_leads.meta_leadgen_event_id` (FK, migration 20260708) |
| Source tag | all Meta leads `source='facebook_ads'` |
| Permission / policy | `social.lead_ads:view`; policies `meta.capi.is_enabled`, `meta.capi.pixel_id`, `meta.capi.access_token_ref` |

## A6. Marketing bulk upload 👔

**Route:** `/admission/marketing/database` · **File:** `app/(routes)/admission/marketing/database/page.tsx`

### End-User
Search/browse bulk-imported marketing leads; upload an Excel file mapped to the schema. Server inserts in batches of 100.

### Technical
| | |
|---|---|
| API | `POST /api/admission/marketing/leads/bulk-upload` (service-role, 60s max, returns inserted/failed/errors) |
| Table | `marketing_leads_database` (student/father name, mobile, group, school, district, `upload_batch_id`) |
| Permission | `admission.marketing:view` |

---

# Part B — Manage (work the lead)

## B1. Leads list 🧑‍💼/👔

**Route:** `/admission/leads` · **File:** `app/(routes)/admission/leads/page.tsx` (+ `_components/leads-data-table.tsx`)

### End-User
The master worklist. Filter by **stage, priority (hot/warm/cold), source, counselor, expo event, program, institution, staleness**. Columns show name (+ hot/priority icons), contact, programs, source badge, overdue badge, assigned counselor, created date. Row actions: View, Mark Hot/Priority, Mark Lost (soft delete), Permanent Delete, **Move to Account**. Bulk delete supported. Mobile card layout mirrors the table.

### Technical
| | |
|---|---|
| API | `GET /api/admission/leads/list` (service-role, bypasses RLS cascade) |
| Hooks | `useLeadStageOptions()`, `useActiveLeadSources()`, `useCounselorsList()`, `useExpoEvents()`, `useInstitutionsWithAccess()` |
| Refresh | window event `admission-leads-changed` bumps refetch key |
| Tables | `admission_leads`, `admission_counselors`, `admission_lead_sources_master`, `admission_statuses` (scope=lead) |
| Permission | `admission.leads.view`; bulk delete `admission.leads.delete` |

## B2. Lead detail 🧑‍💼

**Route:** `/admission/leads/[id]` · **File:** `app/(routes)/admission/leads/[id]/page.tsx`

### End-User
The single-lead cockpit. **Header** (name, stage, hot/priority, contact). **Quick Actions bar**: Log Call, Send WhatsApp, Send SMS, Add Note, Refer, Show Student QR. **Score cards** (total/engagement/quality + category). Tabs:
- **Details** — edit all fields + stage (allowed transitions only), next follow-up, hot/priority toggles.
- **Activity** — timeline of notes/calls/stage changes.
- **Calls** — call history + voice-memo sentiment.
- **Communication** — SMS/WhatsApp/email logs.
- **Journey** — funnel-stage cascade over time.

If converted, a **handover banner** links to `/learners/enquiries/[id]`.

### Technical
| | |
|---|---|
| API | `GET /api/admission/leads/[id]` (service-role) |
| Hooks | `useEnhancedTimeline()`, `useLeadCommunicationHistory()`, `useLeadCascadeHistory()`, `useLeadMutations()`, `useActivityMutations()` |
| Dialogs | `LogCallDialog`, `SendPersonalMessageDialog`, `ShowStudentQRButton`, note dialog, referral pickers |
| Tables | `admission_leads`, `admission_lead_activities`, `admission_call_logs`, communication logs, `learners_profiles` (FK) |
| Permission | `admission.leads.view` (+ `.edit` to mutate) |

## B3. Counselor work queue 🧑‍💼

**Route:** `/admission/leads/work` · **File:** `app/(routes)/admission/leads/work/page.tsx`

### End-User
A focused, one-lead-per-screen daily queue for the logged-in counselor. Sticky header with position ("3 of 12") and skip/next. Each card: contact, stage, programs, next follow-up, last-3-activity snippet. Mobile action bar: Call / WhatsApp / Note / Refer. Paginate to advance.

### Technical
| | |
|---|---|
| Hook | `useLeadWorkQueue()` (leads where `admission_counselors.user_id = current user`) |
| Components | `LeadCard`, `TimelineSnippet`, `MobileActions`, `BottomNav` |
| Tables | `admission_leads`, `admission_counselors`, `admission_lead_activities`, `admission_call_logs` |
| Permission | `admission.leads.view` |

## B4. Lead scoring & mood 👔

**Surface:** score cards on B2; mood KPIs on dashboard.

### End-User
**Scoring** ranks leads (total/engagement/quality + recommended action). **Mood** reads counselor voice-memo sentiment to surface anxious leads, today's sentiment split, and top concerns.

### Technical
| | |
|---|---|
| Services | `LeadScoringEngineService.calculateLeadScore()`; `LeadMoodService` (`getTodayKPIs`, `getMoodDistribution`, `getTopConcerns`, `getAnxiousLeads`) |
| Mood source | `admission_call_logs.memo_*` columns (`memo_analyze_status='completed'`), Whisper + GPT-4o-mini on 30s memos |
| Tables | `admission_lead_scores`, `admission_call_logs` |

## B5. Status lifecycle 👔/🛡️

**Route:** `/admission/settings/statuses` · **File:** `app/(routes)/admission/settings/statuses/page.tsx` · **Types:** `types/admission-status.ts`

### End-User
Define lead **stages** and learner **statuses**. Per status: code, label, color, sort, flags. Learner-scope flags drive automation: `is_seat_filled` (Seat-Filled KPI + gates "Move to Account"), `fee_paid_threshold_percent` (auto-gates admitted→active), `gates_login`.

### Technical
| | |
|---|---|
| Type | `AdmissionStatus` (scope `lead\|learner`, code, label, color, `is_terminal`, `is_seat_filled`, `fee_paid_threshold_percent`, `gates_login`) |
| Table | `admission_statuses` |
| Permission | `admission.settings.statuses.view` (+ manage) |

---

# Part C — Allocation & routing 👔/🛡️

How a captured lead reaches the right counselor.

## C1. Allocation workspace 👔

**Route:** `/admission/counselors/team/allocation` → `/[id]` · **File:** `…/team/allocation/[id]/page.tsx`

### End-User
Pick a **source**, see per-counselor stats (leads, conversions, progression, last-assigned) and a distribution view. The **Distribute panel** lists unassigned leads → pick counselor → bulk assign.

### Technical
| | |
|---|---|
| Services | `SourceMasterService.getById()`, `LeadDistributionService.get()` (RPC `get_source_distribution`), `.listUnassigned()` |
| Tables | `admission_lead_sources_master`, `admission_leads`, `admission_counselors`, `admission_lead_assignments` |
| Permission | `admission.counselors.view` |

## C2. Assignment rules 👔

**Route:** `/admission/counselors/team/rules` · **File:** `…/team/rules/page.tsx`

### End-User
Priority-ordered automation rules: criteria (program/source/city/score…) → action (assign to counselor / pool / round-robin + fallback). Create/edit/toggle/delete.

### Technical
| | |
|---|---|
| Service | `AssignmentRulesService` (`get`, `getActive`, `create`, `update`, `delete`) |
| Rule types | `program \| round_robin \| location \| score \| source \| workload` |
| Table | `admission_assignment_rules` (criteria/action JSON, priority, is_active) |

## C3. Routing config 🛡️

**Route:** `/admission/counselors/admin/routing-config` · **File:** `…/admin/routing-config/page.tsx`

### End-User (super-admin)
All policy as config rows: `cap_per_run`, `cascade_after_minutes`, `flush_interval_minutes`.

### Technical
| | |
|---|---|
| Service | `CounselorRoutingConfigService` (`list`, `updateInteger`) |
| Table | `counselor_routing_config` (SECURITY DEFINER access) |

---

# Part D — Social media channels

## D1. Instagram DM inbox 🧑‍💼

**Route:** `/admission/inbox/instagram` · **File:** `app/(routes)/admission/inbox/instagram/page.tsx`

### End-User
Two-pane inbox (conversation list + thread). Filter Open (within 24h window) / Closed. Reply composer **disables when the 24h window expires**. A banner shows until Meta grants Advanced Access.

### Technical
| | |
|---|---|
| Service / hooks | `ig-dm-service.ts`; `useIgDmConversations` (poll 30s), `useIgDmMessages` (poll 15s), `useSendIgDmReply` |
| Window guard | HTTP 422 → `{ kind: 'outside_window', hoursElapsed }` |
| Table | `ig_dm_conversations` (links `lead_id`) |
| Policy | `ig.dm.is_enabled` |

## D2. Instagram & Facebook account health 👔

**Routes:** `/admission/social/instagram`, `/admission/social/facebook`

### End-User
Tables of connected IG accounts / FB pages with followers, last-post, health status, and **Discover** (pull new assets from Meta Business Manager). FB page rows drill into health detail.

### Technical
| | |
|---|---|
| APIs | `/api/social/instagram/*`, `/api/social/facebook/page-health` |
| Permissions | `social.instagram:view`, `social.facebook:view` |

## D3. Campaigns + ROI 👔

**Routes:** `/admission/marketing/campaigns` · `/[id]` · `/new`

### End-User
List campaigns (scope, source, status, budget); filter and bulk archive/pause. Detail shows the **ROI funnel** (sent → delivered → opened → clicked → applications → enrollments) with per-link cost/attribution. Create wizard sets scope (institution/global), source, and (for admission category) program + admission year.

### Technical
| | |
|---|---|
| Services | `CampaignService` (`list/get/create/update/pause/resume/archive`), `CampaignROIService` (`getCampaignROI`, `getChannelComparison`, `getConversionFunnel`) |
| Segments API | `/api/admission/campaigns/segments` (WhatsApp audience targeting) |
| Tables | `admission_campaigns`, `admission_campaign_links` (UTM tokens), `admission_campaign_link_clicks` (attribution → `resulted_lead_id`) |
| Permissions | `admission.marketing:view/edit/create/delete` |

## D4. Source attribution 👔

**Route:** `/admission/settings/sources` · **File:** `app/(routes)/admission/settings/sources/page.tsx`

### End-User
Admin catalog of lead sources. System rows: label/order editable, key/enum locked. Custom rows fully editable/deletable. Shows lead & counselor counts per source.

### Technical
| | |
|---|---|
| Services | `SourceMasterService` (CRUD, enforces `is_system` immutability), `SourceTrackingService` (`getSourceBreakdown`, `getSourceStats`) |
| Enum | `LeadSourceEnum` (website, walk_in, referral, social_media, education_fair, agent, google_ads, facebook_ads, whatsapp, gate_entry, …) |
| Table | `admission_lead_sources_master` |
| Permission | `admission.settings:view` |

---

# Part E — Communication (cross-cutting actions)

> These are actions taken **on a lead at any stage** (mostly from B2/B3 Quick Actions). Each has a **cost unit** and is gated by **consent** (E9).

## E1. WhatsApp 1:1 chat 🧑‍💼

**Route:** `/admission/marketing/chat` · **File:** `app/(routes)/admission/marketing/chat/page.tsx`

### End-User
The "WhatsApp Command Center": 3-column desktop (conversation list / thread / lead profile), mobile single-pane. Tabs: Inbox, Broadcast, Segments, Re-engage, Analytics, Personal. Quick replies, templates, emoji, audio playback, **24h-window indicator**, consent banner, assign/resolve. Header shows live open/waiting/unread + daily/monthly cost.

### Technical
| | |
|---|---|
| APIs | `/api/admission/chat/conversations` (+ `[id]`, `/messages`, `/assign`, `/resolve`, `/reopen`) |
| Hooks | `useConversations` (poll 10s), `useChatRealtime` (Supabase Realtime on `wa_conversations`/`wa_messages`), `useChatStats`, `useChatMutations`, `useQuickReplies`, `useActiveTemplates` |
| Service | `WhatsAppChatService` (get/send/assign/resolve) → `whatsapp-api-client` |
| Tables | `wa_conversations`, `wa_messages` |
| Permission | `admission.marketing.chat.view` / `.manage` |

## E2. WhatsApp chatbot / auto-responder 👔

**Route:** `/admission/marketing/chatbot` · **File:** `app/(routes)/admission/marketing/chatbot/page.tsx`

### End-User
Configure an AI chatbot: name, welcome message, active toggle. Stats (sessions, active now, handoff rate, conversion). Test-chat tab, sessions list, knowledge-base upload, embed widget code.

### Technical
| | |
|---|---|
| APIs | `/api/admission/chatbot/{config,analytics,sessions,knowledge}`, `/api/chatbot/{sessions,chat}` (chat returns optional `action: handoff`) |
| Hooks | `useChatbotConfig`, `useChatbotConfigMutations`, `useChatbotAnalytics`, `useChatbotKnowledge`, `useChatbotSessions` |
| Service | `ChatbotService` |
| Tables | `admission_chatbot_configs`, `admission_chatbot_sessions`, `admission_chatbot_knowledge` |
| Migration | `admission/014_whatsapp_auto_responder.sql` |
| Permission | `admission.edit` / `admission.manage` |

## E3. WhatsApp broadcast & templates 👔/🛡️

**Routes:** Broadcast tab in chat; `/admission/settings/whatsapp-{numbers,profile,templates,analytics,health}`

### End-User
Bulk WhatsApp: upload recipients (CSV), pick template (with preview), optional segment, schedule or send now, track delivery. Manage phone numbers (register/verify/set-primary/sync with Meta), template HSMs (header/body/footer/buttons + quality), analytics (volume, delivery, cost), and health (quality rating, messaging limit).

### Technical
| | |
|---|---|
| APIs | `POST/GET /api/admission/whatsapp-broadcast` (+ `/upload`, max 500/batch); `/api/admission/settings/whatsapp-*` (numbers CRUD + register/verify/primary/sync; templates CRUD + refresh-quality; profile; analytics; health) |
| Services | `WhatsAppCampaignService`, `WhatsAppSettingsService`, `WhatsAppTemplateService` |
| Tables | `whatsapp_phone_numbers`, `whatsapp_templates`, `admission_whatsapp_messages`, `whatsapp_campaigns` |
| Permission | `admission.marketing.chat.manage` (+ super-admin / global gate for broadcast) |

## E4. SMS campaigns 👔

### End-User
Send single/bulk SMS to leads; track delivery and DLT compliance; per-lead SMS history.

### Technical
| | |
|---|---|
| Service | `SMSCampaignService` (`sendCampaignSMS`, `sendBulkSMS`, `getSMSLogs`, `getCampaignStats`, `getDeliveryStatus`) |
| Hooks | `useSMSLogs`, `useLeadSMSLogs`, `useSMSDeliveryStatus`, `useSMSCampaignStats`, `useSMSMutations` |
| Providers | MSG91 / Twilio / Exotel; **DLT** template+entity IDs (India regulation) |
| Table | `admission_sms_logs` |
| Permission | `admission.edit` / `admission.manage` |

## E5. Email 👔

### End-User
Send single/bulk templated emails; view delivery logs (sent/delivered/failed/bounced).

### Technical
| | |
|---|---|
| APIs | `/api/admission/email/send`, `/send-bulk` (max 500), `/logs` |
| Service | `EmailService` (provider **Resend**, `RESEND_API_KEY`) |
| Table | `admission_email_logs` |
| Permission | `admission.edit` / `admission.manage` |

## E6. Voice — calls 🧑‍💼

**Route:** `/admission/counselors/calls` · **File:** `app/(routes)/admission/counselors/calls/page.tsx`

### End-User
Outbound/Incoming tabs. KPI cards (total, completed, missed, avg duration, missing notes), volume + counselor charts, sortable call table with inline **recording player**. **Call Notes dialog**: outcome, sentiment, objection, next action, follow-up date, freeform notes — then auto-advances to the next un-noted call.

### Technical
| | |
|---|---|
| APIs | `/api/admission/calls` (+ `[id]/details`, `[id]/intelligence`, `[id]/notes`, `[id]/recording`, `/stats`, `/initiate`, `/sync`) |
| Services | `TelephonyService` (`getCallLogs`, `getCallStats`); AI: `admission_call_intelligence` (transcription, sentiment, summary) |
| Hooks | `useCallLogs` (poll 60s), `useCallStats`, `useCallMutations` |
| Tables | `admission_call_logs`, `admission_call_intelligence`, `admission_callback_queue` |
| Permission | view `admission.view`; notes `admission.leads.edit` / `admission.counselors.calls.edit` / `admission.counselors.edit` |

## E7. Voice — AI agents & broadcast 👔

### End-User
**Voice agents:** configure AI callers (type, prompt, voice, language) and initiate AI calls. **Voice broadcast:** TTS/audio blast to an audience filter with press-1 tracking; stats (answer/listen/press-1 rate, cost).

### Technical
| | |
|---|---|
| APIs | `/api/admission/voice-agents` (initialize/create/initiate_call/update/delete), `/api/admission/voice-broadcast` (start/pause/cancel/estimate_audience/create) |
| Services | `VoiceAgentService` (Exotel Voice API), `VoiceBroadcastService` (stub pending Exotel) |
| Tables | `voice_agent_configs`, `voice_broadcast_campaigns` |
| Permission | `admission.edit` / `admission.manage` |

## E8. Cost, drip & reminders 👔

### End-User
**Cost dashboard** aggregates spend by channel (header badge in chat). **Drip sequences** run multi-step automations (email/WhatsApp/SMS/call) with delays, conditions, retries, pause/skip. **Reminders** surface due follow-ups by priority with a suggested action.

### Technical
| | |
|---|---|
| Services | `CommunicationCostService` (`logCost`, `getCostDashboard`), `DripExecutorService`, `RemindersService` |
| Default costs (₹) | email 0.001 · SMS 0.18 · WhatsApp 0.50/template · call 1.50/min · voice-broadcast 0.75 + 1.50/min |
| Tables | `communication_cost_log`, `admission_drip_sequences`, `admission_drip_schedule_steps`, `admission_leads.next_followup_at` |

## E9. Consent (gates all messaging) 🛡️

### End-User
WhatsApp opt-in/opt-out per lead; auto opt-out on STOP keywords. All bulk sends respect `wa_opt_in`.

### Technical
| | |
|---|---|
| Service | `WhatsAppConsentService` (`checkConsent`, `grantConsent`, `revokeConsent`, `getConsentLog`) |
| API | `/api/admission/chat/consent` (GET status, POST opt_in/opt_out) |
| Tables | `admission_leads.wa_opt_in*`, `admission_wa_consent_log` |
| Sources | website_form, whatsapp_inbound, manual, import, chatbot, keyword_stop, expo_capture_form/bulk_upload |
| Compliance | DPDPA 2023, TCCCPR, Meta policy |

---

# Part F — Convert (lead → learner) → hand-off to billing

**Endpoint:** `POST /api/admission/bridge/convert` · **File:** `app/api/admission/bridge/convert/route.ts`

### End-User
When a lead reaches a seat-filled stage, **Move to Account** converts it into a learner profile (`lifecycle_status = 'enquiry'`). From there the learner appears under `/learners/enquiries/[id]` — **this is exactly where the billing docs pick up.**

### Technical (atomic)
1. Authenticate + permission `admission.leads.convert_to_admitted` (RPC `user_has_permission`).
2. Fetch lead; **409 if already converted** (`learner_profile_id` set).
3. Resolve admission-year FK against institution; resolve accommodation (`dayscholar`).
4. Map lead → learner fields; **INSERT `learners_profiles`** (`lifecycle_status='enquiry'`, `entry_type='FIRST YEAR'`).
5. **UPDATE `admission_leads.learner_profile_id`**; deferred referral-attribution update (breaks trigger race).

| | |
|---|---|
| Tables | `admission_leads`, `learners_profiles`, `admission_years`, `accommodation_types` |
| Continues in | **[admission-billing-workflow.md](./admission-billing-workflow.md)** §Stage 1 (fee resolution) → §Stage 2 (account transition + bills) |

```
admission_leads ──bridge/convert──▶ learners_profiles (enquiry)
                                          │
                                          ▼
                            Finance tab → Account Verification
                            (resolve fees → generate bills)   ◀── billing docs
                                          │
                                          ▼
                            pay → receipt → invoice
```

---

## Appendix A — Permission keys (as observed; verify before gating)

| Area | View | Create / Manage |
|---|---|---|
| Leads | `admission.leads.view` | `.create`, `.edit`, `.delete`, `.convert_to_admitted` |
| Gate entry | — | `admission.gate_entry.create` |
| Expo capture | team membership | (membership) |
| Counselors / allocation | `admission.counselors.view` | assignment rules; routing-config = super-admin |
| Statuses | `admission.settings.statuses.view` | manage |
| Sources / settings | `admission.settings:view` | — |
| Marketing / campaigns | `admission.marketing:view` | `:edit`, `:create`, `:delete` |
| WhatsApp chat | `admission.marketing.chat.view` | `.manage` (broadcast: + super-admin/global) |
| Chatbot / SMS / email / voice | `admission.view` | `admission.edit` / `admission.manage` |
| Social (IG/FB/Lead Ads) | `social.instagram:view`, `social.facebook:view`, `social.lead_ads:view` | — |

> **Caveat (important):** permission-key punctuation (`:` vs `.`) and exact action names vary across these modules in the source, and this codebase has a documented history of dot/underscore key drift causing blank pages. **Confirm the stored format** against `lib/sidebarMenuLink.ts` / `custom_roles` grants before relying on any key in a new gate.

## Appendix B — Core tables by area

- **Lead core:** `admission_leads`, `admission_lead_sources_master`, `admission_lead_sources_captured`, `admission_lead_activities`, `admission_lead_scores`, `admission_lead_assignments`, `admission_assignment_rules`, `admission_statuses`, `admission_counselors`, `counselor_routing_config`
- **Capture sources:** `admission_integrations`/`_logs`, `api_keys`, `marketing_leads_database`, `expo_events`/`_event_stalls`/`_event_team_members`, `meta_lead_forms`/`meta_leadgen_events`/`meta_lead_field_mappings`/`meta_capi_events`
- **Social:** `ig_dm_conversations`, FB/IG account tables, `admission_campaigns`/`_campaign_links`/`_campaign_link_clicks`
- **Communication:** `wa_conversations`/`wa_messages`, `whatsapp_phone_numbers`/`whatsapp_templates`/`admission_whatsapp_messages`/`whatsapp_campaigns`, `admission_chatbot_configs`/`_sessions`/`_knowledge`, `admission_sms_logs`, `admission_email_logs`, `admission_call_logs`/`_call_intelligence`/`_callback_queue`, `voice_agent_configs`, `voice_broadcast_campaigns`, `communication_cost_log`, `admission_drip_sequences`/`_drip_schedule_steps`, `admission_wa_consent_log`
- **Conversion:** `learners_profiles`, `admission_years`, `accommodation_types`

## Appendix C — Verification caveat

This document is assembled from agent reads of the live source (paths, services, RPCs, and table/column names are quoted from files). I did **not** line-verify every one of the ~40 pages myself — notably the permission-key punctuation flagged in Appendix A, and a few admin pages the agents marked as inferred (`voice-agents`/`voice-broadcast` settings UI). If you want any specific page guaranteed exact, I can open its file and confirm buttons / API calls / permission keys precisely.
