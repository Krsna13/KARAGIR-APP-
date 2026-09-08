# Kaaragir Mobile UI Audit

## 1. Current Website Structure
- **App Shell**: Uses `App.tsx` containing a top `Navbar.tsx` and a main `<main>` container with max-width `1920px`.
- **Routing**: Handled via local state (`activeTab` and `mode`) in `App.tsx` instead of a router like `react-router-dom`.
- **Primary Flows**: 
  - Buyer (`BuyerDiscovery.tsx`, `FindLocalArtisansPage.tsx`, `CustomerCampaignLauncher.tsx`, `MilestoneTracker.tsx`)
  - Artisan (`ArtisanPortal.tsx`, `CreateStoreWizard.tsx`)

## 2. Current Navigation
- Desktop-first Top Navbar containing Logo, Location Picker, and horizontal tabs (`Find Artisans`, `My Projects`, etc.) alongside a `mode` switch (Buyer/Artisan).
- No Bottom Navigation currently exists.

## 3. Desktop-only Elements
- Large horizontal Top `Navbar.tsx` with inline search/location.
- Wide multi-column product grids in `BuyerDiscovery.tsx` and `FindLocalArtisansPage.tsx`.
- Side-by-side Layouts in `CustomerCampaignLauncher.tsx` (e.g. 3D viewer on left, controls on right).
- Hover-based interactions on product/artisan cards.
- Wide data tables or large grids for Artisan profiles.

## 4. Mobile-incompatible Elements
- Fixed-width containers that might cause horizontal scrolling.
- Side-by-side 3D Editor + Configuration Panel (requires collapsing into Bottom Sheets).
- Complex Desktop modals (`KaragirAuthModal.tsx`, `ProductDetailModal.tsx`) which are too large for phone screens without full-screen behavior.

## 5. Components that can be reused
- `CraftCopilot.tsx` (needs mobile structural wrapping, but core logic and AI mapping is identical).
- `ArtisanProduct3DEditor.tsx` (Viewport can be embedded fullscreen with floating controls).
- `MilestoneTracker.tsx` (Logic is sound; UI needs vertical stacking).
- Context providers (`MaterialContext`, `EscrowContext`, `KaragirStoreContext`).
- Theme definitions and Tailwind configuration (`index.css`).

## 6. Components that need responsive adaptation
- `FindLocalArtisansPage.tsx` (List + Map needs a mobile stacked/toggle view).
- `ArtisanStorefront.tsx` (Needs single column stack and sticky tabs).
- `ProductCard.tsx` / `KaragirProfileCard.tsx` (Need to ensure touch targets and full-width imagery).
- `Navbar.tsx` (Should become a minimal Top App Bar + Bottom Navigation).

## 7. Components that should become bottom sheets
- `ProductMaterialCustomizer.tsx` (The material/finish selection in 3D).
- 3D Configuration Panels (Dimensions, Styles, Finish).
- Location Picker from the Navbar.
- Filter/Sort menus in `FindLocalArtisansPage.tsx`.

## 8. Components that should become full-screen mobile pages
- `CustomerCampaignLauncher.tsx` / 3D Editor.
- `CraftCopilot.tsx` (Voice/Image composition screen).
- `MilestoneTracker.tsx` (Payment/Passport verification).
- `ProductDetailModal.tsx`.

## 9. Components that should remain desktop-oriented
- `ArtisanPortal.tsx` complex inventory/catalog management (though responsive, artisans may manage large catalogs on tablets/laptops).
- For this hackathon, we are focusing on the Buyer mobile experience on the iQOO phone.

## 10. Recommended Mobile Architecture
1. **Shell**: `MobileAppShell.tsx` with a top `MobileHeader` and a fixed `MobileBottomNav`.
2. **Navigation Map**: 
   - `HOME`: Discovery & Nearby
   - `EXPLORE`: Find Artisans / Marketplace
   - `CRAFT`: Craft Copilot & 3D Editor (Primary Action)
   - `PROJECTS`: Milestones & Material Passports
   - `PROFILE`: User Settings
3. **Core UX Shift**: Move 3D controls into bottom sheets to maximize the 3D viewport on small screens. Ensure `CraftCopilot` has a huge, highly tappable microphone icon.
