# Kaaragir Platform Architecture & Evaluation Q&A

**1. Why does Kaaragir need AI?**
Because local artisans have the skills to build incredible custom furniture, but customers struggle to accurately describe dimensions, materials, and features using traditional dropdowns. AI acts as the bridge, turning natural descriptions into structured, actionable blueprints.

**2. Why multimodal AI?**
Design is visual and verbal. A customer might have a photo of a table they like, but want to verbally change its size or material. Only a multimodal model can synthesize an image and a voice command into a single, cohesive specification.

**3. Why voice?**
Typing out complex furniture specifications (length, width, seating, style, finish, material) on a mobile keyboard is tedious and error-prone. Voice allows customers to express their complete intent in a single, natural breath.

**4. Why image input?**
It is difficult to describe stylistic elements like "carved legs" or "brass inlay" textually. A reference image instantly conveys stylistic intent without requiring the customer to know industry jargon.

**5. Why mobile-first & on-device AI?**
Privacy, speed, and cost. Running speech and vision inference directly on the customer's phone means their voice and photos never leave the device. It eliminates cloud latency, reduces server costs, and leverages modern mobile hardware.

**6. Which models are utilized?**
Vision-Language understanding for multimodal sketch and feature extraction, and Whisper for local speech-to-text.

**7. How does the Android bridge work?**
A Capacitor native plugin intercepts calls from the React frontend and routes them to the native Android execution layer, returning structured JSON back to the UI.

**8. Is the application fully offline?**
No. The AI Copilot inference operates completely offline, but fetching 3D assets, reading the Material Registry database, and synchronizing Escrow milestones require internet connectivity.

**9. How does material traceability work?**
When a custom project is generated, the system maps the customer's material requirement (e.g., "Teak") to a globally unique `KAR-MAT-XXXXX` identifier. This ID links directly to the artisan's registered supplier invoice, batch number, and physical verification photos.

**10. What does the Material ID mean?**
The `KAR-MAT` ID is our platform's internal reference pointing to an evidence record. It is a verifiable trail of supply-chain documents and photographic proof.

**11. How is pricing calculated?**
Pricing uses a deterministic, volumetric formula based on custom dimensions (Length × Width × Height), selected material grade multiplier, and local labor rates. The AI is strictly firewalled from hallucinating prices.

**12. Does AI control payments?**
No. Payments are locked inside a digital Escrow vault tied to project milestones.

**13. How does escrow work?**
Customer funds are held securely in a central vault. The artisan submits photographic proof of a milestone (e.g., "Raw Material Sourcing"). Only when the customer reviews the proof and clicks "Approve" are the funds released to the artisan's wallet.

**14. What is the business model?**
Kaaragir takes a transparent platform commission (e.g., 5%) on successfully completed custom orders, processed securely through the Escrow system.

**15. Who are the customers?**
Homeowners, interior designers, and architects who want unique, high-quality, custom-fit furniture but lack a trustworthy bridge to skilled local artisans.
