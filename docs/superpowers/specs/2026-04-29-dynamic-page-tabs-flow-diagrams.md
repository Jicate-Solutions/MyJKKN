# Dynamic Page-Tabs System — Flow Diagrams

**Date:** 2026-04-29
**Companion to:** `2026-04-29-dynamic-page-tabs-design.md`

> **How to view:** Open this file in VS Code → preview pane (Ctrl+K V), or push to GitHub. Both render Mermaid blocks natively. Diagrams are also live-editable; tweak the source and the preview updates instantly.

---

## 1. System Architecture (high level)

Shows every new + existing component and how they connect.

```mermaid
flowchart TB
    subgraph SRC["📁 Source Code (developer-owned)"]
        FS["app/(routes)/**<br/>page.tsx files"]
        NCFG["app/(routes)/&lt;slug&gt;/nav-config.ts<br/>(9 modules)"]
        MENUPERMS["lib/sidebarMenuLink.ts<br/>MENU_PERMISSIONS<br/>(600 entries)"]
        MODULES["lib/navigation/modules.ts<br/>MODULES (34 slugs)"]
    end

    subgraph BUILD["⚙️ Build Time"]
        GENROUTES["scripts/generate-route-manifest.ts<br/>(extended)"]
        MANIFEST["route-manifest.generated.ts<br/>(540 pages)"]
        TABSEED["route-tab-seed.generated.json<br/>🆕 NEW"]
        PERMSEED["menu-permissions.generated.json<br/>🆕 NEW"]
        SYNC["scripts/sync-tab-definitions.ts<br/>🆕 NEW"]
    end

    subgraph DB["🗄️ Supabase"]
        PTD[("page_tab_definitions<br/>🆕 NEW<br/>code-declared baseline")]
        PTO[("page_tab_overrides<br/>🆕 NEW<br/>admin-editable layer")]
        MPS[("menu_permissions_seed<br/>🆕 NEW")]
        EXISTING[("existing tables:<br/>profiles, custom_roles,<br/>user_roles, platform_policies")]
        RPC{{"fn_get_resolved_page_tabs()<br/>🆕 NEW<br/>SECURITY DEFINER"}}
        WRITE_RPCS{{"fn_upsert_page_tab<br/>fn_reorder_page_tabs<br/>fn_delete_page_tab_override<br/>🆕 NEW"}}
    end

    subgraph RENDER["🖥️ Client Render Layer"]
        HOOK["useDynamicTabs(moduleSlug)<br/>🆕 NEW"]
        TIERS["lib/navigation/tier-rendering.ts<br/>resolveTiers() + dynamicTabs param"]
        AUTO["&lt;AutoTabNav /&gt;<br/>(global, app/(routes)/layout.tsx:51)"]
        REGISTRY["lib/navigation/page-registry.ts<br/>buildRegistry() + 4th merge step"]
        CMDK["Cmd+K palette"]
    end

    subgraph ADMIN["👤 Admin UI (NEW)"]
        UMBRELLA["/admin/navigation/<br/>🆕 umbrella with 3 sub-tabs"]
        TABSUI["/admin/navigation/page-tabs/<br/>🆕 main admin UI"]
        SVC["lib/services/admin/page-tabs-service.ts<br/>🆕 TanStack Query hooks"]
    end

    FS --> GENROUTES
    NCFG --> GENROUTES
    MENUPERMS --> GENROUTES
    MODULES --> GENROUTES

    GENROUTES --> MANIFEST
    GENROUTES --> TABSEED
    GENROUTES --> PERMSEED

    TABSEED --> SYNC
    PERMSEED --> SYNC
    SYNC -->|fn_resync_tab_definitions_from_seed<br/>fn_resync_menu_permissions| PTD
    SYNC --> MPS

    AUTO --> HOOK
    HOOK -->|fetch| RPC
    RPC -->|reads| PTD
    RPC -->|reads| PTO
    RPC -->|reads| MPS
    RPC -->|user_has_permission| EXISTING
    HOOK --> TIERS
    TIERS --> AUTO

    REGISTRY -->|4th merge: kind=route admin tabs| HOOK
    REGISTRY --> CMDK

    TABSUI --> SVC
    SVC -->|mutations| WRITE_RPCS
    WRITE_RPCS -->|writes| PTD
    WRITE_RPCS -->|writes| PTO

    UMBRELLA --> TABSUI

    classDef new fill:#3b82f6,stroke:#1e40af,color:#fff
    classDef existing fill:#94a3b8,stroke:#475569,color:#fff
    classDef db fill:#10b981,stroke:#047857,color:#fff
    class GENROUTES,TABSEED,PERMSEED,SYNC,PTD,PTO,MPS,RPC,WRITE_RPCS,HOOK,UMBRELLA,TABSUI,SVC new
    class FS,NCFG,MENUPERMS,MODULES,MANIFEST,EXISTING,TIERS,AUTO,REGISTRY,CMDK existing
```

