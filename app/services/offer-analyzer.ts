/**
 * PromoLint Offer Analyzer
 * Pure domain logic for offer QA, profit estimates, stock analysis, and discount compatibility warnings.
 */

export type DiscountType = "PERCENTAGE" | "FIXED_AMOUNT";

export type WarningSeverity = "BLOCKER" | "WARNING" | "INFO";

export type InventoryState =
  | "UNTRACKED"
  | "MISSING_RECORD"
  | "ZERO_STOCK"
  | "LOW_STOCK"
  | "HEALTHY"
  | "UNAVAILABLE";

export interface OfferWarning {
  code: string;
  message: string;
  severity: WarningSeverity;
}

export interface ProfitResult {
  discountedPrice: number;
  unitCost: number | null;
  grossProfit: number | null;
  grossMargin: number | null;
  costMissing: boolean;
  warnings: OfferWarning[];
}

export interface InventoryAnalysisResult {
  quantity: number | null;
  isTracked: boolean;
  inventoryState: InventoryState;
  locationName: string;
  warnings: OfferWarning[];
}

export interface ActiveDiscountSummary {
  id: string;
  title: string;
  summary?: string;
  status: string;
  combinesWith?: {
    orderDiscounts?: boolean;
    productDiscounts?: boolean;
    shippingDiscounts?: boolean;
  };
}

export interface DiscountAnalysisResult {
  available: boolean;
  unavailableReason?: string;
  activeDiscounts: ActiveDiscountSummary[];
  warnings: OfferWarning[];
}

export interface EvaluateOfferParams {
  currentPrice: number;
  unitCost: number | null | undefined;
  discountType: DiscountType;
  discountValue: number;
  currencyCode?: string;
  inventoryQuantity: number | null | undefined;
  inventoryTracked: boolean;
  hasInventoryRecord?: boolean;
  locationName: string;
  minStockThreshold: number;
  minMarginThreshold: number;
  discountData?: {
    available: boolean;
    unavailableReason?: string;
    activeDiscounts?: ActiveDiscountSummary[];
  };
}

export interface OfferEvaluationResult {
  status: "READY" | "REVIEW" | "BLOCKED";
  discountedPrice: number;
  unitCost: number | null;
  estimatedGrossProfit: number | null;
  estimatedGrossMargin: number | null;
  inventoryQuantity: number | null;
  inventoryTracked: boolean;
  inventoryState: InventoryState;
  locationName: string;
  warnings: OfferWarning[];
  assumptions: string;
  evaluatedAt: string;
}

export const PROMO_LINT_ASSUMPTIONS_TEXT =
  "Estimated gross profit per unit is calculated as (discounted unit price − unit cost). " +
  "It explicitly excludes shipping, taxes, payment gateway processing fees (e.g. 2.9% + 30¢), packaging, warehouse handling, and customer returns/refunds. " +
  "This is an estimated gross figure, not net profit or guaranteed profit. " +
  "Point-in-time inventory counts reflect stock observed at the check timestamp and do not reserve stock. " +
  "Discount findings highlight active store discount combination settings; shopper eligibility, cart contents, " +
  "and Shopify checkout logic dictate actual final customer pricing. PromoLint is an administrative QA tool and does not publish offers, enforce storefront cart rules, or modify checkout.";

/**
 * Safe round to 2 decimal places to prevent binary floating-point inaccuracies
 */
