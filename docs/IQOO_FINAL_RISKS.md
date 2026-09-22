# Kaaragir Platform Risks & Mitigations

| Risk Area | Potential Failure Mode | Built-in Mitigation |
| :--- | :--- | :--- |
| **Material Fraud** | Unverified timber or synthetic substitutes | `KAR-MAT` Material ID requires invoice proof & manual approval |
| **AI Price Hallucination** | Generative model suggests unfeasible quotes | AI strictly firewalled; deterministic volumetric formulas calculate prices |
| **Payment Default** | Non-payment after custom manufacturing | Milestone-locked Escrow vault holds 100% budget upfront |
| **Connectivity** | Intermittent mobile data in workshops | Offline-first state persistence and local photo caching |
