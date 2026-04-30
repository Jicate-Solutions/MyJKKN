# Dynamic Page-Tabs System — User Flow Diagrams

**Date:** 2026-04-29
**Companion to:** `2026-04-29-dynamic-page-tabs-design.md` and `2026-04-29-dynamic-page-tabs-flow-diagrams.md`

> **Focus:** This file describes **user journeys** — what each user role *does*, *clicks*, *sees* — not the technical request/response sequence.
>
> **How to view:** Open in VS Code → press **Ctrl+K V** for live preview, or push to GitHub for SVG rendering.

---

## User Roles in This System

| Role | Permission level | What they do |
|---|---|---|
| **End user** (student, faculty, staff) | Has some `<module>.<resource>.<action>` permissions | Navigates pages, clicks tabs, never sees the admin UI |
| **Admin** | `is_admin()` returns true | Manages tab labels, order, visibility for their institution |
| **Super-admin** | `is_super_admin()` returns true | Manages tabs globally and per-institution; sees every module |
| **Developer** | Writes code, opens PRs | Adds new pages and modules; never edits tabs in DB |

---

## Flow 1 — End User: Navigating a Module

The most common user flow. An end-user logs in and navigates to a feature.

```mermaid
flowchart TD
    START([👤 User opens app]) --> LOGIN["Login screen"]
    LOGIN -->|valid creds| DASH["Dashboard / home"]
    DASH --> CLICK_SIDEBAR["Click 'Admission CRM'<br/>in sidebar"]

    CLICK_SIDEBAR --> LAND["Land on /admission<br/>(default page)"]
    LAND --> RENDER1["&lt;AutoTabNav /&gt; calls<br/>useDynamicTabs('admission', instId)"]
    RENDER1 --> RPC1["fn_get_resolved_page_tabs<br/>filters by user's permissions"]
    RPC1 --> SHOW1["✨ Tier 1 chips appear:<br/>[ Leads* ] [ Counselors ] [ Expo ]<br/>(* = is_default)"]

    SHOW1 --> CLICK_T1{"User clicks<br/>tier-1 chip?"}
    CLICK_T1 -->|"clicks 'Leads'"| NAV_T1["URL → /admission/leads<br/>(default child)"]
    NAV_T1 --> SHOW2["Tier 2 chips appear:<br/>[ Kanban* ] [ List ] [ Dashboard ]"]

    SHOW2 --> CLICK_T2{"User clicks<br/>tier-2 chip?"}
    CLICK_T2 -->|"clicks 'List'"| NAV_T2["URL → /admission/leads/list"]
    NAV_T2 --> SHOW3{"Has tier-3<br/>children?"}
    SHOW3 -->|"yes"| SHOW3Y["Tier 3 chips appear<br/>(if user has perms)"]
    SHOW3 -->|"no"| RENDER_PAGE["Page content renders"]
    SHOW3Y --> RENDER_PAGE

    CLICK_T1 -->|"no, stays"| RENDER_PAGE
    CLICK_T2 -->|"no, stays"| RENDER_PAGE

    RENDER_PAGE --> NOTE_PERM["💡 If a permission was missing,<br/>that chip never appeared.<br/>User never sees forbidden tabs."]

    classDef start fill:#10b981,stroke:#047857,color:#fff
    classDef gate fill:#f59e0b,stroke:#b45309,color:#fff
    classDef show fill:#3b82f6,stroke:#1e40af,color:#fff
    classDef note fill:#94a3b8,stroke:#475569,color:#fff
    class START start
    class CLICK_T1,CLICK_T2,SHOW3 gate
    class SHOW1,SHOW2,SHOW3Y,RENDER_PAGE show
    class NOTE_PERM note
```

**Key UX guarantees:**
- A tab the user doesn't have permission for **never appears** — no greyed-out chips, no "access denied" page.
- Default chip is auto-active on landing — user doesn't need to pick.
- URL is bookmarkable: refreshing `/admission/leads/kanban` lands back on the same chip.

---

## Flow 2 — Admin: Renaming a Tab for One Institution

The most common admin task. Admin wants institution X to see "Board" instead of "Kanban".

