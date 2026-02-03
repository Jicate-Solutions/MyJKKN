# Solutions Hub Hooks Migration Report

**Generated:** 2026-02-03
**Agent:** HOOKS
**Status:** COMPLETE

---

## Executive Summary

Successfully analyzed MyJKKN hook patterns and created a comprehensive hooks layer for Solutions Hub integration into MyJKKN.

### Files Created

| File | Purpose | Hooks Count |
|------|---------|-------------|
| `hooks/solutions/use-solutions.ts` | Core solutions CRUD | 6 |
| `hooks/solutions/use-phases.ts` | Phases, iterations, bugs, deployments | 12 |
| `hooks/solutions/use-clients.ts` | Client management | 7 |
| `hooks/solutions/use-builders.ts` | Builder talent pool | 17 |
| `hooks/solutions/use-builder-portal.ts` | Builder portal (talent-facing) | 13 |
| `hooks/solutions/use-training.ts` | Programs, sessions, cohort members | 24 |
| `hooks/solutions/use-cohort-portal.ts` | Cohort portal (talent-facing) | 11 |
| `hooks/solutions/use-content.ts` | Orders and deliverables | 17 |
| `hooks/solutions/use-production-portal.ts` | Production portal (talent-facing) | 10 |
| `hooks/solutions/use-discovery.ts` | Visits and communications | 13 |
| `hooks/solutions/use-payments.ts` | Payment management | 8 |
| `hooks/solutions/use-earnings.ts` | Earnings ledger | 10 |
| `hooks/solutions/use-publications.ts` | Publications and accreditation | 10 |
| `hooks/solutions/index.ts` | Central export file | - |
| `lib/query-keys.ts` | Updated with Solutions Hub keys | - |

**Total Hooks Created:** 158

---

## Query Keys Structure

Updated `lib/query-keys.ts` with the following structure:

```typescript
solutionsHubKeys = {
  all: ['solutions-hub'],
  clients: { all, list, detail, industries },
  solutions: { all, list, detail, stats },
  phases: { all, list, detail, bySolution, stats, nextNumber },
  mous: { all, list, detail, bySolution },
  builders: { all, list, detail, stats, available },
  builderAssignments: { all, pending, byStatus, approvalCheck },
  builderPortal: { all, profile, overview, assignments, availablePhases, skills, earnings },
  trainingPrograms: { all, list, detail, bySolution },
  trainingSessions: { all, list, detail, byProgram, canSelfClaim },
  cohortMembers: { all, list, detail, byUser, stats, availableSessions },
  cohortPortal: { all, profile, member, availableSessions, schedule, upcoming, completed, earnings, levelProgress, dashboard },
  contentOrders: { all, list, detail, bySolution, byDivision, stats },
  contentDeliverables: { all, list, detail, byOrder },
  productionLearners: { all, list, detail, byUser },
  productionPortal: { all, learner, stats, availableWork, allAvailableWork, myWork, myActiveWork, earnings, submission },
  discoveryVisits: { all, list, detail, byClient },
  communications: { all, list, detail, byClient },
  payments: { all, list, detail, stats, monthlyBatch },
  earnings: { all, list, byRecipient, summary, total, byDepartment, monthlyReport },
  publications: { all, list, detail, stats, contributors },
  accreditation: { all, metrics },
  departmentDashboard: { all, stats }
}
```

---

## Hooks by Module

### 1. Core Solutions

| Hook | Type | Purpose |
|------|------|---------|
| `useSolutions` | Query | List solutions with filters |
| `useSolution` | Query | Get single solution |
| `useSolutionStats` | Query | Dashboard statistics |
| `useCreateSolution` | Mutation | Create new solution |
| `useUpdateSolution` | Mutation | Update solution |
| `useDeleteSolution` | Mutation | Delete solution |

### 2. Phases

