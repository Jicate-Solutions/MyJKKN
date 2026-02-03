# Solutions Hub Services Layer Report

**Generated:** 2026-02-03
**Agent:** SERVICES
**Status:** COMPLETE

## Overview

Created comprehensive service layer for Solutions Hub at `lib/services/solutions/` following MyJKKN BaseService patterns with pagination, timeout handling, and error management.

## Files Created

### Types
| File | Description |
|------|-------------|
| `types.ts` | All type definitions, enums, and interfaces for Solutions Hub |

### Core Services
| File | Tables | Methods |
|------|--------|---------|
| `solutions-service.ts` | sh_solutions | getSolutions, getSolutionById, getSolutionsByClientId, getSolutionsByDepartmentId, createSolution, updateSolution, deleteSolution, getSolutionStats, updateSolutionStatus |
| `phases-service.ts` | sh_solution_phases, sh_prototype_iterations, sh_bug_reports, sh_phase_deployments, sh_implementation_users | getPhases, getPhaseById, getPhasesBySolutionId, createPhase, updatePhase, deletePhase, getNextPhaseNumber, updatePhaseStatus, getPhaseStats, createIteration, updateIteration, getPhaseIterations, createBugReport, updateBugReport, getIterationBugs, createDeployment, getPhaseDeployments, addImplementationUser, getPhaseImplementationUsers, updateImplementationUserStatus |
| `clients-service.ts` | sh_clients, sh_client_referrals | getClients, getClientById, getClientByEmail, createClient, updateClient, deactivateClient, reactivateClient, incrementReferralCount, getClientIndustries, getClientStats, isPartner, getPartnerDiscountPercent, createReferral, getClientReferrals, markReferralPaid |

### Software Module
| File | Tables | Methods |
|------|--------|---------|
| `builders-service.ts` | sh_builders, sh_builder_skills, sh_builder_assignments | getBuilders, getBuilderById, getBuilderByUserId, createBuilder, updateBuilder, deleteBuilder, addBuilderSkill, updateBuilderSkill, removeBuilderSkill, getBuilderSkills, checkAssignmentApproval, requestAssignment, approveAssignment, startAssignment, completeAssignment, withdrawAssignment, getAssignmentsByStatus, getPendingAssignmentRequests, getAvailableBuildersForPhase, getBuilderStats |

### Training Module
| File | Tables | Methods |
|------|--------|---------|
| `training-service.ts` | sh_training_programs, sh_training_sessions, sh_cohort_assignments | getPrograms, getProgramById, getProgramBySolutionId, createProgram, updateProgram, deleteProgram, getSessions, getSessionById, getSessionsByProgramId, createSession, updateSession, deleteSession, canSelfClaimSession, claimSession, assignSession, removeAssignment, completeSession |
| `cohort-service.ts` | sh_cohort_members, sh_cohort_assignments | getCohortMembers, getCohortMemberById, getCohortMemberByUserId, createCohortMember, updateCohortMember, deleteCohortMember, levelUpCohortMember, addEarnings, getCohortStats, getLevelInfo, getTrackDisplayLabel, getAvailableSessionsForMember, getAssignmentsByMemberId, updateAssignment |

### Content Module
| File | Tables | Methods |
|------|--------|---------|
| `content-service.ts` | sh_content_orders, sh_content_deliverables | getOrders, getOrderById, getOrderBySolutionId, createOrder, updateOrder, deleteOrder, getOrdersByDivision, getOrderStats, getDeliverables, getDeliverableById, getDeliverablesByOrderId, createDeliverable, updateDeliverable, deleteDeliverable, requestRevision, approveDeliverable, rejectDeliverable, submitForReview, getDeliverableStats |
| `production-service.ts` | sh_production_learners, sh_production_assignments | getLearners, getLearnerById, getLearnersByDivision, createLearner, updateLearner, deleteLearner, getLearnerStats, createAssignment, claimDeliverable, completeAssignment, getAssignmentsByLearnerId, getAssignmentsByDeliverableId, getAvailableDeliverablesForDivision, addEarnings, updateSkillLevel |