---

## 2. Read Path — How a tab gets rendered for an end user

What happens when a logged-in user navigates to `/admission/leads/kanban`.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Page as "Next.js Page<br/>(any /admission/* route)"
    participant Layout as "app/(routes)/layout.tsx"
    participant ATN as "&lt;AutoTabNav /&gt;"
    participant Hook as "useDynamicTabs(<br/>'admission', instId)"
    participant TQ as "TanStack Query"
    participant SVC as "page-tabs-service.ts"
    participant RPC as "fn_get_resolved_page_tabs"
    participant DB as "page_tab_definitions<br/>+ page_tab_overrides"
    participant Tiers as "resolveTiers()<br/>tier-rendering.ts"

    User->>Page: GET /admission/leads/kanban
    Page->>Layout: render
    Layout->>ATN: mount
    ATN->>Hook: invoke
    Hook->>TQ: queryKey: ['page-tabs','resolved','admission',instId]
    TQ-->>Hook: cache miss
    Hook->>SVC: getResolved('admission', instId)
    SVC->>RPC: rpc('fn_get_resolved_page_tabs', {module_slug, institution_id})

    RPC->>DB: SELECT defs LEFT JOIN overrides
    Note over RPC,DB: COALESCE: institution > global > defaults
    DB-->>RPC: rows (resolved labels, orders, parents)

    Note over RPC: Filter: hidden=false<br/>AND (is_super_admin OR<br/>user_has_permission(req_perm))
    RPC-->>SVC: ResolvedTab[]
    SVC-->>Hook: data
    Hook-->>ATN: { data: dynamicTabs }

    ATN->>Tiers: resolveTiers(pathname, { dynamicTabs })
    Note over Tiers: Merge per tab_key<br/>DB wins where present<br/>Falls back to nav-config.ts<br/>then to manifest
    Tiers-->>ATN: tier1[], tier2[], tier3[] chips
    ATN-->>User: rendered chip strip

    Note over User: User clicks "Kanban" chip
    User->>Page: navigate to /admission/leads/kanban
