# Stage 8 — AI + Material Passport + Milestone Commerce

## Architecture
This stage establishes the architectural separation between intent (AI) and truth (Commerce).
```text
Customer Intent (AI)
    ↓
CraftSpecification
    ↓
Product Configuration
    ↓
Material Requirement (e.g. "Sagwan Teak")
    ↓
(System maps requirement to evidence)
    ↓
KAR-MAT-XXXXX (Registered Material Record)
    ↓
Milestone Tracker (Displays ID)
    ↓
EscrowProvider (Releases Funds)
```

## Data Relationships
The `CraftSpecification` produced by the AI does not hold `KAR-MAT` tracking codes or invoice IDs. It holds the high-level intent (`material: "Sagwan Teak"`). The Kaaragir platform associates this intent with the closest registered `MaterialRecord` held by the chosen artisan.

## Material Traceability
The globally unique `KAR-MAT-XXXXX` identifier links the project to the Material Passport. The Passport contains supplier batch IDs, invoices, and physical verification data. 

## AI Responsibility
- Multimodal Voice/Text/Image ingestion.
- Structuring customer intent into a standardized `CraftSpecification`.
- Initializing the dimensions, style, features, and material choice in the 3D Customizer.

## Material Verification Responsibility
- AI **cannot** verify authenticity. It cannot look at a picture of a table and generate an "Authenticity Certificate." 
- Verification remains the exclusive domain of the Material Passport system, utilizing manually uploaded invoices and human physical inspection.

## Payment Responsibility
- AI **cannot** release funds, edit payment schedules, or calculate escrow.
- Payment triggers are managed strictly by the `EscrowProvider` logic when the customer physically clicks `Approve Milestone`.

## Quantity Allocation
Material quantities are deducted centrally when a project links to a `KAR-MAT` ID. Over-allocation is prevented at the database ledger level, regardless of AI output.

## Verify Material & Milestone Flow
Inside the `MilestoneTracker`, the "Raw Material Sourcing" stage now includes an injected `Material Verification ID` badge with a `Verify Material` link. The UI is kept compact, driving users to the dedicated Passport portal to inspect invoices and batch records securely.

## Demo Flow
1. **Phone AI:** Customer asks for a Teak dining table via voice.
2. **Laptop Customizer:** Specification transfers via Office Kit. Pricing and dimensions lock in.
3. **Commerce:** Customer confirms the project. The system allocates `KAR-MAT-2026-97373` for the required Teak.
4. **Milestone Tracker:** Customer opens the Tracker, sees the first milestone ("Raw Material Sourcing") featuring the `KAR-MAT` badge.
5. **Verification:** Customer clicks `Verify Material` to see real, human-uploaded supplier invoices before approving the Escrow release.

## Claims That Are NOT Made
- **AI does not authenticate materials.** If the AI outputs "Teak," this represents the customer's design preference, not a scientific species verification.
- **Material ID is an evidence identifier.** It points to invoices and supply chain records. It does not prove the molecular genuineness of the wood (unless testing records are attached).
- **Escrow remains immutable to AI.** No multimodal prompt injection can unlock funds.