| Hook | Type | Purpose |
|------|------|---------|
| `usePhases` | Query | List phases |
| `usePhase` | Query | Get single phase |
| `useSolutionPhases` | Query | Phases by solution |
| `usePhaseStats` | Query | Phase statistics |
| `useNextPhaseNumber` | Query | Next phase number |
| `useCreatePhase` | Mutation | Create phase |
| `useUpdatePhase` | Mutation | Update phase |
| `useDeletePhase` | Mutation | Delete phase |
| `useCreateIteration` | Mutation | Create prototype iteration |
| `useUpdateIteration` | Mutation | Update iteration |
| `useCreateBugReport` | Mutation | Create bug report |
| `useUpdateBugReport` | Mutation | Update bug status |
| `useCreateDeployment` | Mutation | Create deployment record |

### 3. Clients

| Hook | Type | Purpose |
|------|------|---------|
| `useClients` | Query | List clients |
| `useClient` | Query | Get single client |
| `useClientIndustries` | Query | Industries for dropdown |
| `useCreateClient` | Mutation | Create client |
| `useUpdateClient` | Mutation | Update client |
| `useDeactivateClient` | Mutation | Soft delete |
| `useReactivateClient` | Mutation | Reactivate |
| `useIncrementReferralCount` | Mutation | Track referrals |

### 4. Builders (Software Module)

| Hook | Type | Purpose |
|------|------|---------|
| `useBuilders` | Query | List builders |
| `useBuilder` | Query | Get builder |
| `useBuilderStats` | Query | Builder statistics |
| `useAvailableBuildersForPhase` | Query | Available for phase |
| `usePendingAssignmentRequests` | Query | Pending approvals |
| `useAssignmentsByStatus` | Query | Filter by status |
| `useCheckAssignmentApproval` | Query | Check threshold |
| `useCreateBuilder` | Mutation | Create builder |
| `useUpdateBuilder` | Mutation | Update builder |
| `useDeleteBuilder` | Mutation | Delete builder |
| `useAddBuilderSkill` | Mutation | Add skill |
| `useUpdateBuilderSkill` | Mutation | Update proficiency |
| `useRemoveBuilderSkill` | Mutation | Remove skill |
| `useRequestAssignment` | Mutation | Request phase |
| `useApproveAssignment` | Mutation | Approve (HOD/MD) |
| `useStartAssignment` | Mutation | Start work |
| `useCompleteAssignment` | Mutation | Complete work |
| `useWithdrawAssignment` | Mutation | Withdraw |

### 5. Builder Portal

| Hook | Type | Purpose |
|------|------|---------|
| `useBuilderProfile` | Query | Get profile by user ID |
| `usePortalOverview` | Query | Dashboard data |
| `useMyAssignments` | Query | My assignments |
| `useAvailablePhases` | Query | Claimable phases |
| `useMySkills` | Query | My skills |
| `useMyBuilderEarnings` | Query | My earnings |
| `useClaimPhase` | Mutation | Claim phase |
| `useStartPhaseWork` | Mutation | Start work |
| `useCompletePhaseWork` | Mutation | Complete work |
| `useWithdrawFromPhase` | Mutation | Withdraw |
| `useAddMySkill` | Mutation | Add skill |
| `useUpdateMySkillProficiency` | Mutation | Update skill |
| `useRemoveMySkill` | Mutation | Remove skill |

### 6. Training Module

| Hook | Type | Purpose |
|------|------|---------|
| `useTrainingPrograms` | Query | List programs |
| `useTrainingProgram` | Query | Get program |
| `useTrainingProgramBySolution` | Query | By solution |
| `useTrainingSessions` | Query | List sessions |
| `useTrainingSession` | Query | Get session |
| `useSessionsByProgram` | Query | Sessions in program |
| `useCanSelfClaimSession` | Query | Check claimability |
| `useCohortMembers` | Query | List cohort members |
| `useCohortMember` | Query | Get cohort member |
| `useCohortMemberByUser` | Query | By user ID |
| `useCohortMemberStats` | Query | Statistics |
| `useAvailableSessionsForMember` | Query | Available sessions |
| `useCreateTrainingProgram` | Mutation | Create program |
| `useUpdateTrainingProgram` | Mutation | Update program |
| `useDeleteTrainingProgram` | Mutation | Delete program |
| `useCreateTrainingSession` | Mutation | Create session |
| `useUpdateTrainingSession` | Mutation | Update session |
| `useDeleteTrainingSession` | Mutation | Delete session |
| `useClaimSession` | Mutation | Claim session |
| `useAssignSession` | Mutation | Assign member |
| `useRemoveAssignment` | Mutation | Remove from session |
| `useCompleteSession` | Mutation | Mark complete |
| `useCreateCohortMember` | Mutation | Create member |
| `useUpdateCohortMember` | Mutation | Update member |
| `useDeleteCohortMember` | Mutation | Delete member |
| `useLevelUpCohortMember` | Mutation | Promote level |

