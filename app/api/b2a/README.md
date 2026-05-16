# B2A — Business-to-Agent API Surface

MyJKKN's `/api/b2a/*` namespace exposes the platform's 30 modules as
read-only REST endpoints for AI agents. Phase 1-4 shipped earlier; this
README covers Phase 3 completion + Phase 5 (agent memory) + Phase 6
(manifest).

See `Vaults/JKKNKB/MyJKKN/HANDOFF-B2A-Transformation.md` for the full spec.

## Authenticating

Every request needs a Bearer token from `api_keys`:

```bash
curl -H "Authorization: Bearer jkkn_<your-key>" https://www.jkkn.ai/api/b2a/<module>
```

Keys are created via the admin UI (`/admin/api-keys`). Keys may be:
- **Institution-scoped** (`institution_id` set) — all queries auto-scoped.
- **Platform-wide** (`institution_id NULL`) — must pass `?institutionId=...` per call.

Permissions are stored as `{ read: ['admission', 'okr'], write: [] }` JSONB.
Legacy `{ read: true }` means all-modules.

## Module surface

### Aggregations

| Endpoint | Description |
|---|---|
| `GET /api/b2a/morning-brief` | 5-module operational snapshot |
| `GET /api/b2a/manifest` | MCP-style tool manifest for agent discovery |

### Core modules (Phase 3 — all 30 keys in `VALID_MODULES`)

| Module | Status | Backing table |
|---|---|---|
| admission | full (list + [id] + stats) | admission_leads |
| attendance | full (list + trend + pending) | student_attendance |
| billing | full (list + outstanding + summary) | billing_student_bills |
| grievance | full (list + [id] + dashboard) | grievance_tickets |
| okr | full (objectives + stats + compliance) | okr_objectives |
| learners | full (list + [id]) | learners_profiles |
| staff | full (list + [id]) | staff |
| organizations | full (institutions/departments/courses) | institutions / departments / courses |
| campus-living | list | hostels |
| solutions | list | ss_* |
| learners-council | list | lc_* |
| academic | list | academic_years |
| competency | list | competency_catalog |
| vac | list | vac_courses |
| facilitator | list (staff filtered to faculty/teacher roles) | staff |
| learning-paths | list | pde_quests |
| alumni | list (platform-scope; no institution_id) | ss_alumni_tracking |
| industry | list | ss_industry_interests |
| parent-portal | list (parent contacts from learner profiles) | learners_profiles |
| maturity-assessment | list | audit_cycles |
| process-excellence | list | audit_attestations |
| resource-management | list | event_resource_bundles |
| bug-reports | list (platform-scope) | sh_bug_reports |
| notifications | list (platform-scope) | notifications |
| audit-trail | list (platform-scope) | sh_audit_logs |
| **stakeholder-nps** | STUB — NPS schema pending | _ |
| **social-media** | STUB — schema pending | _ |
| **service_request** | STUB — Instasolver DDL pending | _ |
| **requirement** | STUB — Instasolver DDL pending | _ |
| morning-brief | aggregation only | (synthesized) |

Stubs return `200` with `{ data: [], _stub: true, _stub_reason: '...' }`
so agents can rely on the surface being complete; reasons are explicit
in the response.

### Phase 5 — Agent memory

| Endpoint | Description |
|---|---|
| `GET    /api/b2a/memory` | List memories (filter by type, tags, importance) |
| `POST   /api/b2a/memory` | Create memory entry |
| `PATCH  /api/b2a/memory/:id` | Update memory |
| `DELETE /api/b2a/memory/:id` | Soft-delete (sets `expires_at = NOW()`) |
| `GET    /api/b2a/memory/search?q=...` | Full-text search |
| `GET    /api/b2a/memory/decisions` | List decisions |
| `POST   /api/b2a/memory/decisions` | Log decision with rationale |
| `PATCH  /api/b2a/memory/decisions/:id` | Fill in outcome |

Memories belong to their creating API key (`api_key_id`) so each agent
has its own private memory bank.

### Phase 6 — MCP manifest

`GET /api/b2a/manifest` returns a machine-readable tool manifest. The
manifest is the contract a future standalone MCP server (a thin Node
wrapper per handoff §8) will be built against. Agents can also fetch
the manifest directly to autoconfigure their tool list.

## Standard response envelope

```json
{
  "data": [ ... ],
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 142,
    "totalPages": 3
  }
}
```

Errors:

```json
{ "error": { "code": "UNAUTHORIZED", "message": "API key has expired" } }
```

Codes: `UNAUTHORIZED` (401), `FORBIDDEN` (403), `BAD_REQUEST` (400),
`NOT_FOUND` (404), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500).

## Rate limits

60 requests / 60 seconds per API key, sliding window. Hit limit → `429`
with `Retry-After` header.

## Adding a new module

1. Add the module key to `VALID_MODULES` in `lib/api-keys/authenticate.ts`.
2. Create `app/api/b2a/<module>/route.ts` mirroring an existing file
   (smallest reference: `app/api/b2a/academic/route.ts`).
3. Add a `ToolDefinition` to `app/api/b2a/manifest/route.ts`.
4. Update this README's module table.
5. Visual proof: `curl -H "Authorization: Bearer ..."` example in your PR.

## Audit

Every request is logged to `api_key_usage_logs` (fire-and-forget). Admins
can query the table directly or via the upcoming `/admin/api-keys/usage`
page.
