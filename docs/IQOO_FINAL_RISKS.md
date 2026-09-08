# Kaaragir Final Risk Register

| Risk | Classification | Description | Fallback Strategy |
| :--- | :--- | :--- | :--- |
| **Model Loading Latency** | HIGH | Qwen3-VL-4B-Instruct may take several seconds to load into Android RAM upon cold boot, creating a frozen UX. | Ensure Lazy Initialization is implemented. Keep a loading spinner visible ("Preparing AI...") to prevent user abandonment. |
| **Device Compatibility / Thermal** | HIGH | Running continuous multimodal inference may throttle the device due to heat constraints during a live presentation. | Keep demo sessions concise. Provide the browser-based simulation fallback if the physical hardware forcibly shuts down the process. |
| **Office Kit Availability** | BLOCKER | Native API bridging may fail to resolve over standard LAN if port constraints block discovery during the hackathon. | Default to the `MockOfficeKitProvider` which uses deterministic `localStorage` syncing across dual-window browsers to perfectly simulate the identical flow safely. |
| **Voice Accuracy in Noisy Environments** | MEDIUM | Hackathon floors are loud, potentially confusing Whisper Base. | Provide an explicit text-input textarea in Craft Copilot. If transcription fails, the user simply types. |
| **3D Render Performance** | MEDIUM | Rendering 3D procedural models on low-tier mobile browsers can drop frames. | Push 3D generation strictly to the Desktop Customizer via Office Kit, keeping the mobile interface focused purely on high-performance input and AI inference. |
| **Demo Internet Requirement** | LOW | While AI inference is fully offline, fetching WebGL assets or pulling Mock Data currently requires internet. | Ensure a robust WiFi connection is available for the demo, or cache all required 3D textures in the public bundle beforehand. |