```

---

## 3. Write Path — Admin renames a tab

What happens when a super-admin renames "Kanban" to "Board" for one institution.

```mermaid
sequenceDiagram
    autonumber
    actor Admin as "super_admin"
    participant UI as "/admin/navigation/<br/>page-tabs"
    participant Dialog as "&lt;TabEditDialog /&gt;"
    participant Hook as "useUpsertPageTab"
    participant TQ as "TanStack Query"
    participant SVC as "page-tabs-service.ts"
    participant RPC as "fn_upsert_page_tab"
    participant DB as "page_tab_overrides"
    participant ATN as "&lt;AutoTabNav /&gt;<br/>(in user sessions)"

    Admin->>UI: click Edit on "admission.leads.kanban"
    UI->>Dialog: open with current values
    Admin->>Dialog: change label to "Board"<br/>scope = institution X
    Dialog->>Hook: mutate({ tab_key, scope_type:'institution', scope_id:X, label_override:'Board' })
    Hook->>SVC: upsertOverride(...)
    SVC->>RPC: rpc('fn_upsert_page_tab', {mode:'override', ...})

    Note over RPC: Validate:<br/>- is_super_admin OR is_admin<br/>- tab_key exists in definitions<br/>- depth ≤ 3<br/>- href in route manifest (if changed)<br/>- narrow-only permission rule
    RPC->>DB: INSERT ... ON CONFLICT (tab_key, scope_type, scope_id)<br/>DO UPDATE SET label_override='Board'
    DB-->>RPC: row
    RPC-->>SVC: ok
    SVC-->>Hook: ok

    Hook->>TQ: invalidateQueries(['page-tabs'])
    TQ->>TQ: mark stale<br/>['page-tabs','resolved','admission','*']

    Note over ATN: any user in inst X<br/>whose page refetches
    ATN->>Hook: useDynamicTabs re-runs
    Hook-->>ATN: refreshed data with "Board"
    ATN-->>Admin: chip now reads "Board"
    Note over Admin: ✅ Visible immediately to admin;<br/>visible to other users on next refetch (≤60s default staleTime)
```

---

## 4. Build-Time Auto-Discovery Flow

What happens when a developer adds a new page and runs the build.

```mermaid
flowchart TD
    DEV["Developer adds<br/>app/(routes)/admission/<br/>insights/page.tsx"] --> CMD["npm run build"]

    CMD --> GENROUTES["scripts/generate-route-manifest.ts<br/>(extended)"]

    GENROUTES --> WALK["Walk app/(routes)/**"]
    WALK --> EMIT_MANIFEST["Emit route-manifest.generated.ts<br/>(now 541 pages)"]
    WALK --> READNAV["Read each module's<br/>nav-config.ts (9 modules)"]
    READNAV --> COMPUTE["Compute tab seed:<br/>tab_key = path.replace(/, '.')<br/>label = navMeta or filename<br/>parent = path-parent's tab_key<br/>depth = segments after module_slug"]
    COMPUTE --> EMIT_TABSEED["Emit route-tab-seed.generated.json"]

    GENROUTES --> EMIT_PERMSEED["Emit menu-permissions.generated.json<br/>from MENU_PERMISSIONS map"]

    EMIT_MANIFEST --> CHECK_COVERAGE["scripts/check-tab-coverage.ts"]
    EMIT_TABSEED --> CHECK_COVERAGE
    CHECK_COVERAGE --> COV_PASS{"Coverage OK?<br/>- no orphan routes<br/>- no broken hierarchy<br/>- depth ≤ 3<br/>- no tab_key collision"}
    COV_PASS -->|❌ fail| FAIL_BUILD["❌ Build fails<br/>(CI gate)"]
    COV_PASS -->|✅ pass| BUILD_OK["✅ Build succeeds"]

    BUILD_OK --> DEPLOY["Deploy"]
    DEPLOY --> POSTDEPLOY["postdeploy hook<br/>OR<br/>admin clicks 'Refresh from filesystem'"]
    POSTDEPLOY --> SYNC_SCRIPT["scripts/sync-tab-definitions.ts"]
    SYNC_SCRIPT --> CALL_RPC["calls fn_resync_tab_definitions_from_seed(seed_jsonb)"]
    CALL_RPC --> UPSERT["UPSERT into page_tab_definitions<br/>where source IN ('filesystem','nav-config')<br/>NEVER deletes source='admin' rows"]
    UPSERT --> NEW_GHOST["✨ Admin sees<br/>'admission.insights' as a<br/>ghost row in the UI on next visit"]

    classDef new fill:#3b82f6,stroke:#1e40af,color:#fff
    classDef existing fill:#94a3b8,stroke:#475569,color:#fff
    classDef gate fill:#f59e0b,stroke:#b45309,color:#fff
    classDef ok fill:#10b981,stroke:#047857,color:#fff
    classDef bad fill:#ef4444,stroke:#991b1b,color:#fff
    class GENROUTES,EMIT_TABSEED,EMIT_PERMSEED,CHECK_COVERAGE,COMPUTE,SYNC_SCRIPT,CALL_RPC,UPSERT new
    class WALK,READNAV,EMIT_MANIFEST,DEV,CMD,DEPLOY,POSTDEPLOY existing
    class COV_PASS gate
    class BUILD_OK,NEW_GHOST ok
    class FAIL_BUILD bad
