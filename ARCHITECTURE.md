# Kaaragir System Architecture & Component Graph

## Overview
Kaaragir operates as a mobile-native application leveraging React 19, TypeScript, and Tailwind CSS v4, with a clean separation of presentation, business services, state contexts, and native mobile bridges.

---

## 🗺️ Architectural Graph

```mermaid
graph TD
    subgraph UI_Layer [Mobile App UI Layer]
        Shell[MobileAppShell]
        Nav[MobileBottomNav (Pinned)]
        Home[MobileHome]
        Explore[FindLocalArtisansPage & Leaflet Map]
        Copilot[CraftCopilot & 3D Viewer]
        Orders[MilestoneTracker & Escrow]
        Portal[ArtisanPortal & Radar]
    end

    subgraph State_Layer [React State & Contexts]
        MatCtx[MaterialContext]
        StoreCtx[KaragirStoreContext]
        EscrowCtx[EscrowContext]
    end

    subgraph Service_Layer [Business Logic & Services]
        PriceSvc[pricingService (Deterministic Math)]
        GeoSvc[geoService (Spatial Radii)]
        ImgSvc[imageTo3dService & ImageUtils]
        OfficeKit[officeKitProvider]
    end

    subgraph Backend_Layer [Storage & Data Access]
        Supabase[(Supabase PostgreSQL & PostGIS)]
        LocalStorage[(Local SQLite / Cache)]
    end

    Shell --> Nav
    Shell --> Home
    Shell --> Explore
    Shell --> Copilot
    Shell --> Orders
    Shell --> Portal

    Copilot --> MatCtx
    Orders --> EscrowCtx
    Portal --> StoreCtx

    Copilot --> PriceSvc
    Copilot --> ImgSvc
    Explore --> GeoSvc
    Copilot --> OfficeKit

    StoreCtx --> Supabase
    EscrowCtx --> Supabase
```

---

## 1. Mobile Presentation Layer (`src/components/mobile/`)
- **`MobileAppShell.tsx`**: Manages the phone viewport, status bar, and active bottom tab viewports.
- **`MobileBottomNav.tsx`**: 5-tab pinned navigation bar with quick Craft AI FAB button.
- **`MobileHeader.tsx`**: Brand header with dynamic locality switcher and mode toggle.

## 2. Business Services Layer (`src/services/`)
- **`pricingService.ts`**: Pure mathematical volumetric pricing functions based on physical dimensions (Length × Width × Height) and certified material rates.
- **`geoService.ts`**: Calculates geographic distance from user location to regional artisan workshops.
- **`officeKitProvider.ts`**: Cross-device continuity provider for syncing mobile specifications to desktop 3D viewers.

## 3. The State Context Layer (`src/context/`)
- **`MaterialContext.tsx`**: Handles active material slot selections, wood types, brass accents, and finishes for the 3D model.
- **`KaragirStoreContext.tsx`**: Manages artisan login sessions, store configurations, and product catalog states.
- **`EscrowContext.tsx`**: Manages order milestones, proof verification states, and digital vault payouts.
