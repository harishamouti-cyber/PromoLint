/**
 * PromoLint Offer Analyzer
 * Pure domain logic for offer QA, profit estimates, stock analysis, and discount compatibility warnings.
 */

export type DiscountType = "PERCENTAGE" | "FIXED_AMOUNT" | "FIXED_PRICE";

export type WarningSeverity = "BLOCKER" | "WARNING" | "INFO";

export type FindingLevel = "Review" | "Warning" | "Good to know" | "Unable to verify";

export type InventoryState =
  | "IN_STOCK"
  | "LOW_STOCK"
  | "OUT_OF_STOCK"
  | "NOT_TRACKED"
  | "UNABLE_TO_VERIFY";

export interface OfferWarning {
  code: string;
  message: string;
  severity: WarningSeverity;
  findingLevel: FindingLevel;
}

export interface BreakEvenResult {
  breakEvenPrice: number | null; // Selling price to achieve exactly $0 profit (unit cost)
  targetMarginPrice: number | null; // Selling price to achieve the target gross margin %
  maxDiscountAmount: number | null; // Max discount in dollars from catalog price
  maxDiscountPercentage: number | null; // Max discount % from catalog price
  targetMarginPercentage: number;
  costAvailable: boolean;
  explanation: string;
}

export interface ProfitResult {
  discountedPrice: number;
  unitCost: number | null;
  costSource: string;
  grossProfit: number | null;
  grossMargin: number | null;
  costMissing: boolean;
  quantity: number;
  totalRevenue: number;
  totalCost: number | null;
  totalGrossProfit: number | null;
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
  customCostAssumption?: number | null;
  offerQuantity?: number;
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
  offerQuantity: number;
  discountedPrice: number;
  unitCost: number | null;
  costSource: string;
  estimatedGrossProfit: number | null;
  estimatedGrossMargin: number | null;
  totalRevenue: number;
  totalCost: number | null;
  totalGrossProfit: number | null;
  breakEven: BreakEvenResult;
  inventoryQuantity: number | null;
  inventoryTracked: boolean;
  inventoryState: InventoryState;
  locationName: string;
  warnings: OfferWarning[];
  assumptions: string;
  discountAssumptions: string;
  evaluatedAt: string;
}

export const PROMO_LINT_ASSUMPTIONS_TEXT =
  "Estimated gross profit per unit is calculated as (estimated selling price − unit cost). " +
  "It is an advisory gross estimate and explicitly excludes: customer shipping costs, sales taxes and duties, " +
  "payment gateway processing fees (e.g. 2.9% + 30¢), packaging materials, warehouse handling and fulfillment labor, " +
  "operating overhead, and customer returns/refunds. " +
  "Point-in-time inventory counts reflect stock observed at the selected location at the check timestamp and do not reserve stock. " +
  "Untracked inventory is not monitored and does not imply unlimited stock. " +
  "Discount findings highlight active store discount combination settings; they do not simulate checkout totals or customer eligibility. " +
  "PromoLint is an administrative audit tool: it does not publish offers, enforce cart conditions, or alter checkout.";

export const PROMO_LINT_DISCOUNT_ASSUMPTIONS_TEXT =
  "PromoLint inspects combination permissions (combinesWith) on active Shopify discounts. " +
  "This check inspects store-level combination settings only. It does not predict final checkout totals, " +
  "customer-specific eligibility, or automatic discount priority at checkout.";

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
 * Supports PERCENTAGE, FIXED_AMOUNT, and FIXED_PRICE.
 */
export function calculateDiscountedPrice(
  currentPrice: number,
  discountType: DiscountType,
  discountValue: number
): number {
  const safePrice = Math.max(0, roundToCents(currentPrice));
  const safeValue = Math.max(0, discountValue);

  if (discountType === "PERCENTAGE") {
    if (safeValue >= 100) {
      return 0;
    }
    const ratio = (100 - safeValue) / 100;
    return roundToCents(safePrice * ratio);
  } else if (discountType === "FIXED_AMOUNT") {
    const remaining = safePrice - roundToCents(safeValue);
    return Math.max(0, roundToCents(remaining));
  } else {
    // FIXED_PRICE: The discountValue is the proposed price directly
    return roundToCents(safeValue);
  }
}