export function roundToCents(amount: number): number {
  if (isNaN(amount) || !isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * Safe round to 2 decimal places for percentage
 */
export function roundPercentage(pct: number): number {
  if (isNaN(pct) || !isFinite(pct)) return 0;
  return Math.round((pct + Number.EPSILON) * 100) / 100;
}

/**
 * Calculate the discounted unit price based on discount type and value.
 */
export function calculateDiscountedPrice(
  currentPrice: number,
  discountType: DiscountType,
  discountValue: number
): number {
  const safePrice = Math.max(0, roundToCents(currentPrice));
  const safeDiscount = Math.max(0, discountValue);

  if (discountType === "PERCENTAGE") {
    if (safeDiscount >= 100) {
      return 0;
    }
    const ratio = (100 - safeDiscount) / 100;
    return roundToCents(safePrice * ratio);
  } else {
    // FIXED_AMOUNT
    const remaining = safePrice - roundToCents(safeDiscount);
    return Math.max(0, roundToCents(remaining));
  }
}

/**
 * Calculate estimated gross profit and gross margin percentage.
 */
export function calculateProfit(
  currentPrice: number,
  discountType: DiscountType,
  discountValue: number,
  unitCost: number | null | undefined,
  minMarginThreshold = 20.0
): ProfitResult {
  const warnings: OfferWarning[] = [];
  const discountedPrice = calculateDiscountedPrice(currentPrice, discountType, discountValue);

  if (discountType === "PERCENTAGE" && discountValue >= 100) {
    warnings.push({
      code: "FREE_OR_NEGATIVE_PRICE",
      message: "Proposed discount is 100% or greater, resulting in a $0.00 selling price.",
      severity: "BLOCKER",
    });
  } else if (discountType === "FIXED_AMOUNT" && discountValue >= currentPrice) {
    warnings.push({
      code: "DISCOUNT_EXCEEDS_PRICE",
      message: `Proposed fixed discount (${discountValue}) meets or exceeds the current product price (${currentPrice}), resulting in a $0.00 selling price.`,
      severity: "BLOCKER",
    });
  }

  // Cost handling: if null, undefined, or NaN, do NOT assume zero!
  if (unitCost === null || unitCost === undefined || isNaN(unitCost)) {
    warnings.push({
      code: "MISSING_PRODUCT_COST",
      message: "Add product cost in Shopify (Shopify Admin > Products > [Product] > Cost per item) to calculate profit. Gross profit and margin cannot be estimated without unit cost.",
      severity: "WARNING",
    });

    return {
      discountedPrice,
      unitCost: null,
      grossProfit: null,
      grossMargin: null,
      costMissing: true,
      warnings,
    };
  }

  const safeCost = roundToCents(unitCost);
  const grossProfit = roundToCents(discountedPrice - safeCost);

  let grossMargin: number | null = null;
  if (discountedPrice > 0) {
    grossMargin = roundPercentage((grossProfit / discountedPrice) * 100);
  } else {
    grossMargin = 0;
  }

  if (grossProfit < 0) {
    warnings.push({
      code: "SELLING_BELOW_COST",
      message: `Offer sells below product unit cost. Estimated gross loss is ${Math.abs(grossProfit)} per unit.`,
      severity: "BLOCKER",
    });
  } else if (grossMargin !== null && grossMargin < minMarginThreshold) {
    warnings.push({
      code: "MARGIN_BELOW_THRESHOLD",
      message: `Estimated gross margin is ${grossMargin}%, which is below your configured merchant preference threshold of ${minMarginThreshold}%.`,
      severity: "WARNING",
    });
  }

  return {
    discountedPrice,
    unitCost: safeCost,
    grossProfit,
    grossMargin,
    costMissing: false,
    warnings,
  };
}

/**
 * Analyze inventory levels against threshold and tracking configuration.
 * Distinct states: UNTRACKED, MISSING_RECORD, ZERO_STOCK, LOW_STOCK, HEALTHY, UNAVAILABLE.
 */
export function analyzeInventory(
  quantity: number | null | undefined,
  isTracked: boolean,
  locationName: string,
  minStockThreshold = 5,
  hasInventoryRecord = true
): InventoryAnalysisResult {
  const warnings: OfferWarning[] = [];

  // State 1: Untracked in Shopify
  if (!isTracked) {
    warnings.push({
      code: "INVENTORY_UNTRACKED",
      message: `Inventory tracking is disabled for this variant in Shopify. Stock is not monitored at ${locationName}.`,
      severity: "INFO",
    });

    return {
      quantity: null,
      isTracked: false,
      inventoryState: "UNTRACKED",
      locationName,
      warnings,
    };
  }

  // State 2: Missing inventory record at selected location
  if (hasInventoryRecord === false) {
    warnings.push({
      code: "INVENTORY_RECORD_MISSING",
      message: `No inventory record exists for this variant at ${locationName}. Stock cannot be verified at this location.`,
      severity: "WARNING",
    });

    return {
      quantity: null,
      isTracked: true,
      inventoryState: "MISSING_RECORD",
      locationName,
      warnings,
    };
  }

  // State 3: Inventory level unavailable (API query error or unreadable)
  if (quantity === null || quantity === undefined) {
    warnings.push({
      code: "INVENTORY_UNAVAILABLE",
      message: `Inventory level could not be read for ${locationName}. Verify inventory permissions and location assignment in Shopify.`,
      severity: "WARNING",
    });

    return {
      quantity: null,
      isTracked: true,
      inventoryState: "UNAVAILABLE",
      locationName,
      warnings,
    };
  }

  // State 4: Zero stock (0 or negative oversold)
  if (quantity <= 0) {
    const isZero = quantity === 0;
    warnings.push({
      code: "OUT_OF_STOCK",
      message: isZero
        ? `Variant has 0 units available at ${locationName} (out of stock). Launching an offer with zero stock risks unfulfillable orders.`
        : `Variant has negative inventory (${quantity} units) at ${locationName} (oversold). Launching an offer with negative stock risks fulfillment failures.`,
      severity: "BLOCKER",
    });

    return {
      quantity,
      isTracked: true,
      inventoryState: "ZERO_STOCK",
      locationName,
      warnings,
    };
  }

  // State 5: Low stock below merchant-configured threshold
  if (quantity < minStockThreshold) {
    warnings.push({
      code: "LOW_STOCK_THRESHOLD",
      message: `Low inventory: Only ${quantity} units observed at ${locationName}, which is below your configured merchant preference threshold of ${minStockThreshold} units.`,
      severity: "WARNING",
    });

    return {
      quantity,
      isTracked: true,
      inventoryState: "LOW_STOCK",
      locationName,
      warnings,
    };
  }

  // State 6: Healthy inventory
  return {
    quantity,
    isTracked: true,
    inventoryState: "HEALTHY",
    locationName,
    warnings,
  };
}

/**
 * Check active store discounts and combination permissions.
 */
export function analyzeDiscounts(
  discountData?: {
    available: boolean;
    unavailableReason?: string;
    activeDiscounts?: ActiveDiscountSummary[];
  }
): DiscountAnalysisResult {
  const warnings: OfferWarning[] = [];

  if (!discountData || !discountData.available) {
    const reason = discountData?.unavailableReason || "Store discounts could not be queried or permission is missing.";
    warnings.push({
      code: "DISCOUNT_CHECK_UNAVAILABLE",
      message: `Discount check unavailable: ${reason}. Existing discounts and stacking rules could not be audited.`,
      severity: "WARNING",
    });

    return {
      available: false,
      unavailableReason: reason,
      activeDiscounts: [],
      warnings,
    };
  }

  const activeDiscounts = discountData.activeDiscounts || [];

  // Check for any active discount that allows stacking / combining with product discounts
  const stackableDiscounts = activeDiscounts.filter(
    (d) =>
      d.combinesWith?.productDiscounts ||
      d.combinesWith?.orderDiscounts ||
      d.combinesWith?.shippingDiscounts
  );

  if (stackableDiscounts.length > 0) {
    const sampleTitles = stackableDiscounts.slice(0, 3).map((d) => `"${d.title}"`).join(", ");
    warnings.push({
      code: "STACKABLE_DISCOUNTS_DETECTED",
      message: `${stackableDiscounts.length} active store discount(s) have combination permissions enabled (${sampleTitles}). Shoppers might stack additional discounts at checkout. Note: Shopify checkout combination rules and customer eligibility govern final checkout pricing; PromoLint does not simulate checkout totals.`,
      severity: "WARNING",
    });
  }

  return {
    available: true,
    activeDiscounts,
    warnings,
  };
}

/**
 * Master evaluation function for PromoLint offer check.
 */
export function evaluateOfferCheck(params: EvaluateOfferParams): OfferEvaluationResult {
  const allWarnings: OfferWarning[] = [];

  // 1. Profit & Pricing Analysis
  const profitAnalysis = calculateProfit(
    params.currentPrice,
    params.discountType,
    params.discountValue,
    params.unitCost,
    params.minMarginThreshold
  );
  allWarnings.push(...profitAnalysis.warnings);

  // 2. Inventory Analysis with distinct states
  const inventoryAnalysis = analyzeInventory(
    params.inventoryQuantity,
    params.inventoryTracked,
    params.locationName,
    params.minStockThreshold,
    params.hasInventoryRecord ?? true
  );
  allWarnings.push(...inventoryAnalysis.warnings);

  // 3. Discount Compatibility Analysis
  const discountAnalysis = analyzeDiscounts(params.discountData);
  allWarnings.push(...discountAnalysis.warnings);

  // 4. Determine overall status
  let status: "READY" | "REVIEW" | "BLOCKED" = "READY";
  if (allWarnings.some((w) => w.severity === "BLOCKER")) {
    status = "BLOCKED";
  } else if (allWarnings.some((w) => w.severity === "WARNING")) {
    status = "REVIEW";
  }

  // Strict invariant: Missing unit cost CANNOT produce a green Ready status
  if (profitAnalysis.costMissing || profitAnalysis.unitCost === null) {
    if (status === "READY") {
      status = "REVIEW";
    }
  }

  return {
    status,
    discountedPrice: profitAnalysis.discountedPrice,
    unitCost: profitAnalysis.unitCost,
    estimatedGrossProfit: profitAnalysis.grossProfit,
    estimatedGrossMargin: profitAnalysis.grossMargin,
    inventoryQuantity: inventoryAnalysis.quantity,
    inventoryTracked: inventoryAnalysis.isTracked,
    inventoryState: inventoryAnalysis.inventoryState,
    locationName: inventoryAnalysis.locationName,
    warnings: allWarnings,
    assumptions: PROMO_LINT_ASSUMPTIONS_TEXT,
    evaluatedAt: new Date().toISOString(),
  };
}
