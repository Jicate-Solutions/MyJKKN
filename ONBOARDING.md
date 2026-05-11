# MyJKKN — Board of Studies (BOS) Module

## Overview

The BOS module manages the academic governance structure for JKKN institutions. It covers board compositions, member management, meetings, taxonomy configuration, and syllabus/course outcome mapping.

---

## Architecture

### Entity Hierarchy

```
Institution
  └── Board (bos_boards — synced from COE API)
        ├── Composition (bos_compositions — academic year term)
        │     └── Members (bos_members — chairman, internal, external…)
        └── Programmes (bos_board_programmes — UEN, UCM, UTA…)
              └── Programme Outcomes per Regulation
                    ├── POs  (bos_programme_outcomes)
                    └── PSOs (bos_programme_specific_outcomes)

Regulation (regulations — local MyJKKN table)
  └── Taxonomy Config (bos_regulation_taxonomies — framework + K-values)
        └── Programme Outcomes → linked via regulation_id + programme_code
```

### Key Design Decisions

| Decision | Reason |
|---|---|
| `board_id` is a bare UUID (no FK) | Board data comes from the COE REST API, not local DB |
| `regulation_id` has an FK to `regulations` | `regulations` is local to MyJKKN Supabase — CASCADE delete keeps data clean |
| POs/PSOs in normalized tables, not JSONB | Enables per-programme chairman write access via RLS |
| `is_board_chairman_for_programme()` SECURITY DEFINER | RLS policy helper that joins across staff → members → compositions → board_programmes without exposing those tables |
| `useInstitutionContext()` everywhere (not `useAuth`) | Resolves COE↔MyJKKN institution bridge correctly for CAS Aided+Self dedup |

---

## Database Tables

### Core BOS Tables (existing)

| Table | Description |
|---|---|
| `bos_boards` | Local copy of COE board metadata (board_code, board_name) |
| `bos_compositions` | Academic year compositions per board |
| `bos_members` | Members of a composition (chairman, internal, external, alumni…) |
| `bos_meetings` | Board meetings |
| `bos_regulation_taxonomies` | Taxonomy framework + K-values per regulation |
| `bos_taxonomy` | Taxonomy master list (Bloom's, Fink's, etc.) |
| `bos_taxonomy_levels` | Levels within a taxonomy (K1–K6) |
| `bos_course_syllabi` | Syllabus documents per course |

### New Tables (migrated 2026-05-11)

| Table | Description |
|---|---|
| `bos_board_programmes` | Programmes a board governs (UEN, UCM, UTA…) |
| `bos_programme_outcomes` | POs per regulation + programme (PO1…POn) |
| `bos_programme_specific_outcomes` | PSOs per regulation + programme (PSO1…PSOn) |

### DB Function

```sql
is_board_chairman_for_programme(p_institutions_id UUID, p_programme_code VARCHAR)
  → BOOLEAN (SECURITY DEFINER)
```
Returns `true` if the calling auth user is chairman in any active composition of a board that governs the given programme. Used in RLS `WITH CHECK` policies for PO/PSO write operations.

---

## Access Control

| Role | Board Programmes | PO/PSO Read | PO/PSO Write |
|---|---|---|---|
| `super_admin` | Full | All | All |
| `admin` | Full | Institution | Institution |
| Board Chairman | — | Programme | Own programme only |
| Other members | — | Programme | ❌ |

Chairman = `bos_members.member_type = 'chairman'` in an active composition (`is_active = true`) for any board that governs the target programme.

---

## API Routes

### Boards
```
GET  /api/bos/boards                              List boards for institution
GET  /api/bos/boards/[id]/programmes              List programmes on a board
POST /api/bos/boards/[id]/programmes              Add programme to board
DELETE /api/bos/boards/[id]/programmes?programmeCode=UEN  Remove programme
```

### Taxonomy
```
GET  /api/bos/taxonomy/[regulationId]             Get framework + K-values
POST /api/bos/taxonomy/[regulationId]             Save framework + K-values
GET  /api/bos/taxonomy/[regulationId]/programmes  List programmes with po_count, pso_count, can_edit
GET  /api/bos/taxonomy/[regulationId]/programmes/[code]/pos   List POs
POST /api/bos/taxonomy/[regulationId]/programmes/[code]/pos   Batch-replace POs
GET  /api/bos/taxonomy/[regulationId]/programmes/[code]/psos  List PSOs
POST /api/bos/taxonomy/[regulationId]/programmes/[code]/psos  Batch-replace PSOs
```