/**
 * Calculate break-even price and maximum allowable discount to satisfy target gross margin.
 */
export function calculateBreakEven(
  currentPrice: number,
  unitCost: number | null | undefined,
  targetMarginThreshold = 20.0
): BreakEvenResult {
  if (unitCost === null || unitCost === undefined || isNaN(unitCost) || unitCost < 0) {
    return {
      breakEvenPrice: null,
      targetMarginPrice: null,
      maxDiscountAmount: null,
      maxDiscountPercentage: null,
      targetMarginPercentage: targetMarginThreshold,
      costAvailable: false,
      explanation:
        "Break-even benchmarks and maximum allowable discount cannot be calculated without a unit cost. Add a cost in Shopify or provide a cost assumption.",
    };
  }

  const safeCost = roundToCents(unitCost);
  const safePrice = Math.max(0, roundToCents(currentPrice));

  // Pure break-even (0% profit) is selling at unit cost
  const breakEvenPrice = safeCost;

  // Target margin price: Price where (Price - Cost) / Price = M / 100
  // Price * (1 - M/100) = Cost => Price = Cost / (1 - M/100)
  let targetMarginPrice = safeCost;
  if (targetMarginThreshold < 100) {
    targetMarginPrice = roundToCents(safeCost / (1 - targetMarginThreshold / 100));
  }

  // Maximum allowable discount from catalog price to maintain target margin
  const maxDiscountAmount = Math.max(0, roundToCents(safePrice - targetMarginPrice));
  const maxDiscountPercentage =
    safePrice > 0 ? roundPercentage((maxDiscountAmount / safePrice) * 100) : 0;

  return {
    breakEvenPrice,
    targetMarginPrice,
    maxDiscountAmount,
    maxDiscountPercentage,
    targetMarginPercentage: targetMarginThreshold,
    costAvailable: true,
    explanation: `To achieve your advisory gross margin threshold of ${targetMarginThreshold}%, this variant cannot sell below ${targetMarginPrice}. The maximum allowable discount from catalog price (${safePrice}) is ${maxDiscountAmount} (${maxDiscountPercentage}% off). Excludes shipping, taxes, and operating fees.`,
  };
}

/**
 * Calculate estimated gross profit and gross margin percentage.
 * Only returns calculations supported by available data.
 * Supports offer quantity and custom cost assumptions.
 */
