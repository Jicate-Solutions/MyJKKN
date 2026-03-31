# Work Pulse — Module Connections & Dependencies

## Entity Relationship

```
profiles ──────────┐
                    │ user_id (FK, CASCADE)
                    ▼
              wp_pulse_entries ◄──── institutions (FK)
                    │                     │
                    │                departments (FK, nullable)
                    │
                    │ (category matching — no FK)
                    ▼
              wp_patterns
                    │
          ┌─────────┼─────────┐
          │                   │
          ▼                   ▼
 wp_micro_interviews    wp_agent_impact
   (FK, CASCADE)          (FK, CASCADE)
```

## External Module Dependencies

### Read Dependencies (Work Pulse reads FROM these)

| Table | Module | Where Used | Purpose |
|-------|--------|-----------|---------|
| `profiles` | Organization | Service layer, all queries | User identity, role, institution_id, department_id |
| `institutions` | Organization | wp_pulse_entries FK | Institution scoping |
| `departments` | Organization | wp_pulse_entries FK, compliance tab | Department membership |
| `user_activity_logs` | Core Platform | analyze/route.ts | Silent Observer behavioral signals |

### Write Dependencies (Work Pulse writes TO these)

| Table | Module | Where Used | Purpose |
|-------|--------|-----------|---------|
| `notifications` | Notification System | notify/route.ts | Pulse reminders, training wins, agent alerts |
| `user_notifications` | Notification System | notify/route.ts | User→notification link |
| `bug_reports` | Bug Reporter | analyze/route.ts | Auto-route misclassified entries |

### Shared Components

| Component | Source Module | Where Used |
|-----------|-------------|-----------|
| `ContentLayout` | Admin Panel | All 3 pages |
| `PageBreadcrumb` | Admin Panel | All 3 pages |
| `Card, Button, Select, ...` | shadcn/ui | All components |
| `toast` (sonner) | UI System | Form submissions |
| `getEnhancedUserProfile` | Auth | Server actions, data fetchers |
| `createClient` | Supabase Server | Service layer |
| `createServiceRoleClient` | Supabase Server | API routes |

## Sidebar Integration

**File:** `lib/sidebarMenuLink.ts`

```typescript
// Lines 1817-1836
{
  groupLabel: 'Work Pulse',
  menus: [
    { href: '/work-pulse', label: 'My Pulse', icon: Activity },
    { href: '/work-pulse/agents', label: 'Agent Board', icon: Brain },
    { href: '/work-pulse/impact', label: 'Impact', icon: TrendingUp },
  ]
}
```

**Permission strings** (in `lib/constants/permissions.ts`):
- `work_pulse.view`
- `work_pulse.agents.view`
- `work_pulse.impact.view`

## Layout Integration

**File:** `app/(routes)/layout.tsx`

The WorkPulseFab component is added to the root dashboard layout alongside BugReporterWidget. It renders a floating Zap button on every page EXCEPT `/work-pulse` routes.

```typescript
import { WorkPulseFab } from '@/components/work-pulse-fab';
// ... inside layout:
<BugReporterWidget />
<WorkPulseFab />
```

## API Integration Points

### Claude API (External)
- **analyze/route.ts** — weekly pattern clustering (~$5-10/month)
- **translate/route.ts** — Tamil→English translation (~$2-5/month)
- **Env vars:** `ANTHROPIC_API_KEY` or `CLAUDE_API_KEY`

### Cron Jobs (External)
| Endpoint | Schedule | Auth |
|----------|----------|------|
| `POST /api/work-pulse/analyze` | Sunday 00:00 | x-api-key |
| `POST /api/work-pulse/notify?type=pulse_reminder` | Friday 16:00 | x-api-key |
| `POST /api/work-pulse/notify?type=pulse_followup` | Saturday 10:00 | x-api-key |
| `POST /api/work-pulse/notify?type=hod_compliance` | Monday 09:00 | x-api-key |

### Future Integration (TODO)
- **Solutions Hub** — sync high-tier patterns to solution pipeline (comment stub in analyze route)
- **OKR Module** — complementary data (OKRs = goals, Pulse = friction)
- **WhatsApp/Telegram** — alternative pulse submission channels (V2)

## Data Flow Diagram

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Browser    │────▶│ Server       │────▶│  Supabase       │
│   (React)    │     │ Actions      │     │  (RLS enforced) │
│              │     │              │     │                 │
│ WeeklyPulse  │     │ pulse-       │     │ wp_pulse_       │
│ Form         │────▶│ actions.ts   │────▶│ entries         │
│              │     │              │     │                 │
│ FAB          │────▶│ quick        │────▶│ (upsert on      │
│              │     │ submit       │     │  user_id+week)  │
└─────────────┘     └──────────────┘     └─────────────────┘

┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Cron Job   │────▶│ API Routes   │────▶│  Claude API     │
│   (weekly)   │     │              │     │  (Sonnet)       │
│              │     │ analyze/     │────▶│                 │
│              │     │ route.ts     │◀────│ Pattern JSON    │
│              │     │              │     │                 │
│              │     │      │       │     └─────────────────┘
│              │     │      ▼       │
│              │     │ wp_patterns  │
│              │     │ (upsert)     │
│              │     │      │       │
│              │     │      ▼       │
│              │     │ notifications│
└─────────────┘     └──────────────┘
```
