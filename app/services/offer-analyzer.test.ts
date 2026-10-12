import { describe, it, expect } from "vitest";
import {
  calculateDiscountedPrice,
  calculateBreakEven,
  calculateProfit,
  analyzeInventory,
  analyzeDiscounts,
  evaluateOfferCheck,
  roundToCents,
  roundPercentage,
  getStructuredFindingDetails,
} from "./offer-analyzer";

describe("PromoLint Offer Analyzer - Calculation & Domain Rules", () => {
  describe("Decimal & Money Rounding", () => {
    it("safely rounds money to cents avoiding binary float inaccuracy", () => {
      expect(roundToCents(0.1 + 0.2)).toBe(0.3);
      expect(roundToCents(19.999)).toBe(20.0);
      expect(roundToCents(14.254)).toBe(14.25);
    });

    it("safely rounds percentages to 2 decimals", () => {
      expect(roundPercentage(33.333333)).toBe(33.33);
      expect(roundPercentage(66.666666)).toBe(66.67);
    });
  });

  describe("Discounted Unit Price Calculations", () => {
    it("calculates percentage discount accurately", () => {
      // $100 with 20% discount = $80.00
      expect(calculateDiscountedPrice(100, "PERCENTAGE", 20)).toBe(80.0);
      // $49.99 with 15% discount = $42.49
      expect(calculateDiscountedPrice(49.99, "PERCENTAGE", 15)).toBe(42.49);
    });

    it("handles 100% or greater discount by capping price at $0.00", () => {
      expect(calculateDiscountedPrice(50, "PERCENTAGE", 100)).toBe(0);
      expect(calculateDiscountedPrice(50, "PERCENTAGE", 120)).toBe(0);
    });

    it("calculates fixed amount discount accurately", () => {
      // $50 with $10 fixed discount = $40.00
      expect(calculateDiscountedPrice(50, "FIXED_AMOUNT", 10)).toBe(40.0);
      // $25.50 with $5.25 fixed discount = $20.25
      expect(calculateDiscountedPrice(25.5, "FIXED_AMOUNT", 5.25)).toBe(20.25);
    });

    it("caps fixed discount at 0 when discount exceeds current price", () => {
      expect(calculateDiscountedPrice(25, "FIXED_AMOUNT", 30)).toBe(0);
      expect(calculateDiscountedPrice(25, "FIXED_AMOUNT", 25)).toBe(0);
    });

    it("sets fixed offer price directly for FIXED_PRICE scenarios", () => {
      // $50 current price with proposed fixed offer price of $35.00
      expect(calculateDiscountedPrice(50, "FIXED_PRICE", 35)).toBe(35.0);
      expect(calculateDiscountedPrice(50, "FIXED_PRICE", 19.99)).toBe(19.99);
      // Handles 0 or negative
      expect(calculateDiscountedPrice(50, "FIXED_PRICE", 0)).toBe(0);
    });
  });

  describe("Break-Even & Target Margin Benchmarks", () => {
    it("calculates break-even price and maximum allowable discount accurately", () => {
      // Catalog price $100, unit cost $40, target margin 20%
      // Pure break-even = $40.00
      // Target margin price = $40 / (1 - 0.20) = $50.00
      // Max discount amount = $100 - $50 = $50.00 (50%)
      const be = calculateBreakEven(100, 40, 20);
      expect(be.costAvailable).toBe(true);
      expect(be.breakEvenPrice).toBe(40.0);
      expect(be.targetMarginPrice).toBe(50.0);
      expect(be.maxDiscountAmount).toBe(50.0);
      expect(be.maxDiscountPercentage).toBe(50.0);
      expect(be.targetMarginPercentage).toBe(20.0);
      expect(be.explanation).toContain("cannot sell below 50");
    });

    it("returns null benchmarks when unit cost is missing", () => {
      const beNull = calculateBreakEven(100, null, 25);
      expect(beNull.costAvailable).toBe(false);
      expect(beNull.breakEvenPrice).toBeNull();
      expect(beNull.targetMarginPrice).toBeNull();
      expect(beNull.maxDiscountAmount).toBeNull();
      expect(beNull.maxDiscountPercentage).toBeNull();
      expect(beNull.explanation).toContain("cannot be calculated without a unit cost");
    });

    it("caps max discount at $0 when target margin price exceeds catalog price", () => {
      // Catalog price $50, unit cost $45, target margin 20%
      // Target price = 45 / 0.8 = 56.25 > 50
      const be = calculateBreakEven(50, 45, 20);
      expect(be.targetMarginPrice).toBe(56.25);
      expect(be.maxDiscountAmount).toBe(0);
      expect(be.maxDiscountPercentage).toBe(0);
    });
  });

  describe("Gross Profit & Gross Margin Calculations", () => {
    it("calculates positive gross profit and gross margin correctly", () => {
      // Current $100, 20% off -> $80. Cost is $40. Profit is $40. Margin is 50%.
      const res = calculateProfit(100, "PERCENTAGE", 20, 40, 20);
      expect(res.discountedPrice).toBe(80);
      expect(res.unitCost).toBe(40);
      expect(res.costSource).toBe("Shopify Variant inventoryItem.unitCost");
      expect(res.grossProfit).toBe(40);
      expect(res.grossMargin).toBe(50);
      expect(res.costMissing).toBe(false);
      expect(res.warnings.some((w) => w.severity === "BLOCKER")).toBe(false);
    });

    it("does NOT assume zero when unit cost is missing (shows Profit can't be estimated)", () => {
      const resNull = calculateProfit(100, "PERCENTAGE", 20, null);
      expect(resNull.costMissing).toBe(true);
      expect(resNull.unitCost).toBeNull();
      expect(resNull.grossProfit).toBeNull();
      expect(resNull.grossMargin).toBeNull();
      expect(resNull.costSource).toBe("None (Missing in Shopify)");
      expect(resNull.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "MISSING_PRODUCT_COST",
            severity: "WARNING",
            findingLevel: "Unable to verify",
          }),
        ])
      );

      const resUndef = calculateProfit(100, "PERCENTAGE", 20, undefined);
      expect(resUndef.costMissing).toBe(true);
      expect(resUndef.grossProfit).toBeNull();
    });

    it("triggers a Warning when offer sells below unit cost (negative profit)", () => {
      // Current $50, $30 fixed off -> $20. Cost is $25. Loss is $5.
      const res = calculateProfit(50, "FIXED_AMOUNT", 30, 25);
      expect(res.discountedPrice).toBe(20);
      expect(res.unitCost).toBe(25);
      expect(res.grossProfit).toBe(-5);
      expect(res.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "SELLING_BELOW_COST",
            severity: "BLOCKER",
            findingLevel: "Warning",
          }),
        ])
      );
    });

    it("triggers a Review finding when gross margin is below merchant threshold", () => {
      // Selling price $100, cost $85 -> profit $15, margin 15%. Threshold 20%.
      const res = calculateProfit(100, "PERCENTAGE", 0, 85, 20);
      expect(res.grossMargin).toBe(15);
      expect(res.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "MARGIN_BELOW_THRESHOLD",
            severity: "WARNING",
            findingLevel: "Review",
          }),
        ])
      );
    });

    it("blocks 100% or price-exceeding discounts as $0.00 selling price", () => {
      const res100 = calculateProfit(50, "PERCENTAGE", 100, 10);
      expect(res100.discountedPrice).toBe(0);
      expect(res100.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "FREE_OR_NEGATIVE_PRICE",
            severity: "BLOCKER",
            findingLevel: "Warning",
          }),
        ])
      );

      const resFixed = calculateProfit(50, "FIXED_AMOUNT", 55, 10);
      expect(resFixed.discountedPrice).toBe(0);
      expect(resFixed.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "DISCOUNT_EXCEEDS_PRICE",
            severity: "BLOCKER",
            findingLevel: "Warning",
          }),
        ])
      );
    });

    it("scales total revenue, total cost, and total gross profit for bundle quantities", () => {
      // Current $100, 20% off -> $80. Cost is $40. Single profit is $40.
      // Quantity = 4 units -> Total Rev: $320, Total Cost: $160, Total Profit: $160
      const res = calculateProfit(100, "PERCENTAGE", 20, 40, 20, 4);
      expect(res.quantity).toBe(4);
      expect(res.discountedPrice).toBe(80);
      expect(res.grossProfit).toBe(40);
      expect(res.totalRevenue).toBe(320);
      expect(res.totalCost).toBe(160);
      expect(res.totalGrossProfit).toBe(160);
    });

    it("uses merchant manual cost assumption when Shopify unit cost is missing", () => {
      const res = calculateProfit(100, "PERCENTAGE", 20, null, 20, 1, 30);
      expect(res.costMissing).toBe(false);
      expect(res.unitCost).toBe(30);
      expect(res.grossProfit).toBe(50); // 80 - 30
      expect(res.grossMargin).toBe(62.5); // 50 / 80 * 100
      expect(res.costSource).toContain("Merchant manual cost assumption (30)");
      expect(res.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "MANUAL_COST_ASSUMPTION_USED",
            severity: "INFO",
            findingLevel: "Good to know",
          }),
        ])
      );
    });

    it("prioritizes Shopify unit cost over merchant assumption when both are provided", () => {
      const res = calculateProfit(100, "PERCENTAGE", 20, 45, 20, 1, 30);
      expect(res.unitCost).toBe(45);
      expect(res.costSource).toBe("Shopify Variant inventoryItem.unitCost");
      expect(res.grossProfit).toBe(35); // 80 - 45
    });

    it("flags FIXED_PRICE scenarios when offer price exceeds catalog price", () => {
      const res = calculateProfit(50, "FIXED_PRICE", 60, 20);
      expect(res.discountedPrice).toBe(60);
      expect(res.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "OFFER_PRICE_EXCEEDS_CATALOG",
            severity: "INFO",
            findingLevel: "Good to know",
          }),
        ])
      );
    });

    it("blocks FIXED_PRICE scenarios when offer price is zero or negative", () => {
      const res = calculateProfit(50, "FIXED_PRICE", 0, 20);
      expect(res.discountedPrice).toBe(0);
      expect(res.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "FREE_OR_NEGATIVE_PRICE",
            severity: "BLOCKER",
            findingLevel: "Warning",
          }),
        ])
      );
    });
  });

  describe("Inventory Status & 5 Distinct States", () => {
    it("identifies untracked inventory (NOT_TRACKED) and clarifies not unlimited stock", () => {
      const res = analyzeInventory(null, false, "Warehouse A", 5);
      expect(res.isTracked).toBe(false);
      expect(res.inventoryState).toBe("NOT_TRACKED");
      expect(res.quantity).toBeNull();
      expect(res.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "INVENTORY_NOT_TRACKED",
            severity: "INFO",
            findingLevel: "Good to know",
          }),
        ])
      );
    });

    it("identifies missing inventory record as UNABLE_TO_VERIFY", () => {
      const res = analyzeInventory(null, true, "Remote Depot", 5, false);
      expect(res.isTracked).toBe(true);
      expect(res.inventoryState).toBe("UNABLE_TO_VERIFY");
      expect(res.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "INVENTORY_RECORD_MISSING",
            severity: "WARNING",
            findingLevel: "Unable to verify",
          }),
        ])
      );
    });

    it("blocks launch if tracked inventory is 0 or negative (OUT_OF_STOCK)", () => {
      const resZero = analyzeInventory(0, true, "Main Store", 5);
      expect(resZero.inventoryState).toBe("OUT_OF_STOCK");
      expect(resZero.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "OUT_OF_STOCK",
            severity: "BLOCKER",
            findingLevel: "Warning",
          }),
        ])
      );

      const resNeg = analyzeInventory(-2, true, "Main Store", 5);
      expect(resNeg.inventoryState).toBe("OUT_OF_STOCK");
      expect(resNeg.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "OUT_OF_STOCK",
            severity: "BLOCKER",
            findingLevel: "Warning",
          }),
        ])
      );
    });

    it("triggers a Review finding if stock is below configured threshold (LOW_STOCK)", () => {
      const res = analyzeInventory(3, true, "Main Store", 5);
      expect(res.quantity).toBe(3);
      expect(res.inventoryState).toBe("LOW_STOCK");
      expect(res.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "LOW_STOCK_THRESHOLD",
            severity: "WARNING",
            findingLevel: "Review",
          }),
        ])
      );
    });

    it("passes with no inventory warnings when stock is in stock (IN_STOCK)", () => {
      const res = analyzeInventory(25, true, "Main Store", 5);
      expect(res.inventoryState).toBe("IN_STOCK");
      expect(res.warnings).toHaveLength(0);
    });

    it("marks UNABLE_TO_VERIFY when tracked inventory level cannot be retrieved", () => {
      const res = analyzeInventory(null, true, "Main Store", 5, true);
      expect(res.inventoryState).toBe("UNABLE_TO_VERIFY");
      expect(res.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "INVENTORY_UNAVAILABLE",
            severity: "WARNING",
            findingLevel: "Unable to verify",
          }),
        ])
      );
    });

    it("blocks offer when available stock is insufficient for bundle offer quantity", () => {
      // 3 units available at location, but bundle scenario requires 5 units
      const res = analyzeInventory(3, true, "Main Store", 2, true, 5);
      expect(res.quantity).toBe(3);
      expect(res.inventoryState).toBe("LOW_STOCK");
      expect(res.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "INSUFFICIENT_STOCK_FOR_QUANTITY",
            severity: "BLOCKER",
            findingLevel: "Warning",
          }),
        ])
      );
    });
  });

  describe("Discount Compatibility Analysis", () => {
    it("reports Unable to verify when discount check data is unavailable instead of pretending no conflicts", () => {
      const res = analyzeDiscounts({
        available: false,
        unavailableReason: "Access scope read_discounts missing",
      });
      expect(res.available).toBe(false);
      expect(res.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "DISCOUNT_CHECK_UNAVAILABLE",
            severity: "WARNING",
            findingLevel: "Unable to verify",
          }),
        ])
      );
    });

    it("warns about active store discounts that allow stacking / combinations without claiming checkout simulation", () => {
      const res = analyzeDiscounts({
        available: true,
        activeDiscounts: [
          {
            id: "gid://shopify/DiscountCodeNode/1",
            title: "SUMMER10",
            status: "ACTIVE",
            combinesWith: {
              productDiscounts: true,
              orderDiscounts: true,
              shippingDiscounts: false,
            },
          },
        ],
      });
      expect(res.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "STACKABLE_DISCOUNTS_DETECTED",
            severity: "WARNING",
            findingLevel: "Review",
          }),
        ])
      );
    });

    it("passes cleanly when active discounts do not allow combinations", () => {
      const res = analyzeDiscounts({
        available: true,
        activeDiscounts: [
          {
            id: "gid://shopify/DiscountCodeNode/2",
            title: "EXCLUSIVE20",
            status: "ACTIVE",
            combinesWith: {
              productDiscounts: false,
              orderDiscounts: false,
              shippingDiscounts: false,
            },
          },
        ],
      });
      expect(res.warnings).toHaveLength(0);
    });
  });

  describe("Full Offer Evaluation Flow & Status Invariants", () => {
    it("returns READY when all conditions pass cleanly", () => {
      const result = evaluateOfferCheck({
        currentPrice: 100,
        unitCost: 40,
        discountType: "PERCENTAGE",
        discountValue: 15,
        inventoryQuantity: 20,
        inventoryTracked: true,
        locationName: "Main Store",
        minStockThreshold: 5,
        minMarginThreshold: 20,
        discountData: {
          available: true,
          activeDiscounts: [],
        },
      });

      expect(result.status).toBe("READY");
      expect(result.discountedPrice).toBe(85);
      expect(result.estimatedGrossProfit).toBe(45);
      expect(result.estimatedGrossMargin).toBe(52.94);
      expect(result.inventoryState).toBe("IN_STOCK");
      expect(result.costSource).toBe("Shopify Variant inventoryItem.unitCost");
      expect(result.warnings.some((w) => w.severity === "BLOCKER")).toBe(false);
      expect(result.warnings.some((w) => w.severity === "WARNING")).toBe(false);
      expect(result.assumptions).toContain("Estimated gross profit per unit");
      expect(result.discountAssumptions).toContain("combinesWith");
    });

    it("strictly prevents READY status when unit cost is missing (returns REVIEW)", () => {
      const result = evaluateOfferCheck({
        currentPrice: 100,
        unitCost: null,
        discountType: "PERCENTAGE",
        discountValue: 15,
        inventoryQuantity: 20,
        inventoryTracked: true,
        locationName: "Main Store",
        minStockThreshold: 5,
        minMarginThreshold: 20,
        discountData: {
          available: true,
          activeDiscounts: [],
        },
      });

      expect(result.status).toBe("REVIEW");
      expect(result.status).not.toBe("READY");
      expect(result.estimatedGrossProfit).toBeNull();
      expect(result.estimatedGrossMargin).toBeNull();
      expect(result.costSource).toBe("None (Missing in Shopify)");
      expect(result.warnings.some((w) => w.code === "MISSING_PRODUCT_COST")).toBe(true);
    });

    it("strictly prevents READY status when inventory is unable to verify", () => {
      const result = evaluateOfferCheck({
        currentPrice: 100,
        unitCost: 40,
        discountType: "PERCENTAGE",
        discountValue: 15,
        inventoryQuantity: null,
        inventoryTracked: true,
        locationName: "Main Store",
        minStockThreshold: 5,
        minMarginThreshold: 20,
        discountData: {
          available: true,
          activeDiscounts: [],
        },
      });

      expect(result.status).toBe("REVIEW");
      expect(result.inventoryState).toBe("UNABLE_TO_VERIFY");
    });

    it("strictly prevents READY status when discount data is unavailable", () => {
      const result = evaluateOfferCheck({
        currentPrice: 100,
        unitCost: 40,
        discountType: "PERCENTAGE",
        discountValue: 15,
        inventoryQuantity: 20,
        inventoryTracked: true,
        locationName: "Main Store",
        minStockThreshold: 5,
        minMarginThreshold: 20,
        discountData: {
          available: false,
          unavailableReason: "Network timeout",
        },
      });

      expect(result.status).toBe("REVIEW");
    });

    it("returns BLOCKED when selling below unit cost", () => {
      const result = evaluateOfferCheck({
        currentPrice: 100,
        unitCost: 80,
        discountType: "PERCENTAGE",
        discountValue: 30, // Price becomes 70, Cost is 80 -> loss of 10
        inventoryQuantity: 20,
        inventoryTracked: true,
        locationName: "Main Store",
        minStockThreshold: 5,
        minMarginThreshold: 20,
        discountData: {
          available: true,
          activeDiscounts: [],
        },
      });

      expect(result.status).toBe("BLOCKED");
      expect(result.estimatedGrossProfit).toBe(-10);
      expect(result.warnings.some((w) => w.code === "SELLING_BELOW_COST")).toBe(true);
    });

    it("returns BLOCKED when out of stock at selected location", () => {
      const result = evaluateOfferCheck({
        currentPrice: 100,
        unitCost: 40,
        discountType: "PERCENTAGE",
        discountValue: 10,
        inventoryQuantity: 0,
        inventoryTracked: true,
        locationName: "Main Store",
        minStockThreshold: 5,
        minMarginThreshold: 20,
        discountData: {
          available: true,
          activeDiscounts: [],
        },
      });

      expect(result.status).toBe("BLOCKED");
      expect(result.inventoryState).toBe("OUT_OF_STOCK");
      expect(result.warnings.some((w) => w.code === "OUT_OF_STOCK")).toBe(true);
    });

    it("evaluates multi-item bundle scenarios and populates bundle totals and break-even", () => {
      const result = evaluateOfferCheck({
        currentPrice: 50,
        unitCost: 20,
        discountType: "FIXED_PRICE",
        discountValue: 40,
        offerQuantity: 3,
        inventoryQuantity: 15,
        inventoryTracked: true,
        locationName: "Main Store",
        minStockThreshold: 5,
        minMarginThreshold: 20,
        discountData: {
          available: true,
          activeDiscounts: [],
        },
      });

      expect(result.status).toBe("READY");
      expect(result.offerQuantity).toBe(3);
      expect(result.discountedPrice).toBe(40);
      expect(result.estimatedGrossProfit).toBe(20);
      expect(result.totalRevenue).toBe(120); // 40 * 3
      expect(result.totalCost).toBe(60); // 20 * 3
      expect(result.totalGrossProfit).toBe(60); // 20 * 3
      expect(result.breakEven.costAvailable).toBe(true);
      expect(result.breakEven.breakEvenPrice).toBe(20);
      expect(result.breakEven.targetMarginPrice).toBe(25); // 20 / (1 - 0.20)
      expect(result.breakEven.maxDiscountAmount).toBe(25); // 50 - 25
    });

    it("allows READY status when merchant enters a valid cost assumption for uncosted variant", () => {
      const result = evaluateOfferCheck({
        currentPrice: 100,
        unitCost: null,
        customCostAssumption: 40,
        discountType: "PERCENTAGE",
        discountValue: 10,
        offerQuantity: 1,
        inventoryQuantity: 20,
        inventoryTracked: true,
        locationName: "Main Store",
        minStockThreshold: 5,
        minMarginThreshold: 20,
        discountData: {
          available: true,
          activeDiscounts: [],
        },
      });

      expect(result.status).toBe("READY");
      expect(result.unitCost).toBe(40);
      expect(result.estimatedGrossProfit).toBe(50);
      expect(result.costSource).toContain("Merchant manual cost assumption");
    });
  });

  describe("Structured Finding Architecture (P1.8)", () => {
    it("ensures all generated warnings possess the four structured sections", () => {
      const evaluation = evaluateOfferCheck({
        currentPrice: 100,
        unitCost: null, // triggers MISSING_PRODUCT_COST
        discountType: "PERCENTAGE",
        discountValue: 20,
        inventoryQuantity: 2, // triggers LOW_STOCK_THRESHOLD
        inventoryTracked: true,
        locationName: "East Warehouse",
        minStockThreshold: 10,
        minMarginThreshold: 20,
        discountData: {
          available: true,
          activeDiscounts: [
            {
              id: "gid://shopify/DiscountCodeNode/1",
              title: "VIP10",
              status: "ACTIVE",
              combinesWith: {
                orderDiscounts: true,
                productDiscounts: true,
                shippingDiscounts: true,
              },
            },
          ],
        },
      });

      expect(evaluation.warnings.length).toBeGreaterThan(0);

      for (const warning of evaluation.warnings) {
        const structured = getStructuredFindingDetails(warning);
        expect(structured.whatWasChecked).toBeTruthy();
        expect(structured.dataUsed).toBeTruthy();
        expect(structured.whyItMatters).toBeTruthy();
        expect(structured.nextStep).toBeTruthy();
      }
    });

    it("falls back gracefully for custom or unknown warning codes", () => {
      const details = getStructuredFindingDetails({
        code: "CUSTOM_UNKNOWN_CODE",
        message: "A custom test warning message.",
        severity: "WARNING",
        findingLevel: "Review",
      });

      expect(details.whatWasChecked).toBe("Pre-launch offer parameters");
      expect(details.dataUsed).toBe("A custom test warning message.");
      expect(details.whyItMatters).toBe("Potential issue identified during automated pre-flight quality check.");
      expect(details.nextStep).toBe("Review offer parameters before publishing.");
    });
  });
});