export function calculateProfit(
  currentPrice: number,
  discountType: DiscountType,
  discountValue: number,
  shopifyUnitCost: number | null | undefined,
  minMarginThreshold = 20.0,
  quantity = 1,
  customCostAssumption?: number | null
): ProfitResult {
  const warnings: OfferWarning[] = [];
  const safeQuantity = Math.max(1, Math.floor(quantity));
  const discountedPrice = calculateDiscountedPrice(currentPrice, discountType, discountValue);

  // Validate discount boundaries
  if (discountType === "PERCENTAGE" && discountValue >= 100) {
    warnings.push({
      code: "FREE_OR_NEGATIVE_PRICE",
      message: "Proposed discount is 100% or greater, resulting in a $0.00 selling price.",
      severity: "BLOCKER",
      findingLevel: "Warning",
    });
  } else if (discountType === "FIXED_AMOUNT" && discountValue >= currentPrice) {
    warnings.push({
      code: "DISCOUNT_EXCEEDS_PRICE",
      message: `Proposed fixed discount (${discountValue}) meets or exceeds the current product price (${currentPrice}), resulting in a $0.00 selling price.`,
      severity: "BLOCKER",
      findingLevel: "Warning",
    });
  } else if (discountType === "FIXED_PRICE") {
    if (discountValue <= 0) {
      warnings.push({
        code: "FREE_OR_NEGATIVE_PRICE",
        message: "Proposed offer price is $0.00 or negative, resulting in a free giveaway.",
        severity: "BLOCKER",
        findingLevel: "Warning",
      });
    } else if (discountValue >= currentPrice) {
      warnings.push({
        code: "OFFER_PRICE_EXCEEDS_CATALOG",
        message: `Proposed offer price (${discountValue}) meets or exceeds the current catalog price (${currentPrice}). No discount incentive is provided in this scenario.`,
        severity: "INFO",
        findingLevel: "Good to know",
      });
    }
  }

  // Cost handling: prioritize Shopify cost; if missing, check for merchant assumption
  let effectiveUnitCost: number | null = null;
  let costSource = "None (Missing in Shopify)";
  let costMissing = true;

  const hasShopifyCost =
    shopifyUnitCost !== null &&
    shopifyUnitCost !== undefined &&
    !isNaN(shopifyUnitCost) &&
    shopifyUnitCost >= 0;

  const hasCustomAssumption =
    customCostAssumption !== null &&
    customCostAssumption !== undefined &&
    !isNaN(customCostAssumption) &&
    customCostAssumption >= 0;

  if (hasShopifyCost) {
    effectiveUnitCost = roundToCents(shopifyUnitCost);
    costSource = "Shopify Variant inventoryItem.unitCost";
    costMissing = false;
  } else if (hasCustomAssumption) {
    effectiveUnitCost = roundToCents(customCostAssumption);
    costSource = `Merchant manual cost assumption (${effectiveUnitCost}) — Not recorded in Shopify`;
    costMissing = false;
    warnings.push({
      code: "MANUAL_COST_ASSUMPTION_USED",
      message: `Gross profit calculations use your merchant-entered cost assumption of ${effectiveUnitCost} per unit. This cost assumption is not verified or saved in Shopify.`,
      severity: "INFO",
      findingLevel: "Good to know",
    });
  } else {
    warnings.push({
      code: "MISSING_PRODUCT_COST",
      message:
        "Profit can’t be estimated because no unit cost is recorded in Shopify for this variant. To provide a cost, open Shopify Admin > Products, select the variant, and enter a Cost per item under Pricing, or provide a cost assumption.",
      severity: "WARNING",
      findingLevel: "Unable to verify",
    });

    const totalRevenue = roundToCents(discountedPrice * safeQuantity);
    return {
      discountedPrice,
      unitCost: null,
      costSource: "None (Missing in Shopify)",
      grossProfit: null,
      grossMargin: null,
      costMissing: true,
      quantity: safeQuantity,
      totalRevenue,
      totalCost: null,
      totalGrossProfit: null,
      warnings,
    };
  }

  const grossProfit = roundToCents(discountedPrice - effectiveUnitCost);

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
      findingLevel: "Warning",
    });
  } else if (grossMargin !== null && grossMargin < minMarginThreshold) {
    warnings.push({
      code: "MARGIN_BELOW_THRESHOLD",
      message: `Estimated gross margin is ${grossMargin}%, which is below your configured merchant preference threshold of ${minMarginThreshold}%.`,
      severity: "WARNING",
      findingLevel: "Review",
    });
  }

  // Multi-unit totals for bundle and multi-item audits
  const totalRevenue = roundToCents(discountedPrice * safeQuantity);
  const totalCost = roundToCents(effectiveUnitCost * safeQuantity);
  const totalGrossProfit = roundToCents(grossProfit * safeQuantity);

  return {
    discountedPrice,
    unitCost: effectiveUnitCost,
    costSource,
    grossProfit,
    grossMargin,
    costMissing: false,
    quantity: safeQuantity,
    totalRevenue,
    totalCost,
    totalGrossProfit,
    warnings,
  };
}