### Other
```
GET  /api/bos/regulations                         List regulations
GET  /api/bos/compositions                        List compositions (with board join)
GET  /api/bos/programs?institutionId=...          List COE-synced programmes for institution
```

---

## UI Pages

| Path | Description |
|---|---|
| `/bos/taxonomy` | Regulation → taxonomy assignment list |
| `/bos/taxonomy/[regulationId]` | Configure: Step 1 (framework + K-values), Step 2 (PO/PSO per programme) |
| `/bos/compositions` | Compositions list |
| `/bos/compositions/[id]` | Composition detail — members + board programmes card |
| `/bos/meetings` | Meetings list |
| `/bos/courses` | Courses list |
| `/bos/course-scheme` | Course scheme (semester-grouped) |

---

## Configuration Workflow

### First-time Setup (Admin)

1. **Sync boards from COE** — boards appear in `bos_boards` after sync
2. **Create a composition** → `/bos/compositions/new`
   - Select a board, set academic year, term dates
3. **Add members** → open composition → Add Member
   - Designate one member as `chairman`
4. **Assign programmes** → open composition → scroll to "Programmes Governed by this Board"
   - Pick UEN / UCM / UTA etc. from the institution's programme list

### Taxonomy Configuration (Admin or Chairman)

1. Go to `/bos/taxonomy`
2. Click **Configure** on a regulation
3. **Step 1** — Select taxonomy framework (Bloom's / Fink's), set K1–K6 descriptions → **Save Framework**
4. **Step 2** — Expand each programme card:
   - Enter POs (PO1…PO12) → **Save POs**
   - Enter PSOs (PSO1…PSOn, optional) → **Save PSOs**
   - Only the chairman for that programme can edit (others see read-only view)

---

## Key Hooks & Utilities

```ts
// Institution resolution (always use this in BOS, not useAuth)
import { useInstitutionContext } from '@/hooks/use-institution-context';
const { data } = useInstitutionContext();
const institutionId = data?.myjkkn_id; // UUID for Supabase queries

// BOS access scope (server-side)
import { resolveBosAccess } from '@/lib/utils/bos/bos-access';
const scope = await resolveBosAccess(user.id);
// scope.isSuperAdmin, scope.institutionsId, scope.userInstitutionId

// Chairman check (server-side, single programme)
import { isChairmanForProgramme } from '@/lib/utils/bos/bos-chairman-access';
const canEdit = await isChairmanForProgramme(userId, 'UEN', institutionsId);

// Chairman check (server-side, batch — for list endpoints)
import { getChairmanProgrammes } from '@/lib/utils/bos/bos-chairman-access';
const chairSet = await getChairmanProgrammes(userId, ['UEN','UCM'], institutionsId);

// PO flattening for syllabus CO→PO mapping
import { flattenPos } from '@/hooks/bos/use-bos-taxonomy';
const flat = flattenPos(taxonomy?.pos); // { PO1: "desc", PO2: "desc" }
```

---

## Institution Resolution (Server-side Fallback Chain)

The BOS API uses a 4-level fallback to resolve `institutionsId` for any request:

```
1. body.institutions_id          (explicit override, super-admin use)
2. scope.institutionsId          (from bos_access role)
3. scope.userInstitutionId       (from user's staff profile)
4. regulations.institution_id    (looked up from the regulationId param)
```

This ensures super-admins (who have no institution on their profile) can still create/read taxonomy records.

---

## React Query Key Conventions

| Key | Used for |
|---|---|
| `['bos', 'taxonomy-assignments']` | Regulation→taxonomy list on `/bos/taxonomy` |
| `['bos', 'regulation-taxonomy-config', regulationId]` | Single taxonomy config (configure page) |
| `['bos', 'regulation-programmes', regulationId]` | Programme summary list with po_count/pso_count |
| `['bos', 'programme-pos', regulationId, code]` | PO rows for one programme |
| `['bos', 'programme-psos', regulationId, code]` | PSO rows for one programme |
| `['bos', 'board-programmes', boardId]` | Programmes assigned to a board |
| `['bos', 'institution-programs', institutionsId]` | COE-synced programmes for institution |

**Important:** The configure page uses `['bos', 'regulation-taxonomy-config', regulationId]` — **not** `['bos', 'taxonomy', regulationId]` — to avoid key collision with `useBosTaxonomy` (which uses the latter and throws on 404).
