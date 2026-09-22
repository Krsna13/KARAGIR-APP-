# Kaaragir — Final Mobile App Release

## Product
Kaaragir: The AI-Powered Hyperlocal Artisan Commerce Mobile Platform

## Core Problem
Local artisans build incredible bespoke furniture and handcrafted goods, but struggle to digitize. Customers struggle to convey custom requirements. Trust is low due to material fraud. Existing 3D configuration tools are clunky on mobile devices.

## Solution
An entirely mobile-first, multimodal AI assistant ("Craft Copilot") that listens to natural voice, views sketches, structures them into exact specifications, and pipes them directly into a 3D Customizer. Verified materials are tracked natively via Escrow Milestones.

## Multimodal AI
- Voice transcription (Hindi/English)
- Reference Image vision parsing
- Natural text extraction

## On-Device & Mobile Architecture
Execution operates locally to maximize privacy, reduce server load, and provide real-time responsiveness. No raw audio streams to third-party clouds.

## Target Platform
**Target:** Android 14+ / Mobile-First PWA & Capacitor Native Shell  
**Environment:** Vite / React 19 / TypeScript / Tailwind CSS

## Models
- **Vision+Language:** Multimodal Vision AI
- **Speech:** Whisper Speech-to-Text

## Mobile Workflow
User launches app > Taps microphone > Speaks requirement > Attaches image > AI outputs editable `CraftSpecification` JSON.

## 3D Customizer Workflow
Interactive 3D viewer injects the AI parameters without reloading, mapping "Sagwan Teak" or specified woods/metals to the exact texture array instantly.

## Volumetric Pricing Engine
Mathematical pricing recalculates automatically based on injected volumetric dimensions and verified market material rates. **AI does not touch or hallucinate the price.**

## Material Passport & Escrow Milestones
`KAR-MAT` identifier is injected into the Milestone tracker. Customers verify raw supplier invoices and stage photo proofs before releasing milestone funds from the escrow vault.

## Privacy
- Raw voice stays secure on device.
- Local inference prevents image scraping.
- Pricing logic stays securely on the trusted Kaaragir backend.

## Demo Flow
Voice Request + Sketch ➔ AI JSON ➔ 3D Viewer ➔ Customer Project Launch ➔ Material Allocation ➔ Escrow Milestone Payment Verification.
