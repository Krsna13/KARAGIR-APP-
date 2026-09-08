# Kaaragir iQOO Judge Q&A

**1. Why does Kaaragir need AI?**
Because local artisans have the skills to build incredible custom furniture, but customers struggle to accurately describe dimensions, materials, and features using traditional dropdowns. AI acts as the bridge, turning natural descriptions into structured, actionable blueprints.

**2. Why multimodal AI?**
Design is visual and verbal. A customer might have a photo of a table they like, but want to verbally change its size or material. Only a multimodal model can synthesize an image and a voice command into a single, cohesive specification.

**3. Why voice?**
Typing out complex furniture specifications (length, width, seating, style, finish, material) on a mobile keyboard is tedious and error-prone. Voice allows customers to express their complete intent in a single, natural breath.

**4. Why image input?**
It is incredibly difficult to describe stylistic elements like "carved legs" or "brass inlay" textually. A reference image instantly conveys the stylistic intent to the AI without requiring the customer to know the industry jargon.

**5. Why on-device AI?**
Privacy, speed, and cost. Running inference directly on the customer's phone means their voice and photos never leave the device. It eliminates cloud latency, reduces server costs for Kaaragir, and leverages the powerful NPU hardware already sitting in the user's pocket.

**6. Which model is used?**
We use Qwen3-VL-4B-Instruct for multimodal vision-language understanding, and Whisper Base for local speech-to-text.

**7. Why this model?**
Qwen3-VL-4B strikes the optimal balance between high-accuracy spatial/visual understanding and the strict memory constraints of mobile devices. Whisper Base provides highly accurate, multi-lingual transcription fast enough for interactive use.

**8. How does the Android bridge work?**
We built a Capacitor plugin (`KaaragirAINative`) that intercepts Javascript calls from our React frontend and routes them to the native Android layer. The Android layer then executes the models via the Qualcomm GenieX SDK, returning the structured JSON back to the UI.

**9. Which hardware backend was actually verified?**
The React UI, state management, wireless Office Kit transfer, 3D injection, and Escrow integrations are fully verified in browser simulation. The native Qualcomm execution layer is currently stubbed pending deployment onto physical Snapdragon hardware.

**10. Is the application fully offline?**
No. The AI Copilot inference operates completely offline, but fetching 3D assets, reading the Material Registry database, and synchronizing Escrow milestones still require internet connectivity.

**11. What does Office Kit do?**
It enables seamless cross-device continuity. A customer can capture their idea using their phone's microphone and camera while standing in their living room, then instantly push that specification to their laptop to review the 3D model and pricing on a larger screen.

**12. How does material traceability work?**
When a custom project is generated, the system maps the customer's material requirement (e.g., "Teak") to a globally unique `KAR-MAT-XXXXX` identifier. This ID links directly to the artisan's registered supplier invoice, batch number, and physical verification photos.

**13. What does the Material ID mean?**
The `KAR-MAT` ID is our platform's internal reference pointing to an evidence record. It is not a scientific authenticity certificate; it is a verifiable trail of supply-chain documents.

**14. What does the supplier batch ID mean?**
It is the external identifier provided by the timber merchant or supplier when the artisan purchased the raw material. It proves the origin of the wood.

**15. How do you prevent quantity over-allocation?**
The database maintains a strict ledger. `Remaining Quantity = Purchased Quantity - Allocated Quantity`. The system automatically rejects any new project request if the required material exceeds the `Remaining Quantity`.

**16. How is material authenticity handled?**
Through evidence, not AI magic. Artisans upload supplier invoices and batch photos to the Material Registry. The customer is given the Material ID and must manually review this evidence before approving the payment milestone.

**17. Does AI verify the material?**
Absolutely not. The AI only understands that the customer *wants* Teak. The Kaaragir platform handles the actual mapping, and the human buyer handles the verification based on uploaded invoice evidence.

**18. How is pricing calculated?**
Pricing uses a deterministic, volumetric formula based on the custom dimensions (Length × Width × Height), the selected material grade multiplier, and local labor rates. The AI is strictly firewalled from hallucinating prices.

**19. Does AI control payments?**
No. Payments are locked inside a smart Escrow contract tied to project milestones.

**20. How does escrow work?**
Customer funds are held securely in a central vault. The artisan submits photographic proof of a milestone (e.g., "Raw Material Sourcing"). Only when the customer reviews the proof and clicks "Approve" are the funds released to the artisan's wallet.

**21. What is the business model?**
Kaaragir takes a transparent platform commission (e.g., 5%) on successfully completed custom orders, processed securely through the Escrow system.

**22. Who are the customers?**
Homeowners, interior designers, and architects who want unique, high-quality, custom-fit furniture but lack a trustworthy bridge to local, skilled artisans.

**23. Why is this different from IKEA?**
IKEA provides mass-produced, standardized particleboard furniture. Kaaragir provides hyper-customized, heirloom-quality, solid-wood furniture built by local craftsmen, made accessible through AI and secured by supply-chain traceability.

**24. How does Kaaragir help local artisans?**
It acts as their digital storefront, customer service agent, and financial protector. The AI Copilot translates vague customer ideas into exact 3D blueprints the artisan can build from, while the Escrow system guarantees they get paid for verified work.

**25. What is the future roadmap?**
Deploying the final binary to Snapdragon hardware, expanding the 3D procedural generation engine to handle more complex geometries natively, and introducing on-device AR so customers can project their AI-generated furniture directly into their living room before ordering.
