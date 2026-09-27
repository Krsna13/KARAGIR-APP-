# Stage 6 — Kaaragir Craft Copilot Integration

## Architecture

```text
Voice
 ↓
Whisper
 ↓
Text
 ↓
Qwen3-VL
 ↑
Image/Text
 ↓
CraftSpecification
 ↓
Validation
 ↓
Customer Confirmation
 ↓
Existing 3D Editor
 ↓
Pricing
 ↓
Artisan Brief
 ↓
Custom Request
```

The Kaaragir integration uses `CraftCopilot.tsx` to handle the Text, Image, and Voice modalities. This bundles the requirements into a `MultimodalCraftRequest`. The providers (`Mock` or `Native`) interpret this payload and return a strictly typed `CraftSpecification`. The customer views a confirmation panel before hitting "Apply to 3D", which drives the pre-existing 3D viewer, Pricing Service, and Artisan Brief logic flawlessly without rewriting those core components.

## Implemented Components
- **Modified:** `src/components/copilot/VoiceInput.tsx` (Supports on-device whisper integration and provides an editable text area before submission)
- **Modified:** `src/components/copilot/CraftCopilot.tsx` (Handles the final multimodal payload and displays the "Understood Requirement" editable UI)
- **Modified:** `src/services/craftAIProvider.ts` (Introduced `LocalQwenCraftAIProvider` connected to Capacitor)
- **New:** `src/services/voiceAIProvider.ts` (Introduced abstract `VoiceAIProvider` with `Mock` and `LocalWhisper` implementations)

## AI Providers

**Voice:**
- `MockVoiceAIProvider` (Used on desktop/browsers)
- `LocalWhisperVoiceAIProvider` (Used on Android via `KaaragirAINative.transcribeAudio`)

**Multimodal:**
- `MockCraftAIProvider` (Used on desktop/browsers)
- `LocalQwenCraftAIProvider` (Used on Android via `KaaragirAINative.analyzeImageAndText`)

## Android Bridge
The `KaaragirAINative` plugin exposes:
- `transcribeAudio(audioUri)`: Returns a transcription string.
- `analyzeImageAndText({ text, imageUri })`: Returns a validated `CraftSpecification` JSON.
- `getDeviceCapabilities()`: Returns NPU, Device, Android, and Architecture stats.

## Validation
`CraftSpecificationValidator` intercepts the AI response. It guarantees dimensions strictly conform to manufacturing bounds (e.g., Dining Tables length 3-20 ft) and flags unsupported materials. If invalid, the UI rejects it and highlights the errors before 3D applying.

## Error Handling
If an AI provider fails or the network drops (for mock providers), a graceful error message is rendered in the UI. **The customer can continue to use the manual UI customization sliders completely unhindered.** The app will never block on AI failures.

## Testing
- **Text → Specification:** `MockCraftAIProvider` correctly interprets numbers and string keywords.
- **Voice → Specification:** `VoiceInput` transcribes voice (mocked) and passes the generated text string accurately to the `CraftAIProvider`.
- **Incomplete Specification:** Height/width default to `null` correctly if not mentioned, rendering as "Not specified" in the UI.
- **Manual Edits After AI:** Successfully clicking the 'Edit' button overrides AI JSON before hitting "Apply to 3D."

## Performance
*Real numbers pending physical hardware execution (Stage 4 and Stage 5 validation).*

## Known Limitations
- Without physical execution, the mock providers use `setTimeout` to mimic inference. 
- Partial native file URIs are being simulated as strings. The Android plugin must correctly decode `content://` identifiers in a production setting.

## Demo Readiness

**CONDITIONALLY READY** 
(The architecture is complete, robust, and correctly delegates to Native Plugins. It is fully ready for demonstration, pending only the compilation and insertion of real Qualcomm GeniX model binaries on the target device.)

---

## Stage 6.4 — Artisan "Add Item" Wizard: Identify Step
Extends the Craft Copilot concept from the buyer side to the artisan side: instead of a customer describing a custom order, an artisan photographs an item they've made and the AI helps turn it into a catalog listing.

