// lib/services/events/marathon/marathon-budget-service.ts
// BACKWARD-COMPAT SHIM (Events Platform Promotion PR2). The budget service was promoted to the shared
// events layer; this path re-exports the canonical EventBudgetService (now reading event_budget_items)
// so existing marathon imports keep working unchanged. Remove in the cleanup PR.
export {
  EventBudgetService as MarathonBudgetService,
  type BudgetSummary,
} from '@/lib/services/events/shared/event-budget-service';