```mermaid
flowchart TD
    START([👤 Admin logs in]) --> NAV["Navigate to<br/>/admin/navigation"]
    NAV --> UMBRELLA["See umbrella with 3 sub-tabs:<br/>[Admin Nav] [Page Metadata] [Page Tabs]"]
    UMBRELLA --> CLICK_PT["Click 'Page Tabs'"]
    CLICK_PT --> LAND["Land on<br/>/admin/navigation/page-tabs"]

    LAND --> SELECT_MOD["Select module from dropdown<br/>e.g. 'admission'"]
    SELECT_MOD --> SELECT_SCOPE["Select scope:<br/>○ Global<br/>● Institution X"]
    SELECT_SCOPE --> LOAD_TREE["UI fetches via<br/>page-tabs-service.listDefinitions<br/>+ listOverrides"]

    LOAD_TREE --> SEE_TREE["See 3-tier tab tree<br/>with current values<br/>(institution overrides applied)"]

    SEE_TREE --> FIND["Find 'admission.leads.kanban' row<br/>(label currently 'Kanban')"]
    FIND --> CLICK_EDIT["Click [Edit] button"]
    CLICK_EDIT --> DIALOG["&lt;TabEditDialog /&gt; opens"]

    DIALOG --> SHOW_FIELDS["Dialog shows:<br/>• Code default: 'Kanban' (read-only)<br/>• Override label: [____]<br/>• Override icon: [____]<br/>• Override perm: [____]<br/>• Hidden: [ ]"]

    SHOW_FIELDS --> TYPE["Admin types 'Board' in label override"]
    TYPE --> CLICK_SAVE["Click [Save]"]
    CLICK_SAVE --> CALL_RPC["useUpsertPageTab mutation<br/>→ fn_upsert_page_tab(<br/>tab_key='admission.leads.kanban',<br/>scope='institution', scope_id=X,<br/>label_override='Board')"]

    CALL_RPC --> VALIDATE{"RPC validates:<br/>- is_super_admin OR is_admin?<br/>- tab_key exists?<br/>- depth ≤ 3?<br/>- narrow-only perm rule?"}
    VALIDATE -->|"❌ fail"| ERROR["Toast: error message"]
    VALIDATE -->|"✅ pass"| UPSERT["UPSERT into page_tab_overrides"]

    UPSERT --> INVALIDATE["TanStack Query<br/>invalidates ['page-tabs']"]
    INVALIDATE --> UI_UPDATE["Admin UI: row badge<br/>changes from 'Code' to<br/>'Code · overridden'"]

    UI_UPDATE --> VERIFY["Admin opens new tab to<br/>/admission/leads (as inst-X user)"]
    VERIFY --> SEE_NEW["✨ Chip now reads 'Board'<br/>for institution X users only"]

    classDef start fill:#10b981,stroke:#047857,color:#fff
    classDef gate fill:#f59e0b,stroke:#b45309,color:#fff
    classDef action fill:#3b82f6,stroke:#1e40af,color:#fff
    classDef bad fill:#ef4444,stroke:#991b1b,color:#fff
    classDef good fill:#10b981,stroke:#047857,color:#fff
    class START start
    class VALIDATE gate
    class CLICK_PT,SELECT_MOD,CLICK_EDIT,TYPE,CLICK_SAVE,VERIFY action
    class ERROR bad
    class SEE_NEW good
```

---

## Flow 3 — Admin: Hiding a Tab Globally

```mermaid
flowchart LR
    A([👤 Admin]) --> B["/admin/navigation/page-tabs"]
    B --> C["Select module + scope='Global'"]
    C --> D["Find target tab in tree"]
    D --> E["Click [Hide] toggle"]
    E --> F["Confirm prompt"]
    F --> G["fn_upsert_page_tab<br/>{hidden: true, scope: 'global'}"]
    G --> H["Override row written"]
    H --> I["Tree row shows greyed-out<br/>+ 'Hidden globally' badge"]
    I --> J["✨ End users (all institutions)<br/>no longer see that chip"]

    K["💡 To unhide: click<br/>[⟲ Reset to default]<br/>OR toggle Hide off"] -.-> I

    classDef start fill:#10b981,stroke:#047857,color:#fff
    classDef good fill:#10b981,stroke:#047857,color:#fff
    classDef note fill:#94a3b8,stroke:#475569,color:#fff
    class A start
    class J good
    class K note
```

---

## Flow 4 — Admin: Adding a New Admin-Authored Tab

This is for tabs that don't exist in code yet — admin wants to surface a route as a tab.

