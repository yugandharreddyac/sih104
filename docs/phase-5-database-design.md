# VOXSHIELD Phase 5 Relational Database Schema & Entities

## 1. Entity-Relationship Design (PostgreSQL)

```
┌─────────────────────────┐         ┌─────────────────────────┐
│      call_sessions      │1       *│    risk_assessments     │
├─────────────────────────┤─────────├─────────────────────────┤
│ id (PK)                 │         │ id (PK)                 │
│ caller_identifier       │         │ call_id (FK)            │
│ organization_id         │         │ overall_risk_score      │
│ status                  │         │ risk_level              │
│ created_at              │         │ dimensions (JSONB)      │
└─────────────────────────┘         │ risk_velocity           │
                                    │ evidence_graph (JSONB)  │
                                    │ created_at              │
                                    └────────────┬────────────┘
                                                 │ 1
                                                 │
                                                 │ *
┌─────────────────────────┐         ┌────────────┴────────────┐
│    security_policies    │1       *│   policy_evaluations    │
├─────────────────────────┤─────────├─────────────────────────┤
│ id (PK)                 │         │ id (PK)                 │
│ policy_code (UNIQUE)    │         │ risk_assessment_id (FK) │
│ priority                │         │ policy_id (FK)          │
│ conditions (JSONB)      │         │ is_triggered            │
│ action                  │         │ explanation             │
│ is_active               │         │ created_at              │
└─────────────────────────┘         └────────────┬────────────┘
                                                 │ 1
                                                 │
                                                 │ 1
                                    ┌────────────┴────────────┐
                                    │      interventions      │
                                    ├─────────────────────────┤
                                    │ id (PK)                 │
                                    │ policy_evaluation_id(FK)│
                                    │ call_id (FK)            │
                                    │ action_type             │
                                    │ status                  │
                                    │ requested_by            │
                                    │ approved_by (FK User)   │
                                    │ human_decision          │
                                    │ executed_at             │
                                    └─────────────────────────┘
```

---

## 2. Table Specifications

1. `risk_assessments`: Stores immutable multi-dimensional risk records, primary drivers, and evidence DAGs.
2. `security_policies`: Versioned declarative rule catalog with deterministic precedence order.
3. `policy_evaluations`: Auditable records of every policy evaluation and trigger event.
4. `interventions`: Tracks human approval workflows, step-up dispatches, and action outcomes.