### 7. Cohort Portal

| Hook | Type | Purpose |
|------|------|---------|
| `useCohortProfile` | Query | Get profile |
| `useCohortMemberById` | Query | Get member |
| `useAvailableSessions` | Query | Available sessions |
| `useMySchedule` | Query | My schedule |
| `useUpcomingSessions` | Query | Upcoming |
| `useCompletedSessions` | Query | Completed |
| `useMyCohortEarnings` | Query | My earnings |
| `useLevelProgress` | Query | Level progress |
| `useDashboardStats` | Query | Dashboard |
| `useClaimSessionMutation` | Mutation | Claim session |
| `useWithdrawFromSession` | Mutation | Withdraw |
| `useRequestLevelUp` | Mutation | Request promotion |

### 8. Content Module

| Hook | Type | Purpose |
|------|------|---------|
| `useContentOrders` | Query | List orders |
| `useContentOrder` | Query | Get order |
| `useContentOrderBySolution` | Query | By solution |
| `useOrdersByDivision` | Query | By division |
| `useContentOrderStats` | Query | Statistics |
| `useDeliverables` | Query | List deliverables |
| `useDeliverable` | Query | Get deliverable |
| `useDeliverablesByOrder` | Query | By order |
| `useCreateContentOrder` | Mutation | Create order |
| `useUpdateContentOrder` | Mutation | Update order |
| `useDeleteContentOrder` | Mutation | Delete order |
| `useCreateDeliverable` | Mutation | Create deliverable |
| `useUpdateDeliverable` | Mutation | Update deliverable |
| `useDeleteDeliverable` | Mutation | Delete deliverable |
| `useSubmitForReview` | Mutation | Submit work |
| `useRequestRevision` | Mutation | Request revision |
| `useApproveDeliverable` | Mutation | Approve |
| `useMarkDelivered` | Mutation | Mark delivered |

### 9. Production Portal

| Hook | Type | Purpose |
|------|------|---------|
| `useLearnerByUserId` | Query | Get learner |
| `useMyStats` | Query | Portal stats |
| `useAvailableWork` | Query | Available work |
| `useAllAvailableWork` | Query | All available |
| `useMyWork` | Query | My assignments |
| `useMyActiveWork` | Query | Active work |
| `useMyProductionEarnings` | Query | My earnings |
| `useDeliverableForSubmission` | Query | For submission |
| `useClaimWork` | Mutation | Claim deliverable |
| `useSubmitWork` | Mutation | Submit work |

### 10. Discovery & Communications

| Hook | Type | Purpose |
|------|------|---------|
| `useDiscoveryVisits` | Query | List visits |
| `useDiscoveryVisit` | Query | Get visit |
| `useClientDiscoveryVisits` | Query | By client |
| `useCommunications` | Query | List communications |
| `useCommunication` | Query | Get communication |
| `useClientCommunications` | Query | By client |
| `useCreateDiscoveryVisit` | Mutation | Create visit |
| `useUpdateDiscoveryVisit` | Mutation | Update visit |
| `useDeleteDiscoveryVisit` | Mutation | Delete visit |
| `useLinkVisitToResult` | Mutation | Link to solution |
| `useCreateCommunication` | Mutation | Create communication |
| `useUpdateCommunication` | Mutation | Update communication |
| `useDeleteCommunication` | Mutation | Delete communication |

### 11. Payments

| Hook | Type | Purpose |
|------|------|---------|
| `usePayments` | Query | List payments |
| `usePayment` | Query | Get payment |
| `usePaymentStats` | Query | Statistics |
| `useMonthlyBatch` | Query | Monthly batch |
| `useCreatePayment` | Mutation | Create payment |
| `useUpdatePayment` | Mutation | Update payment |
| `useDeletePayment` | Mutation | Delete payment |
| `useFlagPayment` | Mutation | Flag for review |
| `useAutoProcessPayments` | Mutation | Auto-process |