```mermaid
flowchart TD
    START([👤 Admin]) --> A["/admin/navigation/page-tabs"]
    A --> B["Click [Add tab] button"]
    B --> DIALOG["&lt;AddTabDialog /&gt; opens"]

    DIALOG --> ENTER["Admin enters:<br/>• Module: admission ▼<br/>• Parent: admission.leads ▼<br/>• Label: 'Pipeline'<br/>• href: [autocomplete from manifest]<br/>• icon: 🔍 picker<br/>• Permission: leads.view ▼"]

    ENTER --> AUTOCOMPLETE{"href in route<br/>manifest?"}
    AUTOCOMPLETE -->|"❌ no"| REJECT["Inline error:<br/>'Path /admission/foo does not exist.<br/>Add page.tsx first.'"]
    AUTOCOMPLETE -->|"✅ yes"| VALID["Validate depth ≤ 3<br/>(parent depth + 1)"]

    VALID --> SAVE["Click [Create]"]
    SAVE --> RPC["fn_upsert_page_tab<br/>(mode='definition',<br/>source='admin',<br/>tab_key=…)"]
    RPC --> INSERT["INSERT into page_tab_definitions<br/>(source='admin')"]
    INSERT --> APPEAR["✨ New row appears in tree<br/>with badge 'Admin-added'"]

    APPEAR --> VISIBLE["End users with leads.view permission<br/>see the new chip"]

    REJECT --> ENTER

    classDef start fill:#10b981,stroke:#047857,color:#fff
    classDef gate fill:#f59e0b,stroke:#b45309,color:#fff
    classDef bad fill:#ef4444,stroke:#991b1b,color:#fff
    classDef good fill:#10b981,stroke:#047857,color:#fff
    class START start
    class AUTOCOMPLETE gate
    class REJECT bad
    class APPEAR,VISIBLE good
```

---

## Flow 5 — Developer: Adding a New Page

The developer's lifecycle for a new module page, end to end.

```mermaid
flowchart TD
    START([👨‍💻 Developer]) --> CREATE["Create<br/>app/(routes)/admission/<br/>insights/page.tsx"]

    CREATE --> NAVMETA{"Add navMeta?<br/>(optional)"}
    NAVMETA -->|"yes"| EXPORT["export const navMeta = {<br/>  label: 'Insights',<br/>  icon: 'BarChart'<br/>}"]
    NAVMETA -->|"no"| SKIP1["Filename auto-titlecased"]
    EXPORT --> PERMS
    SKIP1 --> PERMS

    PERMS["Add permission to<br/>lib/constants/permissions.ts<br/>'admission.insights.view'"] --> SIDEBAR

    SIDEBAR["Add MENU_PERMISSIONS entry<br/>'/admission/insights' → 'admission.insights.view'<br/>in lib/sidebarMenuLink.ts"] --> ROLES

    ROLES["Seed permission for relevant roles<br/>(via UI or migration)"] --> NAVCFG{"Module already has<br/>nav-config.ts?"}

    NAVCFG -->|"yes (admission does)"| ADD_CFG["Add to admission/nav-config.ts<br/>under appropriate group"]
    NAVCFG -->|"no"| SKIP2["Filesystem auto-discovery<br/>will pick it up"]

    ADD_CFG --> RUN
    SKIP2 --> RUN

    RUN["npm run gen:routes"] --> EMIT["scripts emit:<br/>• route-manifest.generated.ts<br/>• route-tab-seed.generated.json<br/>• menu-permissions.generated.json"]

    EMIT --> CI["git commit + push<br/>→ CI runs check:tab-coverage"]
    CI --> CI_OK{"CI passes?"}
    CI_OK -->|"❌ no"| FIX["Fix orphan/depth/collision<br/>issues, push again"]
    CI_OK -->|"✅ yes"| MERGE["Merge PR"]

    FIX --> RUN

    MERGE --> DEPLOY["Deploy"]
    DEPLOY --> POSTDEPLOY["postdeploy hook<br/>runs sync:tabs"]
    POSTDEPLOY --> RPC["fn_resync_tab_definitions_from_seed<br/>UPSERTs source='filesystem'<br/>or source='nav-config' rows"]

    RPC --> ADMIN_SEES["👤 Admin opens<br/>/admin/navigation/page-tabs"]
    ADMIN_SEES --> GHOST["Sees 'admission.insights'<br/>as ghost row<br/>(badge: 'Code')"]

    GHOST --> USER_SEES["✨ End user with permission<br/>sees the new tab automatically<br/>— no admin action required"]

    classDef start fill:#10b981,stroke:#047857,color:#fff
    classDef gate fill:#f59e0b,stroke:#b45309,color:#fff
    classDef action fill:#3b82f6,stroke:#1e40af,color:#fff
    classDef good fill:#10b981,stroke:#047857,color:#fff
    classDef bad fill:#ef4444,stroke:#991b1b,color:#fff
    class START start
    class NAVMETA,NAVCFG,CI_OK gate
    class CREATE,EXPORT,PERMS,SIDEBAR,ROLES,ADD_CFG,RUN action
    class FIX bad
    class GHOST,USER_SEES good
```

