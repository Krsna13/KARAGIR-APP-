-- Migration: 20260930093000_seed_material_registry_demo.sql
-- Seeds the Material Registry (20260930090000_material_registry_schema.sql) with the
-- 5 demo material batches shown in the artisan portal UI mock
-- (src/data/materialRegistryMockData.ts), so a real artisan account has starter
-- inventory rows to allocate against instead of only client-side mock data.
--
-- Idempotent: safe to re-run. Uses fixed UUIDs and ON CONFLICT DO NOTHING.

-- ============================================================================
-- 1. DEMO ARTISAN (only created if it doesn't already exist)
-- ============================================================================
INSERT INTO artisans (id, name, phone, shop_name, location, address, category)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'Demo Artisan Workshop',
  '+91-0000000001',
  'Karagir Demo Workshop',
  ST_SetSRID(ST_MakePoint(73.7715, 20.0059), 4326)::geography, -- Nashik, Maharashtra
  'Satpur MIDC, Nashik',
  'Woodwork'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. MATERIAL BATCHES
-- ============================================================================
INSERT INTO material_batches (
  id, artisan_id, material_code, category, material_name, grade,
  supplier_name, supplier_location, invoice_number, supplier_batch_code,
  purchased_qty, unit, purchase_date, traceability_status
)
VALUES
  (
    '00000000-0000-4000-9000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    'KAR-MAT-2026-97373', 'Wood', 'Seasoned Sagwan Teak', 'A',
    'Sahrangpur Pvt Wood', 'Nashik, Maharashtra', 'INV-4521', 'TV-0826-19',
    100, 'kg', '2026-08-14', 'complete'
  ),
  (
    '00000000-0000-4000-9000-000000000002',
    '00000000-0000-4000-8000-000000000001',
    'KAR-MAT-2026-51284', 'Metal', 'Polished Brass Sheet', 'A',
    'Moradabad Brassworks Co.', 'Moradabad, Uttar Pradesh', 'INV-3390', 'BR-1120-04',
    40, 'kg', '2026-08-02', 'complete'
  ),
  (
    '00000000-0000-4000-9000-000000000003',
    '00000000-0000-4000-8000-000000000001',
    'KAR-MAT-2026-63012', 'Stone', 'Makrana White Marble Block', 'B',
    'Makrana Marble Traders', 'Makrana, Rajasthan', 'INV-2207', 'MK-0715-02',
    250, 'kg', '2026-07-15', 'pending'
  ),
  (
    '00000000-0000-4000-9000-000000000004',
    '00000000-0000-4000-8000-000000000001',
    'KAR-MAT-2026-40756', 'Clay', 'Khurja Terracotta Clay', 'A',
    'Khurja Pottery Cooperative', 'Khurja, Uttar Pradesh', 'INV-1188', 'KH-0603-11',
    80, 'kg', '2026-06-03', 'complete'
  ),
  (
    '00000000-0000-4000-9000-000000000005',
    '00000000-0000-4000-8000-000000000001',
    'KAR-MAT-2026-28931', 'Leather', 'Buffalo Full-Grain Leather Hide', 'A',
    'Kanpur Leatherworks', 'Kanpur, Uttar Pradesh', 'INV-0765', 'KL-0512-07',
    30, 'kg', '2026-05-12', 'pending'
  )
ON CONFLICT (material_code) DO NOTHING;

-- ============================================================================
-- 3. MATERIAL ALLOCATIONS (matching the mock UI's already-allocated projects)
-- ============================================================================
INSERT INTO material_allocations (id, batch_id, artisan_id, project_label, project_ref, allocated_qty)
VALUES
  (
    '00000000-0000-4000-a000-000000000001',
    '00000000-0000-4000-9000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    'Custom Oak & Sagwan Teak Dining Table', '#KARAGIR-99210', 30
  ),
  (
    '00000000-0000-4000-a000-000000000002',
    '00000000-0000-4000-9000-000000000002',
    '00000000-0000-4000-8000-000000000001',
    'Engraved Brass Wall Panel', '#KARAGIR-98874', 12
  ),
  (
    '00000000-0000-4000-a000-000000000003',
    '00000000-0000-4000-9000-000000000004',
    '00000000-0000-4000-8000-000000000001',
    'Hand-painted Terracotta Vase Set', '#KARAGIR-97650', 25
  )
ON CONFLICT (id) DO NOTHING;
