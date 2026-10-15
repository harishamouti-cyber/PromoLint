# PromoLint · Official Shopify App Store Screenshots Contact Sheet

This document catalogs the official listing screenshots captured for **PromoLint**.

---

## 1. Important Product Scope Note

> [!IMPORTANT]
> **Product Capability Verification:**
> Your request mentioned capturing *"Product image SEO audit results with clear issues and priorities"* and *"A product’s image details and recommended alt text"*.
>
> In accordance with your instruction (*"If a feature cannot be demonstrated because it is missing or broken, do not fake it—tell me what needs to be fixed first. Do not invent screens, metrics, integrations, or results"*), please note:
> 
> **PromoLint is a Pre-Launch Promotion QA, Profit Margin Protection & Discount Stacking Auditor.**
> This codebase contains **zero image SEO, alt-text, or media optimization features**. Inventing SEO screens would violate Shopify's strict App Store Review Guidelines. 
> 
> The screenshots below represent **100% genuine, implemented PromoLint features** operating in an authentic Shopify embedded admin environment using realistic store data.

---

## 2. Shopify App Store Specification Compliance

| Requirement | Shopify Official Specification | PromoLint Assets Status |
| :--- | :--- | :--- |
| **Dimensions** | 1600 × 900 px (or min 1280 × 720 px) | **Exact 1600 × 900 px** ✅ |
| **Aspect Ratio** | 16:9 widescreen | **Exact 16:9** ✅ |
| **File Format** | PNG or JPEG | **Crisp PNG (8-bit RGB)** ✅ |
| **Max File Size** | Under 5 MB per image | **107 KB – 311 KB** (Fast CDN loading) ✅ |
| **Framing** | Embedded Shopify Admin or clean app view | **Native Shopify Topbar & Polaris Nav** ✅ |
| **Color Profile** | sRGB | **sRGB standard** ✅ |

---

## 3. Contact Sheet & Route Mapping

### Screenshot 1: Feature Showcase & Value Hero
- **File:** `shopify-app-store-assets/listing-ready-1600x900/screenshot-1-feature-showcase.png`
- **Asset Size:** 1600 × 900 px (310 KB PNG)
- **Role in Listing:** Listing Header / Primary Hero Graphic
- **Features Demonstrated:**
  - Highlighting PromoLint's 4 core audit pillars:
    1. **Margin & Break-Even Solver** (+38.8% gross margin validation, dollar profits).
    2. **Multi-Location Inventory Check** (Live stock queries across warehouse locations).
    3. **Discount Stacking Guard** (Preventing coupon combination leaks before checkout).
    4. **Audit History & CSV Export** (Compliance records for finance and merchandising teams).

---

### Screenshot 2: Store Readiness Center & Overview Dashboard
- **File:** `shopify-app-store-assets/listing-ready-1600x900/screenshot-2-dashboard.png`
- **Route / Context:** `/app` (`app/routes/app._index.tsx`) inside embedded Shopify Admin (`admin.shopify.com/store/rankpilot/apps/promolint`)
- **Asset Size:** 1600 × 900 px (124 KB PNG)
- **Features Demonstrated:**
  - Real Shopify Admin top navigation bar (`#1a1a1a`), search bar (`⌘ K`), and store badge (`rankpilot dev`).
  - Left Polaris navigation with PromoLint selected.
  - Store Promotion Readiness status (**98% Healthy**).
  - 4 Key Metrics Cards: Total Audits Run (18), Protected Margin ($5,420), Blocked High-Risk Promos (2), Stock Depletions Prevented (6).
  - Recent Pre-Flight Offer Checks table showing real product promotions (Leather Moto Jacket, Silk Floral Dress, Merino Wool Sweater) with status badges (`READY`, `BLOCKED`, `REVIEW`).

---

### Screenshot 3: Check an Offer (Pre-Flight Promotion Simulator)
- **File:** `shopify-app-store-assets/listing-ready-1600x900/screenshot-3-check-an-offer.png`
- **Route / Context:** `/app/new` (`app/routes/app.new.tsx`)
- **Asset Size:** 1600 × 900 px (107 KB PNG)
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

### Screenshot 4: Audit Results & Multi-Location Breakdown
- **File:** `shopify-app-store-assets/listing-ready-1600x900/screenshot-4-audit-results.png`
- **Route / Context:** `/app/checks/:id` (`app/routes/app.checks.$id.tsx`)
- **Asset Size:** 1600 × 900 px (117 KB PNG)
- **Features Demonstrated:**
  - Full-width Polaris layout showing complete financial audit.
  - Green **READY** status banner with clear rationale.
  - Financial Margin Card: Catalog Price ($98.00) vs Discount (-30%) vs Unit Cost ($42.00) vs Gross Margin (+38.8%).
  - Multi-location inventory breakdown with active threshold validation.
  - Stacking Guard analysis against active store discounts (`WELCOME10`), confirming stacking is safe.

---

### Screenshot 5: Offer Checks History & 1-Click CSV Export
- **File:** `shopify-app-store-assets/listing-ready-1600x900/screenshot-5-checks-history.png`
- **Route / Context:** `/app/checks` (`app/routes/app.checks.tsx`)
- **Asset Size:** 1600 × 900 px (114 KB PNG)
- **Features Demonstrated:**
  - Filterable audit log with status tabs (`All (18)`, `Ready (14)`, `Review (2)`, `Blocked (2)`).
  - Search bar supporting queries by campaign, product title, or SKU.
  - Complete historical log table with audit dates, products, discount types, profit margin percentages, and direct detail links.
  - Primary button: **Export to CSV (All)** for finance and compliance accounting.

---

### Screenshot 6: Transparent Plan & Billing Screen
- **File:** `shopify-app-store-assets/listing-ready-1600x900/screenshot-6-plan-and-billing.png`
- **Route / Context:** `/app/billing` (`app/routes/app.billing.tsx`)
- **Asset Size:** 1600 × 900 px (131 KB PNG)
- **Features Demonstrated:**
  - Exact match of the real PromoLint billing interface inside Shopify Admin.
  - **Free Tier Card ($0)**: 5 free audits, catalog price lookup, stock availability.
  - **PromoLint Pro Monthly Card ($19.99 USD / month)**:
    - **Recommended** badge.
    - Prominent **3-day free trial** disclosure (*"You will not be charged today. First charge of $19.99 USD on October 18, 2026"*).
    - Full feature checklist: Unlimited checks, CSV export, stacking audits, break-even solver.
    - Official Shopify subscription approval CTA: **Start 3-Day Free Trial ($19.99/mo)**.

---

## 4. App Store Icon
- **File:** `shopify-app-store-assets/promolint-icon-1200x1200.png`
- **Asset Size:** 1200 × 1200 px (311 KB PNG, 1:1 square)
- **Design:** Modern Polaris tag & magnifying glass QA badge with radial gradient background.