- **New Flow:** `src/components/portal/addItem/steps/IdentifyStep.tsx` + `identifyLogic.ts` (part of `AddItemWizard.tsx`, `useAddItemWizard.ts`).
- **Behavior:** Artisan uploads/captures product photos. The `identify-product` Supabase edge function (Gemini vision) proposes category, material, shape, finish, and complexity. The artisan confirms or corrects each field via voice input or text, with text-to-speech read-back for accessibility.
- **Backend:** New storage buckets and RLS policies for product photos and voice notes; `20260926090000_product_identification_photos.sql` migration.
- **Supporting services:** `imageEnhancementService.ts` (photo cleanup before AI submission), `ProductPhotoCapture.tsx`, `EnhancedPhotoReview.tsx`, `VoiceNoteRecorder.tsx`.

## Stage 6.5 — Add Item Wizard: Describe Step
- **Component:** `src/components/portal/addItem/steps/DescribeStep.tsx` + `describeLogic.ts`.
- **Behavior:** Guides the artisan through structured product details — dimensions, technique, availability, quantity, lead time, labor days, customization options, care instructions, and a free-text "story" field — via voice-driven Q&A, with AI-suggested facts (`aiFactsFrom`) pre-filling likely answers based on the Identify step's output.
- **Backend:** `20260927090000_describe_step_columns.sql` migration adds the new product columns; `database.types.ts` regenerated.

## Stage 6.6 — Multilingual Listing Preview, Edge Functions & Dev Tooling
- **Component:** `src/components/portal/addItem/steps/PreviewStep.tsx` + `ListingPreviewCard.tsx` + `listingLogic.ts`.
- **Behavior:** Generates a bilingual (English/Hindi) buyer-facing listing from the Identify + Describe data, with a swipeable photo gallery, read-aloud audio per section, and per-section voice-driven revision. Artisan taps "Looks good" to finalize and publish.
- **New Edge Function:** `supabase/functions/generate-listing/` (`index.ts` + `validation.ts`) — calls the LLM to draft/revise the EN + HI listing copy, enforces strict no-fabrication validation against a shared list of disallowed marketing claims (`supabase/functions/_shared/riskyClaimsConfig.ts`), and retries once on validation failure. If AI generation fails entirely, a deterministic fallback listing (assembled directly from structured fields, no AI) is shown instead so the flow never dead-ends.
- **New Service:** `src/services/listingService.ts` orchestrates calls to the edge function from the client.
- **Backend:** `20260928090000_listing_preview_columns.sql`, `20260929090000_add_summary_spoken.sql` migrations.
- **Dev Tooling:**
  - `src/components/dev/DevDeviceCheckPage.tsx` — a diagnostic screen, gated behind `VITE_ENABLE_DEV_TOOLS`, that checks microphone/camera/storage/network access and on-device AI (NPU/device info via `KaaragirAINative`) health, linking into the on-device AI debug screen.
  - `src/config/devTools.ts` — reads the `VITE_ENABLE_DEV_TOOLS` flag.
  - `scripts/build-android.js` + `npm run build:android` — cross-platform build script that runs `vite build` then `npx cap sync android`, respecting the dev-tools flag.
- **Stage 6.6 Follow-up Hardening:**
  - **Database Migration & Schema Sync:** `products.summary_spoken TEXT` pushed to remote database via `20260929090000_add_summary_spoken.sql`, types regenerated from linked project.
  - **Type Safety & Patch Validator:** Strongly typed `ProductDraftPatch` preventing unknown columns at compile-time across wizard steps; `assertValidProductPatch` test helper enforcing that all draft patches contain only schema columns.
  - **Artisan-Facing Friendly Errors:** Technical failure reasons restricted to console logs; UI maps all generation/revision errors to bilingual messages ("We couldn't write the listing. Try again or use a simple listing / विवरण नहीं बन सका...").
  - **Allowed Numbers Whitelist:** Extended to accept numbers found in artisan text (`story_original`, `story_en`, `extra_notes`, `care_instructions`) and `visible_features` (e.g., "20 years", "3 drawers").
  - **Continuous Language Disambiguation:** Excised `सतत` from risky claims regex so normal sentences using continuous context are not falsely flagged as unverified claims.
  - **Stale Unapproved Auto-Regeneration:** Entering PreviewStep with an unapproved listing and altered facts triggers automatic regeneration without prompting.
  - **Approval Reset:** Revision and extra-notes regeneration automatically set `listing_approved = false` to require artisan confirmation of updated copy.
  - **Touch Target Accessibility:** All gallery navigation chevrons and section edit pencils enforced to >= 48px touch targets (`min-w-[48px] min-h-[48px]`).
- **Test Coverage:** Full test suite passing with unit tests across `PreviewStep`, `ListingPreviewCard`, `generateListingRetry`, `listingValidation`, and `patchValidator`.