**Developer-experience win**: steps 1, 6, 7, 8 are mandatory. Steps 2 (navMeta), 4 (sidebar entry — only if it should appear in sidebar), 5 (permissions seed — usually a separate role-mgmt task), and the nav-config edit are optional. The minimum viable contribution is **create page.tsx + permission key + run gen:routes + commit**.

---

## Flow 6 — Combined Swimlane: All Three User Roles

Shows how the three user types interact with the same system simultaneously.

```mermaid
sequenceDiagram
    autonumber
    actor Dev as 👨‍💻 Developer
    actor Admin as 👤 Admin
    actor User as 👤 End User
    participant Code as Source Code
    participant Build as Build/CI
    participant DB as Supabase
    participant App as Live App

    rect rgb(220, 235, 250)
        Note over Dev,App: Phase 1 — Developer ships a new module page
        Dev->>Code: create app/(routes)/admission/insights/page.tsx
        Dev->>Code: add MENU_PERMISSIONS entry
        Dev->>Build: npm run gen:routes
        Build->>Code: emit route-tab-seed.generated.json
        Dev->>Build: git push (CI gate runs)
        Build-->>Dev: ✅ check:tab-coverage passes
        Dev->>App: deploy
        App->>DB: postdeploy: fn_resync_tab_definitions_from_seed
        DB->>DB: INSERT page_tab_definitions row<br/>(source='filesystem')
    end

    rect rgb(250, 235, 220)
        Note over Dev,App: Phase 2 — Admin customizes for their institution
        Admin->>App: open /admin/navigation/page-tabs
        App->>DB: listDefinitions('admission') + listOverrides
        DB-->>App: tree (with new 'insights' ghost row)
        Admin->>App: click Edit on 'insights' row
        Admin->>App: rename to 'Analytics' for inst X
        App->>DB: fn_upsert_page_tab (override, scope=institution, scope_id=X)
        DB->>DB: UPSERT page_tab_overrides
    end

    rect rgb(220, 250, 230)
        Note over Dev,App: Phase 3 — End user (in inst X) sees the result
        User->>App: navigate to /admission
        App->>DB: fn_get_resolved_page_tabs('admission', X)
        Note over DB: Apply institution > global > defaults<br/>Filter by user_has_permission()
        DB-->>App: ResolvedTab[] (with 'Analytics' label)
        App-->>User: tier-1 chips include [Analytics]
        User->>App: click [Analytics] chip
        App-->>User: navigate to /admission/insights, page loads
    end
```

---

## Flow 7 — End User Permission Decision Tree

What the user actually experiences as the resolver decides each tab's visibility.

