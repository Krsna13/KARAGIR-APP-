# Kaaragir Market Reference Listings Dataset

This directory contains reference pricing and specification datasets used for training and evaluating the **Dynamic Pricing Assistant** (ML & regression pricing model).

## Overview

The `market-reference-listings.csv` file provides comparable real-world market pricing for handcrafted goods across India. The ingestion pipeline (`scripts/seedMarketListings.ts`) validates each entry and inserts the records into Supabase's `market_reference_listings` table using the service-role key.

## Current State: Sample Data

The current `market-reference-listings.csv` contains **10 placeholder rows** clearly marked as `SAMPLE DATA`. These sample records allow end-to-end testing of the ingestion script, RLS policies, and validation pipeline before real market research data is collected.

## Real Data Collection Plan

### Recommended Sourcing Channels
Before production training, replace the sample rows with real listing data collected from:
1. **IndiaMART (Handicraft & Artisan B2B Suppliers)**: Bulk and wholesale craft rates, raw material pricing, and artisan maker quotes across regional hubs (e.g. Saharanpur woodwork, Jaipur pottery, Moradabad brass).
2. **Amazon Karigar & Handicrafts Storefronts**: Direct-to-consumer retail prices, shipping dimensions, and material specifications for certified artisan goods.
3. **Artisan Cooperative Price Lists & Catalogs**: Official catalog prices from organizations such as Dastkar, TRIFED (Tribal Cooperative Marketing Development Federation of India), and Central Cottage Industries Corporation (CCIC).

### Minimum Recommended Volume
- **Minimum Target**: **200+ validated rows** across the 6 craft categories.
- **Per-Category Allocation**: Approximately **35–50 listings per category** (`Woodwork`, `Pottery`, `Brasscraft`, `Textile`, `Furniture`, `Metal`) to capture adequate variance across materials, dimensions, and craftsmanship complexity.

## CSV Schema & Field Requirements

| Column | Type | Required? | Validation Rule / Description |
| :--- | :--- | :--- | :--- |
| `category` | String | **Yes** | Must be one of: `Woodwork`, `Pottery`, `Brasscraft`, `Textile`, `Furniture`, `Metal`. |
| `material` | String | **Yes** | Specific artisan material (e.g., `Teak Wood`, `Terracotta Clay`, `Solid Brass`, `Khadi Cotton`, `Rosewood`). |
| `dimensions_volume` | Number | No | Estimated item volume in cubic centimeters ($L \times W \times H$ in cm) or `null` if not measurable. |
| `listed_price` | Number | **Yes** | Listed retail/market price in INR. Must be numeric and $> 0.00$. |
| `source` | String | No | Source platform, catalog SKU, or URL (e.g., `IndiaMART - Saharanpur Wood Co-op`). |

## Ingestion Pipeline

To ingest the CSV into Supabase `market_reference_listings`, run:

```bash
npm run seed:market-data
```

The script will:
1. Parse `data/market-reference-listings.csv`.
2. Validate every row against schema constraints (valid category, price $> 0$, required fields present).
3. Connect to Supabase using the service role key (`SUPABASE_SERVICE_ROLE_KEY` in `.env`).
4. Insert validated records into `market_reference_listings`.
5. Output a summary report: total rows read, rows inserted, and any rows rejected with clear reasons.