```

---

## 5. Entity-Relationship Diagram

How the new tables relate to each other and to existing tables.

```mermaid
erDiagram
    page_tab_definitions ||--o{ page_tab_overrides : "tab_key"
    page_tab_definitions ||--o{ page_tab_definitions : "parent_tab_key (self)"
    page_tab_overrides }o--|| page_tab_definitions : "parent_tab_key_override"

    profiles ||--o{ page_tab_definitions : "created_by, updated_by"
    profiles ||--o{ page_tab_overrides : "created_by, updated_by"
    institutions ||--o{ page_tab_overrides : "scope_id (when scope_type='institution')"

    menu_permissions_seed ||..|| page_tab_definitions : "href → permission_key (via fn_get_route_permission)"

    custom_roles ||--o{ user_roles : "role_id"
    profiles ||--o{ user_roles : "user_id"
    custom_roles }o..o| page_tab_definitions : "permissions JSONB key matches required_permission"

    page_tab_definitions {
        UUID id PK
        TEXT tab_key UK
        TEXT module_slug
        TEXT parent_tab_key FK "self-reference, ON DELETE CASCADE"
        TEXT kind "route | section"
        TEXT href "nullable for kind=section"
        TEXT default_label
        TEXT default_icon
        INT default_display_order
        BOOLEAN default_is_default
        TEXT required_permission "nullable: inherits MENU_PERMISSIONS"
        TEXT source "filesystem | nav-config | admin"
        BOOLEAN is_active
        INT depth "1-3 CHECK"
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
        UUID created_by FK
        UUID updated_by FK
    }

    page_tab_overrides {
        UUID id PK
        TEXT tab_key FK "→ page_tab_definitions"
        TEXT scope_type "global | institution"
        UUID scope_id "NULL for global"
        TEXT label_override
        TEXT icon_override
        INT display_order_override
        TEXT parent_tab_key_override FK
        BOOLEAN is_default_override
        BOOLEAN hidden
        TEXT required_permission_override "narrow-only"
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
        UUID created_by FK
        UUID updated_by FK
    }

    menu_permissions_seed {
        TEXT route_normalized PK
        TEXT permission_key
        TIMESTAMPTZ updated_at
    }

    custom_roles {
        UUID id PK
        TEXT role_key UK
        JSONB permissions "key check by user_has_permission"
        JSONB module_scopes
    }

    user_roles {
        UUID id PK
        UUID user_id FK
        UUID role_id FK
        BOOLEAN is_primary
    }

    profiles {
        UUID id PK
    }

    institutions {
        UUID id PK
    }
```

---

## 6. Permission Resolution Decision Tree

How `fn_get_resolved_page_tabs` decides whether to show a single tab to a user.

```mermaid
flowchart TD
    START(["Tab row exists in<br/>page_tab_definitions"]) --> ACTIVE{"is_active = true?"}
    ACTIVE -->|❌ no| HIDDEN1["🚫 Tab not returned"]
    ACTIVE -->|✅ yes| MERGE["Merge with overrides:<br/>institution → global → defaults"]

    MERGE --> HIDE{"hidden = true<br/>after merge?"}
    HIDE -->|✅ yes| HIDDEN2["🚫 Tab not returned"]
    HIDE -->|❌ no| SUPER{"is_super_admin()?"}

    SUPER -->|✅ yes| SHOW1["✅ Tab returned"]
    SUPER -->|❌ no| HASPERM{"required_permission<br/>resolved to non-NULL?"}

    HASPERM -->|❌ no| HIDDEN3["🚫 Tab not returned<br/>(matches sidebar parity §14.1)"]
    HASPERM -->|✅ yes| CHECK{"user_has_permission(<br/>required_permission)?"}

    CHECK -->|❌ no| HIDDEN4["🚫 Tab not returned"]
    CHECK -->|✅ yes| OVR{"required_permission_override<br/>also set?"}

    OVR -->|❌ no| SHOW2["✅ Tab returned"]
    OVR -->|✅ yes| CHECK2{"user_has_permission(<br/>required_permission_override)?"}

    CHECK2 -->|❌ no| HIDDEN5["🚫 Tab not returned<br/>(narrow-only rule)"]
    CHECK2 -->|✅ yes| SHOW3["✅ Tab returned"]

    classDef good fill:#10b981,stroke:#047857,color:#fff
    classDef bad fill:#ef4444,stroke:#991b1b,color:#fff
    classDef gate fill:#f59e0b,stroke:#b45309,color:#fff
    class SHOW1,SHOW2,SHOW3 good
    class HIDDEN1,HIDDEN2,HIDDEN3,HIDDEN4,HIDDEN5 bad
    class ACTIVE,HIDE,SUPER,HASPERM,CHECK,OVR,CHECK2 gate
```

**Where `required_permission` comes from** (resolution priority, top wins):
1. `page_tab_overrides.required_permission_override` for matching `(tab_key, scope='institution', scope_id)`
2. `page_tab_overrides.required_permission_override` for matching `(tab_key, scope='global')`
3. `page_tab_definitions.required_permission`
4. Lookup `MENU_PERMISSIONS[normalize(href)]` via `fn_get_route_permission(href)` (only if `kind='route'`)
5. NULL → tab is hidden for non-super-admins (§14.1 lock)

---

## 7. Concrete 3-Tier Hierarchy Example

What `module_slug='admission'` looks like in the DB and what the user sees.

```mermaid
graph TD
    ROOT["module_slug='admission'<br/>(MODULES[].slug)"]

    ROOT --> T1A["tab_key=admission.leads<br/>label=Leads<br/>depth=1<br/>is_default=true"]
    ROOT --> T1B["tab_key=admission.counselors<br/>label=Counselors<br/>depth=1"]
    ROOT --> T1C["tab_key=admission.expo<br/>label=Expo<br/>depth=1"]

    T1A --> T2A["tab_key=admission.leads.kanban<br/>label=Kanban<br/>depth=2<br/>is_default=true<br/>href=/admission/leads/kanban"]
    T1A --> T2B["tab_key=admission.leads.list<br/>label=List<br/>depth=2<br/>href=/admission/leads/list"]
    T1A --> T2C["tab_key=admission.leads.dashboard<br/>label=Dashboard<br/>depth=2<br/>href=/admission/leads/dashboard"]

    T2A --> T3A["tab_key=admission.leads.kanban.detail<br/>label=Detail<br/>depth=3<br/>href=/admission/leads/kanban/[id]"]

    T1B --> T2D["tab_key=admission.counselors.list<br/>label=List<br/>depth=2"]
    T1B --> T2E["tab_key=admission.counselors.assign<br/>label=Assignments<br/>depth=2"]

    T1C --> T2F["tab_key=admission.expo.events<br/>label=Events<br/>depth=2"]
    T1C --> T2G["tab_key=admission.expo.analytics<br/>label=Analytics<br/>depth=2<br/>required_permission=admission.expo.admin"]

    classDef tier1 fill:#1e3a8a,stroke:#1e40af,color:#fff
    classDef tier2 fill:#3b82f6,stroke:#1e40af,color:#fff
    classDef tier3 fill:#93c5fd,stroke:#1e40af,color:#000
    classDef root fill:#475569,stroke:#1e293b,color:#fff
    class ROOT root
    class T1A,T1B,T1C tier1
    class T2A,T2B,T2C,T2D,T2E,T2F,T2G tier2
    class T3A tier3
```

**What the user sees on `/admission/leads/kanban`**:

```
┌───────────────────────────────────────────────────────────┐
│ 🏠 Sidebar: Admission CRM (top-level only)               │
├───────────────────────────────────────────────────────────┤
│ TIER 1 chips:  [Leads*]  [Counselors]  [Expo]            │   ← from depth=1 rows
│ TIER 2 chips:  [Kanban*]  [List]  [Dashboard]            │   ← from depth=2 rows under "Leads"
│ TIER 3 chips:  [Detail]                                   │   ← from depth=3 rows under "Kanban"
├───────────────────────────────────────────────────────────┤
│ Page content for /admission/leads/kanban                  │
└───────────────────────────────────────────────────────────┘
   * = is_default=true, also active because URL matches
```

If admin overrides for institution X:
- Hide `admission.expo.analytics` → "Analytics" chip gone for institution X.
- Rename `admission.leads.kanban` to "Board" → tier-2 chip reads "Board" for institution X.

---

## 8. Quick Glossary

| Term | Meaning |
|---|---|
| **`tab_key`** | Stable canonical id, e.g. `admission.leads.kanban`. Derived deterministically by `lib/navigation/tab-key.ts`. |
| **`module_slug`** | First URL segment, from `lib/navigation/modules.ts`. 34 stable values. |
| **`source='filesystem'`** | Tab discovered by build script from a `page.tsx` file with no nav-config entry. |
| **`source='nav-config'`** | Tab declared in `app/(routes)/<slug>/nav-config.ts`. |
| **`source='admin'`** | Tab created by an admin in the UI, no source-code presence. |
| **`scope_type='global'`** | Override applies to everyone unless overridden by institution. |
| **`scope_type='institution'`** | Override applies only to that institution; wins over `'global'`. |
| **`narrow-only override`** | `required_permission_override` may only ADD constraints (AND logic), never widen access. |
| **Ghost row** | A `page_tab_definitions` row from the build seed that admin hasn't yet promoted, hidden, or overridden. Visible in admin UI with "Code" badge. |
| **3-tier limit** | DB CHECK + RPC validation. `depth IN (1,2,3)`. Re-parenting beyond depth 3 is rejected. |

---

## 9. How to View These Diagrams

1. **VS Code (recommended for inline editing)**:
   - Open this file
   - Press `Ctrl+K V` (Cmd+K V on Mac) to open Markdown preview side-by-side
   - Mermaid blocks render automatically (built-in support since VS Code 1.72)
   - Edit the source on the left → preview updates instantly on the right

2. **GitHub**:
   - Push this file → open it in GitHub web UI
   - All Mermaid blocks render as SVGs
   - Excellent for PR review

3. **Mermaid Live Editor** (for one-off tweaks):
   - Copy any code block (between ` ```mermaid ` and ` ``` `) into <https://mermaid.live>
   - Real-time preview, can export PNG/SVG

4. **Claude Code's Visual Companion** (if you want me to generate richer mockups beyond Mermaid — UI mockups, color exploration, multi-frame walkthroughs):
   - Tell me "use the visual companion for diagram X"
   - I'll spin it up; needs a local URL open in your browser

---

## 10. What These Diagrams Cover (Spec Section Mapping)

| Diagram | Maps to spec section(s) |
|---|---|
| 1. System Architecture | §5 Architecture Overview, §12 File Tree |
| 2. Read Path | §7.1 fn_get_resolved_page_tabs, §9 Render Bridge |
| 3. Write Path | §7.2 fn_upsert_page_tab, §10 Admin UI, §10.3 Service & hooks |
| 4. Build-Time Auto-Discovery | §8 Build-Time Discovery |
| 5. ER Diagram | §6 Data Model |
| 6. Permission Resolution Tree | §11 Permission Gating, §14.1 Sidebar parity (LOCKED) |
| 7. 3-Tier Hierarchy Example | §5.3 tab_key canonicalization, §6.1 schema |
| 8. Glossary | cross-cutting |

If anything in these diagrams contradicts the spec, the **spec wins** — flag the mismatch and I'll fix the diagram inline.
