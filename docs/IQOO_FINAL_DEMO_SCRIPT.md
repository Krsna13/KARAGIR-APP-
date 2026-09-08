# Kaaragir iQOO Demo

## 1. Opening
"Local artisans have the skill, but customers struggle to discover, communicate, and customize what they want securely. Kaaragir fixes this by putting a multimodal AI copilot directly on your phone."

## 2. Customer Input
Customer opens the Kaaragir app on the iQOO Snapdragon device and speaks natively into the Craft Copilot:

> *"Mujhe six feet ka dining table chahiye, sagwan teak wood ka, six logon ke liye, carved legs aur brass inlay ke saath."*

Customer taps to attach a reference sketch from their gallery.

## 3. Multimodal AI
- The Whisper model instantly transcribes the Hindi/English voice request entirely on-device.
- Qwen3-VL-4B-Instruct processes the transcription and the reference image locally.

## 4. Structured Understanding
The raw multimodal input is structured instantly into a clear `CraftSpecification`:
- **Product:** Dining Table
- **Length:** 6 ft
- **Material:** Sagwan Teak
- **Seating:** 6 people
- **Features:** Carved Legs, Brass Inlay

## 5. Customer Control
Customer can tap any inferred field to manually refine it (e.g. changing Length from 6 to 7) ensuring AI doesn't forcefully overwrite customer intent.

## 6. Handoff to Desktop
Customer taps `[ Send to Laptop ]`. The specification leverages Office Kit capabilities to seamlessly slide into the Desktop 3D Customizer window.

## 7. Commerce Integration
The Desktop Customizer calculates the live pricing utilizing existing, trusted Kaaragir financial logic (not hallucinated AI pricing). The customer confirms the project.

## 8. Material Verification
The system identifies the requirement for "Sagwan Teak" and links it to a registered artisan batch. The Milestone Tracker displays:
> **Material Verification ID: KAR-MAT-2026-97373**

The customer clicks `[ Verify Material ]` to view raw, un-faked supplier invoices.

## 9. Transaction
The customer approves the "Raw Material Sourcing" milestone, unlocking funds via the traditional Escrow contract.

## 10. Closing
"Kaaragir turns local craftsmanship into a discoverable, customizable and more trustworthy digital commerce experience—starting with a single spoken sentence on your phone."