```mermaid
flowchart TD
    USER([👤 End user lands on<br/>/admission]) --> FETCH["Browser fetches via<br/>useDynamicTabs('admission', userInstId)"]
    FETCH --> RPC["fn_get_resolved_page_tabs"]

    RPC --> LOOP{{"For each tab in module 'admission':"}}

    LOOP --> CHECK1{"is_active=true?"}
    CHECK1 -->|"❌"| SKIP1["Skip tab"]
    CHECK1 -->|"✅"| CHECK2{"hidden=false<br/>(after merge)?"}

    CHECK2 -->|"❌"| SKIP2["Skip tab"]
    CHECK2 -->|"✅"| CHECK3{"is_super_admin()?"}

    CHECK3 -->|"✅"| SHOW1["✨ Tab returned"]
    CHECK3 -->|"❌"| CHECK4{"required_permission<br/>resolved to non-NULL?"}

    CHECK4 -->|"❌ NULL"| SKIP3["Skip tab<br/>(sidebar parity §14.1)"]
    CHECK4 -->|"✅ has key"| CHECK5{"user_has_permission(<br/>required_permission)?"}

    CHECK5 -->|"❌"| SKIP4["Skip tab"]
    CHECK5 -->|"✅"| CHECK6{"required_permission_override<br/>also set?"}

    CHECK6 -->|"❌ no override"| SHOW2["✨ Tab returned"]
    CHECK6 -->|"✅"| CHECK7{"user_has_permission(<br/>override permission)?"}

    CHECK7 -->|"❌"| SKIP5["Skip tab<br/>(narrow-only rule)"]
    CHECK7 -->|"✅"| SHOW3["✨ Tab returned"]

    SHOW1 --> COLLECT[Add to result set]
    SHOW2 --> COLLECT
    SHOW3 --> COLLECT
    COLLECT --> NEXT[Next tab]
    SKIP1 --> NEXT
    SKIP2 --> NEXT
    SKIP3 --> NEXT
    SKIP4 --> NEXT
    SKIP5 --> NEXT

    NEXT --> DONE{"All tabs<br/>processed?"}
    DONE -->|"no"| LOOP
    DONE -->|"yes"| RETURN["Return ResolvedTab[]"]

    RETURN --> RENDER["&lt;AutoTabNav /&gt; renders<br/>only the tabs returned"]

    RENDER --> EXPERIENCE["👤 User sees ONLY tabs they can use.<br/>No greyed chips. No 403 errors."]

    classDef gate fill:#f59e0b,stroke:#b45309,color:#fff
    classDef good fill:#10b981,stroke:#047857,color:#fff
    classDef bad fill:#94a3b8,stroke:#475569,color:#fff
    classDef ux fill:#3b82f6,stroke:#1e40af,color:#fff
    class CHECK1,CHECK2,CHECK3,CHECK4,CHECK5,CHECK6,CHECK7,DONE gate
    class SHOW1,SHOW2,SHOW3,EXPERIENCE good
    class SKIP1,SKIP2,SKIP3,SKIP4,SKIP5 bad
    class RENDER ux
```

---

## Flow 8 — Admin's "Reset to Default" Recovery Flow

When admins need to undo their override (intentionally or accidentally).

```mermaid
flowchart LR
    A([👤 Admin]) --> B["See tab row<br/>with 'Code · overridden' badge"]
    B --> C{"Want to<br/>revert?"}

    C -->|"yes"| D["Click [⟲ Reset to default]"]
    D --> E["Confirm dialog:<br/>'Remove override and<br/>fall back to code defaults?'"]
    E --> F["fn_delete_page_tab_override<br/>(tab_key, scope)"]
    F --> G["DELETE FROM page_tab_overrides<br/>WHERE tab_key=… AND scope=…"]
    G --> H["Badge changes back to 'Code'"]
    H --> I["✨ End users see code defaults again<br/>on next refetch"]

    C -->|"no"| J["Tab continues to use override"]

    K["💡 Note: this only resets<br/>the current scope's override.<br/>Other scopes' overrides remain."] -.-> H

    classDef start fill:#10b981,stroke:#047857,color:#fff
    classDef gate fill:#f59e0b,stroke:#b45309,color:#fff
    classDef good fill:#10b981,stroke:#047857,color:#fff
    classDef note fill:#94a3b8,stroke:#475569,color:#fff
    class A start
    class C gate
    class I good
    class K note
```

---

## Flow 9 — Day-in-the-Life Personas

```mermaid
journey
    title End User: Aravind (Faculty, Admission Counselor)
    section Morning login
      Open app: 5: Aravind
      Land on dashboard: 5: Aravind
      Click Admission CRM in sidebar: 5: Aravind
    section Working with leads
      See tier-1 [Leads] [Counselors] [Expo] chips: 5: Aravind
      Click Leads (default already active): 4: Aravind
      See tier-2 [Kanban] [List] chips: 5: Aravind
      Click List: 5: Aravind
      View leads in table view: 5: Aravind
    section Outcome
      Never saw Analytics tab (no permission): 5: Aravind
      Workflow uninterrupted: 5: Aravind
```

