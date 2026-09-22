# Stage 7: Cross-Device Continuity & Office Kit Integration

## Overview
Cross-device continuity enables a buyer to initiate custom designs via voice and camera on their smartphone and seamlessly sync to desktop viewers or native Android hardware.

## Architecture
- `src/services/officeKitProvider.ts`: Hardware abstraction layer.
- `MockOfficeKitProvider`: Cross-tab `localStorage` event sync for instant browser testing.
- `LocalOfficeKitProvider`: Native Android bridging layer.
