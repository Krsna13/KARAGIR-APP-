# Kaaragir — Final iQOO Release

## Product
Kaaragir: The AI-Powered Artisan Commerce Platform

## Core Problem
Local artisans build incredible furniture, but struggle to digitize. Customers struggle to convey custom requirements. Trust is low due to material fraud. Existing 3D config tools are clunky on mobile devices.

## Solution
An entirely on-device, multimodal AI assistant ("Craft Copilot") that listens to natural voice, views sketches, structures them into exact specifications, and pipes them directly into a 3D Customizer. Verified materials are tracked natively via Escrow Milestones.

## Multimodal AI
- Voice transcription (Hindi/English)
- Reference Image vision parsing
- Natural text extraction

## On-device AI
Execution operates locally to maximize privacy, reduce server load, and demonstrate Snapdragon hardware acceleration capabilities. No audio streams to cloud. 

## Device
**Target:** iQOO (Snapdragon 8 Elite) / Android 14+
**Demonstrated Environment:** Local Vite/React Browser Mock + Capacitor Native Shell Stub

## Models
- **Vision+Language:** Qwen3-VL-4B-Instruct
- **Speech:** Whisper Base

## Runtime
Qualcomm GenieX SDK (Hedgehog Android Build)

## Verified Hardware Backend
> **DEVELOPMENT SIMULATION**
> Pending physical iQOO device validation, models are currently bypassed via local simulation bridges.

## Phone Workflow
User launches app > Taps microphone > Speaks requirement > Attaches image > AI outputs editable `CraftSpecification` JSON.

## Office Kit Workflow
Customer clicks `[ Send to Laptop ]`. Phone leverages Office Kit bridging to instantly pass the configuration to the desktop 3D Viewer.

## 3D Workflow
Legacy WebGL viewer injects the AI parameters without reloading, mapping "Sagwan Teak" to the exact texture array instantly.

## Pricing
Legacy logic recalculates automatically based on injected volumetric dimensions. **AI does not touch the price.**

## Material Passport & Milestones
`KAR-MAT` identifier is injected into the Milestone tracker. Customers verify raw supplier invoices manually before releasing payments. **AI cannot fake materials or release payments.**

## Privacy
- Raw audio stays on device.
- Local inference prevents image scraping.
- Pricing logic stays securely on the trusted Kaaragir backend.

## Limitations & Known Risks
- Native Qualcomm AI bridging methods are stubbed pending physical phone deployment.
- Offline support is constrained: the AI inference works offline, but the 3D Customizer and Milestone Tracker still require a network connection to fetch assets and synchronize states.

## Demo Flow
Voice Request + Sketch ➔ AI JSON ➔ Office Kit Handoff ➔ 3D Viewer ➔ Customer Project Launch ➔ Teak Material Allocation ➔ Milestone Payment Verification.

## Fallback Flow
If AI fails, customer clicks `[ Start Over ]` and falls back to manual dropdown menus on the desktop. If Office Kit fails, customer taps `[ Apply Here ]` to render 3D directly on the mobile device.

## Final Build Status
**CONDITIONALLY READY FOR JUDGING** (Subject to physical hardware tests).