/**
 * Analyze inventory levels against threshold, quantity, and tracking configuration.
 * Distinct states: IN_STOCK, LOW_STOCK, OUT_OF_STOCK, NOT_TRACKED, UNABLE_TO_VERIFY.
 * Never treats untracked inventory as unlimited stock.
 */
export function analyzeInventory(
  quantity: number | null | undefined,
  isTracked: boolean,
  locationName: string,
  minStockThreshold = 5,
  hasInventoryRecord = true,
  offerQuantity = 1
): InventoryAnalysisResult {
  const warnings: OfferWarning[] = [];
  const safeOfferQty = Math.max(1, Math.floor(offerQuantity));

  // State 1: Untracked in Shopify
  if (!isTracked) {
    warnings.push({
      code: "INVENTORY_NOT_TRACKED",
      message: `Inventory tracking is disabled for this variant in Shopify. PromoLint records this as untracked. Untracked inventory does not mean unlimited stock; physical availability cannot be verified or constrained at ${locationName}.`,
      severity: "INFO",
      findingLevel: "Good to know",
    });

    return {
      quantity: null,
      isTracked: false,
      inventoryState: "NOT_TRACKED",
      locationName,
      warnings,
    };
  }

  // State 2: Missing inventory record at location -> Unable to verify
  if (hasInventoryRecord === false) {
    warnings.push({
      code: "INVENTORY_RECORD_MISSING",
      message: `No inventory record exists for this variant at ${locationName}. Stock level is unable to verify for this location. Do not assume stock is available.`,
      severity: "WARNING",
      findingLevel: "Unable to verify",
    });

    return {
      quantity: null,
      isTracked: true,
      inventoryState: "UNABLE_TO_VERIFY",
      locationName,
      warnings,
    };
  }

  // State 3: Inventory level query error or unreadable -> Unable to verify
  if (quantity === null || quantity === undefined) {
    warnings.push({
      code: "INVENTORY_UNAVAILABLE",
      message: `Inventory level could not be retrieved from Shopify API for ${locationName}. Stock level is unable to verify. Do not assume stock is available.`,
      severity: "WARNING",
      findingLevel: "Unable to verify",
    });

    return {
      quantity: null,
      isTracked: true,
      inventoryState: "UNABLE_TO_VERIFY",
      locationName,
      warnings,
    };
  }

  // State 4: Out of stock (0 or negative oversold)
  if (quantity <= 0) {
    const isZero = quantity === 0;
    warnings.push({
      code: "OUT_OF_STOCK",
      message: isZero
        ? `Variant has 0 units available at ${locationName} (out of stock). Launching an offer with zero stock risks unfulfillable orders.`
        : `Variant has negative inventory (${quantity} units) at ${locationName} (oversold). Launching an offer with negative stock risks fulfillment failures.`,
      severity: "BLOCKER",
      findingLevel: "Warning",
    });

    return {
      quantity,
      isTracked: true,
      inventoryState: "OUT_OF_STOCK",
      locationName,
      warnings,
    };
  }

  // Check if stock is insufficient for the requested multi-unit bundle quantity
  if (quantity < safeOfferQty) {
    warnings.push({
      code: "INSUFFICIENT_STOCK_FOR_QUANTITY",
      message: `Selected location has only ${quantity} units available, which is less than the scenario offer quantity of ${safeOfferQty} units. Fulfilling an order for this bundle will exhaust or oversell inventory at ${locationName}.`,
      severity: "BLOCKER",
      findingLevel: "Warning",
    });

    return {
      quantity,
      isTracked: true,
      inventoryState: "LOW_STOCK",
      locationName,
      warnings,
    };
  }

  // State 5: Low stock below merchant-configured threshold
  if (quantity < minStockThreshold) {
    warnings.push({
      code: "LOW_STOCK_THRESHOLD",
      message: `Low inventory: Only ${quantity} units observed at ${locationName}, which is below your configured merchant preference threshold of ${minStockThreshold} units. This stock figure applies strictly to ${locationName}.`,
      severity: "WARNING",
      findingLevel: "Review",
    });

    return {
      quantity,
      isTracked: true,
      inventoryState: "LOW_STOCK",
      locationName,
      warnings,
    };
  }

  // State 6: In stock
  return {
    quantity,
    isTracked: true,
    inventoryState: "IN_STOCK",
    locationName,
    warnings,
  };
}

