# Stage 7 — Kaaragir Office Kit Workflow

## Objective
To establish a robust, seamless handoff from the "Phone-First" mobile experience (running local AI capture) to the expansive Desktop 3D Customizer, allowing artisans and customers to continue detailed work where it makes the most sense.

## Actual Office Kit Capabilities Verified
> **STATUS: PENDING PHYSICAL HARDWARE VALIDATION**
> The Antigravity development environment does not currently have physical access to the target iQOO Snapdragon device to securely verify true wireless Office Kit handoff. Therefore, a `MockOfficeKitProvider` using cross-tab `localStorage` event-sync has been deployed to immediately demonstrate the architecture and user flow on any browser.

## Architecture

```text
Phone (iQOO Mobile)
 ↓
Craft Copilot (Voice + Text + Image inputs)
 ↓
Local AI Inference (Whisper + Qwen3-VL)
 ↓
CraftSpecification JSON
 ↓
Office Kit Bridge
 ↓
Laptop (Desktop Web)
 ↓
CustomerCampaignLauncher receives HandOff
 ↓
3D Editor applies payload parameters
 ↓
Pricing Engine recalculates
 ↓
Artisan Brief Generated
```

## Data Contract
The `CraftHandoffPackage` strict-types the payload transferred across devices:
```json
{
  "version": "1.0",
  "handoffId": "KAR-HO-2026-84391",
  "createdAt": "2026-09-09T00:25:00.000Z",
  "source": "mobile_copilot",
  "customerId": "customer-123",
  "craftSpecification": { ... },
  "referenceImage": {
    "available": true,
    "localUri": "blob:..."
  },
  "voiceTranscript": "...",
  "artisanBrief": null,
  "estimatedPrice": null
}
```

## Provider Architecture
`src/services/officeKitProvider.ts` abstracts the entire hardware layer. React components never call iQOO APIs directly. They use `getOfficeKitProvider()`, which returns either the `LocalOfficeKitProvider` (for native Android runtime) or the `MockOfficeKitProvider` (for browser/desktop dev).

## Transfer Method
- **Actual:** Simulated via `localStorage` (triggering `StorageEvent` across tabs).
- **Target:** Qualcomm / iQOO Office Kit APIs via standard Android deep links, Bluetooth low-energy, or LAN WebSocket discovery (to be verified).

## Fallback
If Office Kit is unavailable, the "Send to Laptop" button explicitly notifies the user: `"Office Kit unavailable on this device."` The user can continue directly on their device via the parallel `[Apply Here]` button.

## Privacy
- Raw microphone audio files are **not** sent to the laptop. Only the finalized text transcript is packaged.
- Estimated Pricing is set to `null` to enforce the security boundary that the laptop’s canonical pricing service must be the sole authority calculating final costs.

## Testing
- **Cross-Tab Transfer:** Clicking `Send to Laptop` in Tab 1 immediately spawns the "📱 New Craft Copilot Request" card in Tab 2.
- **Specification Injection:** Clicking `Open in Customizer` in Tab 2 routes the AI specification through the `CraftSpecificationMapper` flawlessly, avoiding duplicates.

## Known Limitations
- The `LocalOfficeKitProvider` native bridge methods are stubbed out until hardware availability is verified.
- Currently, passing `blob:` URIs across real hardware boundaries requires resolving to base64 or temporary S3 uploads if the local LAN transfer protocol doesn't support raw binary streams.

## Demo Status

**CONDITIONALLY READY** 
*(Ready for cross-tab simulation demo. Awaiting actual device execution to certify the Native Office Kit integration).*
