import { describe, it, expect } from "vitest";
import { formatOfferChecksToCsv } from "./checks.server";

describe("PromoLint CSV Audit Export", () => {
  it("formats checks into valid RFC-4180 CSV with all required headers", () => {
    const mockChecks = [
      {
        id: "check-1",
        shop: "test-store.myshopify.com",
        status: "READY",
        triggerProductId: "gid://shopify/Product/1",
        triggerProductTitle: "Classic Tee, Red",
        triggerVariantId: "gid://shopify/ProductVariant/10",
        triggerVariantTitle: "M",
        triggerVariantSku: "TEE-RED-M",
        offeredProductId: "gid://shopify/Product/2",
        offeredProductTitle: "Cap \"Special Edition\"",
        offeredVariantId: "gid://shopify/ProductVariant/20",
        offeredVariantTitle: "One Size",
        offeredVariantSku: "CAP-SE-OS",
        offerQuantity: 2,
        discountType: "PERCENTAGE",
        discountValue: 20,
        currentPrice: 30,
        currencyCode: "USD",
        unitCost: 10,
        costSource: "Shopify Variant inventoryItem.unitCost",
        discountedPrice: 24,
        estimatedGrossProfit: 14,
        estimatedGrossMargin: 58.33,
        totalRevenue: 48,
        totalCost: 20,
        totalGrossProfit: 28,
        breakEvenPrice: 12.5,
        maxDiscountAmount: 17.5,
        locationName: "Main Warehouse",
        locationId: "gid://shopify/Location/1",
        inventoryTracked: true,
        inventoryQuantity: 45,
        inventoryState: "IN_STOCK",
        warnings: JSON.stringify([]),
        recheckOfId: null,
        duplicatedFromId: null,
        createdAt: new Date("2026-10-12T12:00:00Z"),
      },
    ];

    const csv = formatOfferChecksToCsv(mockChecks);
    expect(csv).toContain("Check ID,Checked At,Status,Scenario Trigger Product");
    expect(csv).toContain("check-1");
    // Escaped title with comma
    expect(csv).toContain('"Classic Tee, Red"');
    // Escaped quotes in title
    expect(csv).toContain('"Cap ""Special Edition"""');
    expect(csv).toContain("READY");
    expect(csv).toContain("24");
    expect(csv).toContain("14");
    expect(csv).toContain("58.33%");
    expect(csv).toContain("48");
    expect(csv).toContain("TEE-RED-M");
    expect(csv).toContain("CAP-SE-OS");
    expect(csv).toContain("Standard Exclusions");
  });

  it("handles missing cost gracefully in CSV export without fabricating zero", () => {
    const mockChecks = [
      {
        id: "check-2",
        shop: "test-store.myshopify.com",
        status: "REVIEW",
        triggerProductId: "gid://shopify/Product/1",
        triggerProductTitle: "Jeans",
        triggerVariantId: "gid://shopify/ProductVariant/10",
        triggerVariantTitle: "32/32",
        triggerVariantSku: null,
        offeredProductId: "gid://shopify/Product/3",
        offeredProductTitle: "Belt",
        offeredVariantId: "gid://shopify/ProductVariant/30",
        offeredVariantTitle: "Black",
        offeredVariantSku: null,
        offerQuantity: 1,
        discountType: "FIXED_AMOUNT",
        discountValue: 5,
        currentPrice: 25,
        currencyCode: "USD",
        unitCost: null,
        costSource: "None (Missing in Shopify)",
        discountedPrice: 20,
        estimatedGrossProfit: null,
        estimatedGrossMargin: null,
        totalRevenue: 20,
        totalCost: null,
        totalGrossProfit: null,
        breakEvenPrice: null,
        maxDiscountAmount: null,
        locationName: "Downtown",
        locationId: "gid://shopify/Location/2",
        inventoryTracked: false,
        inventoryQuantity: null,
        inventoryState: "NOT_TRACKED",
        warnings: JSON.stringify([
          { code: "MISSING_PRODUCT_COST", message: "No cost recorded", severity: "WARNING", findingLevel: "Unable to verify" },
        ]),
        recheckOfId: null,
        duplicatedFromId: null,
        createdAt: new Date("2026-10-12T13:00:00Z"),
      },
    ];

    const csv = formatOfferChecksToCsv(mockChecks);
    expect(csv).toContain("Missing");
    expect(csv).toContain("N/A");
    expect(csv).toContain("NOT_TRACKED");
    expect(csv).toContain("MISSING_PRODUCT_COST");
  });
});