/**
 * Check active store discounts and combination permissions.
 * Does not claim complete checkout simulation.
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
    const reason = discountData?.unavailableReason || "Store discounts could not be queried or read_discounts permission is missing.";
    warnings.push({
      code: "DISCOUNT_CHECK_UNAVAILABLE",
      message: `Unable to verify active store discounts: ${reason}. Existing discounts and combination rules could not be audited.`,
      severity: "WARNING",
      findingLevel: "Unable to verify",
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
      message: `${stackableDiscounts.length} active store discount(s) have combination permissions enabled (${sampleTitles}). Shoppers might combine additional discounts at checkout. Note: PromoLint audits configured store combination rules only; checking combination settings does not predict final checkout totals, customer eligibility, or automated discount priority at checkout.`,
      severity: "WARNING",
      findingLevel: "Review",
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
  const offerQuantity = Math.max(1, Math.floor(params.offerQuantity || 1));

  // 1. Profit & Pricing Analysis
  const profitAnalysis = calculateProfit(
    params.currentPrice,
    params.discountType,
    params.discountValue,
    params.unitCost,
    params.minMarginThreshold,
    offerQuantity,
    params.customCostAssumption
  );
  allWarnings.push(...profitAnalysis.warnings);

  // 2. Break-Even Benchmark Analysis
  const breakEven = calculateBreakEven(
    params.currentPrice,
    profitAnalysis.unitCost,
    params.minMarginThreshold
  );

  // 3. Inventory Analysis with distinct states & bundle quantity check
  const inventoryAnalysis = analyzeInventory(
    params.inventoryQuantity,
    params.inventoryTracked,
    params.locationName,
    params.minStockThreshold,
    params.hasInventoryRecord ?? true,
    offerQuantity
  );
  allWarnings.push(...inventoryAnalysis.warnings);

  // 4. Discount Compatibility Analysis
  const discountAnalysis = analyzeDiscounts(params.discountData);
  allWarnings.push(...discountAnalysis.warnings);

  // 5. Determine overall status
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

  // Strict invariant: Unable to verify inventory or discounts cannot produce a green Ready status
  if (
    inventoryAnalysis.inventoryState === "UNABLE_TO_VERIFY" ||
    discountAnalysis.available === false
  ) {
    if (status === "READY") {
      status = "REVIEW";
    }
  }

  return {
    status,
    offerQuantity,
    discountedPrice: profitAnalysis.discountedPrice,
    unitCost: profitAnalysis.unitCost,
    costSource: profitAnalysis.costSource,
    estimatedGrossProfit: profitAnalysis.grossProfit,
    estimatedGrossMargin: profitAnalysis.grossMargin,
    totalRevenue: profitAnalysis.totalRevenue,
    totalCost: profitAnalysis.totalCost,
    totalGrossProfit: profitAnalysis.totalGrossProfit,
    breakEven,
    inventoryQuantity: inventoryAnalysis.quantity,
    inventoryTracked: inventoryAnalysis.isTracked,
    inventoryState: inventoryAnalysis.inventoryState,
    locationName: inventoryAnalysis.locationName,
    warnings: allWarnings,
    assumptions: PROMO_LINT_ASSUMPTIONS_TEXT,
    discountAssumptions: PROMO_LINT_DISCOUNT_ASSUMPTIONS_TEXT,
    evaluatedAt: new Date().toISOString(),
  };
}