### 12. Earnings

| Hook | Type | Purpose |
|------|------|---------|
| `useEarnings` | Query | List earnings |
| `useEarningsByRecipient` | Query | By recipient |
| `useEarningsSummary` | Query | Summary |
| `useRecipientTotalEarnings` | Query | Total for recipient |
| `useDepartmentEarnings` | Query | By department |
| `useMonthlyEarningsReport` | Query | Monthly report |
| `useUpdateEarningsStatus` | Mutation | Update status |
| `useBulkUpdateEarningsStatus` | Mutation | Bulk update |
| `useApprovePaymentEarnings` | Mutation | Approve earnings |
| `useMarkEarningsAsPaid` | Mutation | Mark as paid |

### 13. Publications & Accreditation

| Hook | Type | Purpose |
|------|------|---------|
| `usePublications` | Query | List publications |
| `usePublication` | Query | Get publication |
| `usePublicationStats` | Query | Statistics |
| `useContributors` | Query | Contributors |
| `useAccreditationMetrics` | Query | NIRF/NAAC metrics |
| `useCreatePublication` | Mutation | Create publication |
| `useUpdatePublication` | Mutation | Update publication |
| `useDeletePublication` | Mutation | Delete publication |
| `useAddContributor` | Mutation | Add contributor |
| `useRemoveContributor` | Mutation | Remove contributor |

---

## Query Configuration Used

All hooks follow the MyJKKN `QUERY_CONFIG` patterns:

| Config | Used For |
|--------|----------|
| `STABLE_DATA` | Clients, industries, accreditation metrics |
| `SEMI_STABLE_DATA` | Solutions, phases, builders, cohort members, programs |
| `DYNAMIC_DATA` | Sessions, assignments, deliverables, payments, earnings |
| `DASHBOARD_DATA` | All statistics and overview endpoints |
| `USER_SESSION_DATA` | Portal profiles (builder, cohort, production) |

---

## Implementation Notes

### Service Layer Placeholder

All hooks currently have placeholder service implementations that throw errors. The services need to be implemented in:

```
lib/services/solutions/
├── solutions-service.ts
├── phases-service.ts
├── clients-service.ts
├── builders-service.ts
├── builder-portal-service.ts
├── training-service.ts
├── cohort-portal-service.ts
├── content-service.ts
├── production-portal-service.ts
├── discovery-service.ts
├── payments-service.ts
├── earnings-service.ts
├── publications-service.ts
└── index.ts
```

### Cache Invalidation Strategy

Each mutation properly invalidates related queries:
- List queries invalidated on create/update/delete
- Detail queries updated in cache on update
- Cross-module invalidation (e.g., payments -> earnings)

### Type Exports

All types are exported from the index file for use in components:
- Filter types (`*Filters`)
- Input types (`Create*Input`, `Update*Input`)
- Enum types (status, roles, etc.)

---

## Next Steps

1. **Services Implementation** - Create service layer files
2. **Types Definition** - Create `types/solutions-hub.ts`
3. **Components Migration** - Migrate UI components
4. **Routes Creation** - Create app routes
5. **Integration Testing** - Test with real data

---

## Files Location Summary

```
MyJKKN/
├── lib/
│   └── query-keys.ts          # Updated with solutionsHubKeys
├── hooks/
│   └── solutions/
│       ├── index.ts           # Central exports
│       ├── use-solutions.ts   # Core solutions
│       ├── use-phases.ts      # Phases management
│       ├── use-clients.ts     # Client management
│       ├── use-builders.ts    # Builder talent
│       ├── use-builder-portal.ts
│       ├── use-training.ts    # Training module
│       ├── use-cohort-portal.ts
│       ├── use-content.ts     # Content module
│       ├── use-production-portal.ts
│       ├── use-discovery.ts   # Discovery visits
│       ├── use-payments.ts    # Payments
│       ├── use-earnings.ts    # Earnings ledger
│       └── use-publications.ts # Publications
└── .claude/
    └── hooks-report.md        # This report
```

---

*Report generated by HOOKS agent for Solutions Hub -> MyJKKN merger*
