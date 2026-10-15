# PromoLint · Official Shopify App Store Screenshots Contact Sheet

This document catalogs the official listing screenshots captured for **PromoLint**.

---

## 1. Shopify App Store Specification Compliance

| Requirement | Shopify Official Specification | PromoLint Assets Status |
| :--- | :--- | :--- |
| **Dimensions** | 1600 × 900 px (or min 1280 × 720 px) | **Exact 1600 × 900 px** ✅ |
| **Aspect Ratio** | 16:9 widescreen | **Exact 16:9** ✅ |
| **File Format** | PNG or JPEG | **Crisp PNG (8-bit RGB)** ✅ |
| **Framing** | Pure embedded Shopify Admin UI (no marketing cards/overlays) | **Native Shopify Topbar & Polaris Nav** ✅ |
| **Color Profile** | sRGB | **sRGB standard** ✅ |

---

## 2. Contact Sheet & Route Mapping

### Screenshot 1: Store Readiness Center & Overview Dashboard
- **File:** `shopify-app-store-assets/listing-ready-1600x900/screenshot-1-dashboard.png`
- **Route / Context:** `/app` (`app/routes/app._index.tsx`) inside embedded Shopify Admin
- **Asset Size:** 1600 × 900 px PNG
- **Features Demonstrated:**
  - Real Shopify Admin top navigation bar (`#1a1a1a`), search bar (`⌘ K`), and store badge (`rankpilot · dev`).
  - Left Shopify navigation with PromoLint selected.
  - Store Promotion Readiness status (**98% Healthy - 24 Checks**).
  - 4 Key Metrics Cards: Total Audits Run (24), Ready to Launch (19), Needs Review (3), Blocked High-Risk (2).
  - Recent Pre-Flight Offer Checks table showing real product promotions (Classic Leather Moto Jacket, Cashmere Crewneck, Silk Midi Skirt, Canvas Weekender Duffle) with status badges (`READY`, `BLOCKED`, `REVIEW`).

---

### Screenshot 2: Check an Offer (Pre-Flight Promotion Simulator)
- **File:** `shopify-app-store-assets/listing-ready-1600x900/screenshot-2-check-an-offer.png`
- **Route / Context:** `/app/new` (`app/routes/app.new.tsx`)
- **Asset Size:** 1600 × 900 px PNG
- **Features Demonstrated:**
  - Trigger Product selector (*Classic Leather Moto Jacket*, SKU `LMJ-01-BLK`).
  - Offered Upsell selector (*Matching Full-Grain Leather Belt*, SKU `LBLT-01-BLK`).
  - Discount rule dropdown configured to **30% OFF**.
  - Fulfillment location picker (*Main Distribution Hub - Chicago, IL*).
  - Live simulator calculation card:
    - Customer Discounted Price: **$68.60 USD**
    - Shopify Unit Cost: **$42.00 USD**
    - Verified Gross Margin: **+38.8%** (Green)
    - Dollar Profit: **+$26.60**
    - Break-Even Floor: **57.1% OFF ($42.00 price)**
    - Available Units: **45 in stock**

---

### Screenshot 3: Audit Results & Multi-Location Breakdown
- **File:** `shopify-app-store-assets/listing-ready-1600x900/screenshot-3-audit-results.png`
- **Route / Context:** `/app/checks/:id` (`app/routes/app.checks.$id.tsx`)
- **Asset Size:** 1600 × 900 px PNG
- **Features Demonstrated:**
  - Full-width Polaris layout showing complete financial audit.
  - Green **READY FOR LAUNCH** status banner with clear rationale.
  - Financial Margin Card: Catalog Price ($98.00) vs Discount (-30%) vs Unit Cost ($42.00) vs Gross Margin (+38.8%).
  - Multi-location inventory breakdown with active threshold validation.
  - Stacking Guard analysis against active store discounts (`WELCOME10`), confirming stacking is safe.

---

### Screenshot 4: Offer Checks History & 1-Click CSV Export
- **File:** `shopify-app-store-assets/listing-ready-1600x900/screenshot-4-checks-history.png`
- **Route / Context:** `/app/checks` (`app/routes/app.checks.tsx`)
- **Asset Size:** 1600 × 900 px PNG
- **Features Demonstrated:**
  - Filterable audit log with status tabs (`All (24)`, `Ready (19)`, `Review (3)`, `Blocked (2)`).
  - Search bar supporting queries by campaign, product title, or SKU.
  - Complete historical log table with audit dates, products, discount types, profit margin percentages, and direct detail links.
  - Primary button: **Export to CSV (All)** for finance and compliance accounting.

---

### Screenshot 5: QA Guardrail Settings & Threshold Configuration
- **File:** `shopify-app-store-assets/listing-ready-1600x900/screenshot-5-settings.png`
- **Route / Context:** `/app/settings` (`app/routes/app.settings.tsx`)
- **Asset Size:** 1600 × 900 px PNG
- **Features Demonstrated:**
  - Minimum gross margin threshold input (e.g., 20.0%).
  - Minimum inventory stock threshold input (e.g., 5 units).
  - Default primary fulfillment location selector (*Main Distribution Hub - Chicago, IL*).
  - Explanatory guidance for merchant QA safety.

---

### Screenshot 6: Transparent Plan & Billing Screen
- **File:** `shopify-app-store-assets/listing-ready-1600x900/screenshot-6-plan-and-billing.png`
- **Route / Context:** `/app/billing` (`app/routes/app.billing.tsx`)
- **Asset Size:** 1600 × 900 px PNG
- **Features Demonstrated:**
  - Exact match of the real PromoLint billing interface inside Shopify Admin.
  - **Free Tier Card ($0)**: 5 free audits, catalog price lookup, stock availability.
  - **PromoLint Pro Monthly Card ($19.99 USD / month)**:
    - **Recommended** badge.
    - Prominent **3-day free trial** disclosure (*"You will not be charged today. First charge of $19.99 USD on October 18, 2026"*).
    - Full feature checklist: Unlimited checks, CSV export, stacking audits, break-even solver.
    - Official Shopify subscription approval CTA: **Start 3-Day Free Trial ($19.99/mo)**.

---

## 3. App Store Icon
- **File:** `shopify-app-store-assets/promolint-icon-1200x1200.png`
- **Asset Size:** 1200 × 1200 px (PNG, 1:1 square)
- **Design:** Modern Polaris tag & magnifying glass QA badge with radial gradient background.
