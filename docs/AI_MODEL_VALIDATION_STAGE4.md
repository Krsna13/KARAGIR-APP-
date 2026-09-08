# Stage 4 — Qwen3-VL On-Device Validation

> **STATUS: PENDING PHYSICAL HARDWARE VALIDATION**
> The Antigravity development environment does not currently have physical access to the target iQOO Snapdragon device via ADB. This document outlines the exact validation protocol that must be executed on the physical hardware before proceeding to Stage 6. Do NOT fake success.

## Device
- Phone: [PENDING - Requires physical iQOO device]
- Android: [PENDING]
- SoC: [PENDING]
- Snapdragon platform: [PENDING]
- RAM: [PENDING]

## Runtime
- Runtime/tool: Qualcomm GenieX Reference App / QAIRT
- Version: [PENDING]
- Validation application: [PENDING]
- Model: Qwen3-VL-4B-Instruct

## Compatibility
- Model loaded: [PENDING]
- Image input: [PENDING]
- Text input: [PENDING]
- Image + text: [PENDING]
- Structured JSON: [PENDING]

## Performance
- Model load: [PENDING]
- First inference: [PENDING]
- Average text latency: [PENDING]
- Average image+text latency: [PENDING]
- Memory: [PENDING]
- Thermal behavior: [PENDING]

## Hardware Acceleration
- Backend: [PENDING - Must verify NPU, GPU, or CPU usage via logs]
- NPU verified: [PENDING]
- GPU verified: [PENDING]
- CPU verified: [PENDING]

## Test Results

### Test A: Text Only
**Input:** "Mujhe 6 feet ka dining table chahiye, Sagwan teak wood ka, 6 chairs ke liye, carved legs aur brass inlay ke saath."
- **Expected:** Valid JSON matching `CraftSpecification`.
- **Result:** [PENDING]

### Test B: Constraints/Validation
**Input:** "I want a 20 ft dining table."
- **Expected:** Fails validation gracefully.
- **Result:** [PENDING]

### Test C: Partial/Unknown Fields
**Input:** "I want a teak dining table."
- **Expected:** Width/height/seats remain `null`. Model does not invent.
- **Result:** [PENDING]

### Test D: Image + Text Multimodal
**Input:** [Reference Image of a Table] + "Create a similar dining table for my home. Make it suitable for 6 people and use teak wood."
- **Expected:** Extracts style from image and merges with explicit text parameters.
- **Result:** [PENDING]

## Output Quality
[PENDING: Summarize how well the model understands Kaaragir-style product requests once tested on hardware.]

## Problems
[PENDING: List all technical issues encountered during hardware execution (e.g., thermal throttling, RAM limits).]

## Recommendation
[PENDING: Choose Qwen3-VL-4B-Instruct OR Qwen3-VL-2B and explain why based on actual device metrics.]

## Integration Decision

**NOT READY** (Awaiting physical hardware testing)