```mermaid
journey
    title Admin: Priya (Institution Coordinator)
    section Discovery
      Hear from staff that 'Kanban' is confusing: 3: Priya
      Open /admin/navigation/page-tabs: 4: Priya
    section Configuration
      Select scope = my institution: 5: Priya
      Find admission.leads.kanban: 5: Priya
      Click Edit, change label to 'Board': 5: Priya
      Click Save: 5: Priya
    section Verification
      Open new tab to /admission/leads: 5: Priya
      See chip now reads 'Board': 5: Priya
      Confirm via screenshot to staff: 5: Priya
```

```mermaid
journey
    title Developer: Boobalan (Adding /admission/insights)
    section Code
      Create page.tsx + navMeta export: 5: Boobalan
      Add permission key: 4: Boobalan
      Add MENU_PERMISSIONS entry: 4: Boobalan
      Run npm run gen:routes: 5: Boobalan
    section CI
      Open PR: 5: Boobalan
      check:tab-coverage passes: 5: Boobalan
      Merge: 5: Boobalan
    section Outcome
      sync:tabs auto-runs after deploy: 5: Boobalan
      Admin sees ghost row in /admin/navigation/page-tabs: 5: Boobalan
      Faculty users with permission see new chip: 5: Boobalan
```

---

## Flow 10 — When Things Go Wrong (Failure Modes)

Common errors and how each user type encounters them.

```mermaid
flowchart TB
    subgraph DEV["👨‍💻 Developer-side failures"]
        D1[Forgot to add MENU_PERMISSIONS] -->|build| DF1[CI: check:tab-coverage<br/>'orphan route']
        D2[Cycle in parent_tab_key] -->|build| DF2[CI: check:tab-coverage<br/>'broken hierarchy']
        D3[Tab depth > 3] -->|build| DF3[CI: check:tab-coverage<br/>'depth exceeded']
        D4[Two pages with same tab_key] -->|build| DF4[CI: check:tab-coverage<br/>'collision']
    end

    subgraph ADMIN["👤 Admin-side failures"]
        A1[Set hidden=true accidentally] -->|user reports| AF1[Admin sees ⟲ button → reverts]
        A2[Add tab pointing to nonexistent href] -->|inline validation| AF2[Reject before save]
        A3[Set permission override that excludes self] -->|RPC checks narrow-only| AF3[Save succeeds; admin can still edit via super_admin OR is_admin write policy]
        A4[Delete a row with admin source] -->|FK CASCADE| AF4[Override row also deleted]
    end

    subgraph USER["👤 End-user-side failures"]
        U1[Permission revoked mid-session] -->|next refetch| UF1[Tab disappears silently]
        U2[Tab href returns 404] -->|click| UF2[Standard 404 page;<br/>admin sees report;<br/>removes the tab]
        U3[Slow first paint while RPC runs] -->|fallback| UF3[Static nav-config.ts result<br/>renders first;<br/>DB tabs hydrate after]
    end

    classDef fail fill:#ef4444,stroke:#991b1b,color:#fff
    classDef recovery fill:#10b981,stroke:#047857,color:#fff
    class DF1,DF2,DF3,DF4,AF2,UF2 fail
    class AF1,AF3,AF4,UF1,UF3 recovery
```

---

## How to View

1. **VS Code**: open this file → `Ctrl+K V` for live preview.
2. **GitHub**: push the file → all Mermaid renders as SVG in the web UI.
3. **Mermaid Live Editor**: <https://mermaid.live> — paste any single block.
4. **Visual Companion**: tell me "use visual companion for the admin UI mockup" if you want browser-based mockups beyond Mermaid.

---

## Mapping to Spec Sections

| Flow | Maps to spec section(s) |
|---|---|
| 1. End User Navigation | §5.1 substrate, §9 render bridge, §11 permissions |
| 2. Admin Renames Tab | §10 admin UI, §7.2 fn_upsert_page_tab |
| 3. Admin Hides Globally | §10 admin UI, §6.2 hidden column |
| 4. Admin Adds New Tab | §10 admin UI, §14.3 href validation |
| 5. Developer Adds Page | §8 build-time discovery, §15 acceptance criteria #3 |
| 6. Combined Swimlane | §5 architecture, all phases |
| 7. End User Permission Tree | §11 permissions, §14.1 LOCKED parity rule |
| 8. Admin Reset to Default | §7.4 fn_delete_page_tab_override |
| 9. Personas | UX coverage |
| 10. Failure Modes | §13 testing, §14 risks |