### Support Services
| File | Tables | Methods |
|------|--------|---------|
| `discovery-service.ts` | sh_discovery_visits, sh_client_communications | getDiscoveryVisits, getDiscoveryVisitById, getClientDiscoveryVisits, createDiscoveryVisit, updateDiscoveryVisit, deleteDiscoveryVisit, linkVisitToResult, getCommunications, getCommunicationById, getClientCommunications, getSolutionCommunications, createCommunication, updateCommunication, deleteCommunication |
| `payments-service.ts` | sh_payments, sh_revenue_split_models | getPayments, getPaymentById, createPayment, updatePayment, deletePayment, getMonthlyBatch, getPaymentStats, flagPayment, getSplitType, calculateRevenueSplits, calculateAndDistributeSplits, getAllSplitModels, updateSplitModel, processAllPendingSplits |
| `earnings-service.ts` | sh_earnings_ledger | getEarnings, getEarningsByRecipient, getEarningsSummary, getRecipientTotalEarnings, updateEarningsStatus, bulkUpdateEarningsStatus, approvePaymentEarnings, markEarningsAsPaid, getDepartmentEarnings, getMonthlyEarningsReport |
| `publications-service.ts` | sh_publications, sh_publication_contributors, sh_accreditation_metrics | getPublications, getPublicationById, createPublication, updatePublication, deletePublication, getContributors, addContributor, removeContributor, getPublicationStats, calculateNIRFMetrics, calculateNAACCriteria, getAccreditationMetrics |
| `notifications-service.ts` | sh_notifications | getNotifications, getUnreadNotifications, getUnreadCount, getNotificationById, createNotification, createNotificationForUsers, markAsRead, markAllAsRead, deleteNotification, deleteOldNotifications, notifyPaymentReceived, notifyDeliverableStatus, notifyAssignmentApproved, notifyMouExpiring |

### Index
| File | Description |
|------|-------------|
| `index.ts` | Exports all services, types, and utility functions |

## Business Rules Implemented

### Assignment Thresholds (from SPEC)
| Solution Type | Self-Claim/HOD | MD Required |
|---------------|----------------|-------------|
| Software | <= 3 Lakh | > 3 Lakh |
| Training | <= 2 Lakh | > 2 Lakh |
| Content | <= 50K | > 50K |

### Partner Discount
- 50% auto-applied for: yi, alumni, mou, referral
- Calculated automatically in `createSolution`

### Revenue Splits
| Type | Split |
|------|-------|
| Software | 40% JICATE, 40% Department, 20% Institution |
| Training Track A | 60% Cohort, 20% Council, 20% Infrastructure |
| Training Track B | 30% Cohort, 20% Dept, 30% JICATE, 20% Institution |
| Content | 60% Learners, 20% Council, 20% Infrastructure |

### HOD Discount
- Max 10% from department's share
- Applied in solutions and earnings calculations

### Referral Bonus
- 10% from department's share on first phase
- Auto-calculated when payment received

### Content Revision Threshold
- >3 revisions flags deliverable to MD

## Table Mapping

| Table Prefix | Service |
|--------------|---------|
| sh_solutions | solutions-service |
| sh_solution_phases | phases-service |
| sh_clients | clients-service |
| sh_client_referrals | clients-service |
| sh_builders | builders-service |
| sh_builder_skills | builders-service |
| sh_builder_assignments | builders-service |
| sh_prototype_iterations | phases-service |
| sh_bug_reports | phases-service |
| sh_phase_deployments | phases-service |
| sh_implementation_users | phases-service |
| sh_training_programs | training-service |
| sh_training_sessions | training-service |
| sh_cohort_members | cohort-service |
| sh_cohort_assignments | cohort-service, training-service |
| sh_content_orders | content-service |
| sh_content_deliverables | content-service |
| sh_production_learners | production-service |
| sh_production_assignments | production-service |
| sh_discovery_visits | discovery-service |
| sh_client_communications | discovery-service |
| sh_payments | payments-service |
| sh_revenue_split_models | payments-service |
| sh_earnings_ledger | earnings-service |
| sh_publications | publications-service |
| sh_publication_contributors | publications-service |
| sh_accreditation_metrics | publications-service |
| sh_notifications | notifications-service |

## Usage Example

```typescript
import {
  solutionsService,
  clientsService,
  paymentsService,
  formatCurrency,
} from '@/lib/services/solutions';

// Get all active solutions
const { data: solutions, metadata } = await solutionsService.getSolutions({
  status: 'active',
  page: 1,
  limit: 10,
});

// Create a new client
const client = await clientsService.createClient({
  name: 'Acme Corp',
  partner_status: 'yi',
});

// Get payment stats
const stats = await paymentsService.getPaymentStats();
console.log(`Total received: ${formatCurrency(stats.total_received)}`);
```

## Notes

1. All services follow MyJKKN BaseService pattern
2. Pagination is validated and bounded (max 100 per page)
3. Search strings are escaped to prevent SQL injection
4. All methods use static class pattern with singleton exports
5. Comprehensive error handling with descriptive messages
6. Notification triggers included for key events
