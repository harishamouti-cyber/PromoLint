import prisma from "../db.server";
import {
  evaluateOfferCheck,
  type OfferEvaluationResult,
  type DiscountType,
} from "./offer-analyzer";
import {
  fetchProductsForOfferCheck,
  fetchStoreLocations,
  fetchInventoryAvailable,
  fetchActiveDiscounts,
} from "./shopify-catalog.server";
import { getShopSettings } from "./settings.server";

export interface CreateOfferCheckInput {
  shop: string;
  triggerProductId: string;
  triggerProductTitle: string;
  triggerVariantId: string;
  triggerVariantTitle: string;
  triggerVariantSku?: string | null;
  offeredProductId: string;
  offeredProductTitle: string;
  offeredVariantId: string;
  offeredVariantTitle: string;
  offeredVariantSku?: string | null;
  offeredProductImageUrl?: string | null;
  offerQuantity?: number;
  discountType: DiscountType;
  discountValue: number;
  currencyCode?: string;
  currentPrice: number;
  locationId: string;
  locationName: string;
  evaluation: OfferEvaluationResult;
  recheckOfId?: string | null;
  duplicatedFromId?: string | null;
}

export async function createOfferCheck(input: CreateOfferCheckInput) {
  return await prisma.offerCheck.create({
    data: {
      shop: input.shop,
      status: input.evaluation.status,
      triggerProductId: input.triggerProductId,
      triggerProductTitle: input.triggerProductTitle,
      triggerVariantId: input.triggerVariantId,
      triggerVariantTitle: input.triggerVariantTitle,
      triggerVariantSku: input.triggerVariantSku || null,
      offeredProductId: input.offeredProductId,
      offeredProductTitle: input.offeredProductTitle,
      offeredVariantId: input.offeredVariantId,
      offeredVariantTitle: input.offeredVariantTitle,
      offeredVariantSku: input.offeredVariantSku || null,
      offeredProductImageUrl: input.offeredProductImageUrl || null,
      offerQuantity: input.offerQuantity || input.evaluation.offerQuantity || 1,
      discountType: input.discountType,
      discountValue: input.discountValue,
      currencyCode: input.currencyCode || "USD",
      currentPrice: input.currentPrice,
      unitCost: input.evaluation.unitCost,
      costSource: input.evaluation.costSource,
      discountedPrice: input.evaluation.discountedPrice,
      estimatedGrossProfit: input.evaluation.estimatedGrossProfit,
      estimatedGrossMargin: input.evaluation.estimatedGrossMargin,
      totalRevenue: input.evaluation.totalRevenue,
      totalCost: input.evaluation.totalCost,
      totalGrossProfit: input.evaluation.totalGrossProfit,
      breakEvenPrice: input.evaluation.breakEven.targetMarginPrice,
      maxDiscountAmount: input.evaluation.breakEven.maxDiscountAmount,
      locationId: input.locationId,
      locationName: input.locationName,
      inventoryQuantity: input.evaluation.inventoryQuantity,
      inventoryTracked: input.evaluation.inventoryTracked,
      inventoryState: input.evaluation.inventoryState,
      warnings: JSON.stringify(input.evaluation.warnings),
      assumptions: input.evaluation.assumptions,
      discountAssumptions: input.evaluation.discountAssumptions,
      recheckOfId: input.recheckOfId || null,
      duplicatedFromId: input.duplicatedFromId || null,
    },
  });
}

export interface FilterOfferChecksOptions {
  searchQuery?: string;
  status?: string;
  discountType?: string;
  dateRange?: string;
  limit?: number;
}

export async function getRecentOfferChecks(
  shop: string,
  options: number | FilterOfferChecksOptions = 20
) {
  let limit = 20;
  const where: any = { shop };

  if (typeof options === "number") {
    limit = options;
  } else {
    limit = options.limit || 50;

    if (options.searchQuery && options.searchQuery.trim().length > 0) {
      const q = options.searchQuery.trim();
      where.OR = [
        { triggerProductTitle: { contains: q } },
        { offeredProductTitle: { contains: q } },
        { triggerVariantTitle: { contains: q } },
        { offeredVariantTitle: { contains: q } },
        { triggerVariantSku: { contains: q } },
        { offeredVariantSku: { contains: q } },
      ];
    }

    if (options.status && options.status !== "ALL") {
      where.status = options.status;
    }

    if (options.discountType && options.discountType !== "ALL") {
      where.discountType = options.discountType;
    }

    if (options.dateRange) {
      const now = Date.now();
      if (options.dateRange === "24h") {
        where.createdAt = { gte: new Date(now - 24 * 60 * 60 * 1000) };
      } else if (options.dateRange === "7d") {
        where.createdAt = { gte: new Date(now - 7 * 24 * 60 * 60 * 1000) };
      } else if (options.dateRange === "30d") {
        where.createdAt = { gte: new Date(now - 30 * 24 * 60 * 60 * 1000) };
      }
    }
  }

  return await prisma.offerCheck.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getOfferCheckById(shop: string, id: string) {
  return await prisma.offerCheck.findFirst({
    where: {
      id,
      shop, // strictly enforced tenant isolation
    },
  });
}

export interface OfferCheckMetrics {
  totalChecks: number;
  readyChecks: number;
  reviewChecks: number;
  blockedChecks: number;
  latestCheckDate: string | null;
}

export async function getOfferCheckMetrics(shop: string): Promise<OfferCheckMetrics> {
  const [totalChecks, readyChecks, reviewChecks, blockedChecks, latestCheck] = await Promise.all([
    prisma.offerCheck.count({ where: { shop } }),
    prisma.offerCheck.count({ where: { shop, status: "READY" } }),
    prisma.offerCheck.count({ where: { shop, status: "REVIEW" } }),
    prisma.offerCheck.count({ where: { shop, status: "BLOCKED" } }),
    prisma.offerCheck.findFirst({
      where: { shop },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  return {
    totalChecks,
    readyChecks,
    reviewChecks,
    blockedChecks,
    latestCheckDate: latestCheck?.createdAt ? latestCheck.createdAt.toISOString() : null,
  };
}

function escapeCsvCell(val: any): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function formatOfferChecksToCsv(checks: any[]): string {
  const headers = [
    "Check ID",
    "Checked At",
    "Status",
    "Scenario Trigger Product",
    "Scenario Trigger Product ID",
    "Scenario Trigger Variant",
    "Scenario Trigger Variant ID",
    "Scenario Trigger SKU",
    "Offered Product",
    "Offered Product ID",
    "Offered Variant",
    "Offered Variant ID",
    "Offered Variant SKU",
    "Offer Quantity",
    "Discount Type",
    "Discount Value",
    "Catalog Price",
    "Currency",
    "Effective Unit Cost",
    "Cost Source",
    "Est Selling Price Per Unit",
    "Est Gross Profit Per Unit",
    "Est Gross Margin Pct",
    "Total Bundle Revenue",
    "Total Bundle Cost",
    "Total Bundle Gross Profit",
    "Target Margin Benchmark Price",
    "Max Allowable Discount",
    "Fulfillment Location",
    "Location ID",
    "Inventory Tracked",
    "Inventory Available Qty",
    "Inventory State",
    "Findings Count",
    "Findings Summary",
    "Recheck Of ID",
    "Duplicated From ID",
    "Standard Exclusions",
  ];

  const rows = checks.map((c) => {
    let findingsCount = 0;
    let findingsSummary = "";
    try {
      const parsedWarnings = JSON.parse(c.warnings || "[]");
      findingsCount = parsedWarnings.length;
      findingsSummary = parsedWarnings.map((w: any) => `[${w.findingLevel || w.severity}] ${w.code}: ${w.message}`).join(" | ");
    } catch {
      findingsSummary = "";
    }

    const standardExclusions =
      "Advisory pre-launch estimate. Excludes customer shipping costs, sales taxes/duties, payment processing fees (e.g. 2.9% + 30¢), fulfillment labor, packaging, overhead, and customer returns.";

    return [
      escapeCsvCell(c.id),
      escapeCsvCell(new Date(c.createdAt).toISOString()),
      escapeCsvCell(c.status),
      escapeCsvCell(c.triggerProductTitle),
      escapeCsvCell(c.triggerProductId),
      escapeCsvCell(c.triggerVariantTitle),
      escapeCsvCell(c.triggerVariantId),
      escapeCsvCell(c.triggerVariantSku || ""),
      escapeCsvCell(c.offeredProductTitle),
      escapeCsvCell(c.offeredProductId),
      escapeCsvCell(c.offeredVariantTitle),
      escapeCsvCell(c.offeredVariantId),
      escapeCsvCell(c.offeredVariantSku || ""),
      escapeCsvCell(c.offerQuantity || 1),
      escapeCsvCell(c.discountType),
      escapeCsvCell(c.discountValue),
      escapeCsvCell(c.currentPrice),
      escapeCsvCell(c.currencyCode || "USD"),
      escapeCsvCell(c.unitCost !== null ? c.unitCost : "Missing"),
      escapeCsvCell(c.costSource),
      escapeCsvCell(c.discountedPrice),
      escapeCsvCell(c.estimatedGrossProfit !== null ? c.estimatedGrossProfit : "N/A"),
      escapeCsvCell(c.estimatedGrossMargin !== null ? `${c.estimatedGrossMargin}%` : "N/A"),
      escapeCsvCell(c.totalRevenue !== null ? c.totalRevenue : "N/A"),
      escapeCsvCell(c.totalCost !== null ? c.totalCost : "N/A"),
      escapeCsvCell(c.totalGrossProfit !== null ? c.totalGrossProfit : "N/A"),
      escapeCsvCell(c.breakEvenPrice !== null ? c.breakEvenPrice : "N/A"),
      escapeCsvCell(c.maxDiscountAmount !== null ? c.maxDiscountAmount : "N/A"),
      escapeCsvCell(c.locationName),
      escapeCsvCell(c.locationId),
      escapeCsvCell(c.inventoryTracked ? "Yes" : "No"),
      escapeCsvCell(c.inventoryQuantity !== null ? c.inventoryQuantity : "N/A"),
      escapeCsvCell(c.inventoryState),
      escapeCsvCell(findingsCount),
      escapeCsvCell(findingsSummary),
      escapeCsvCell(c.recheckOfId || ""),
      escapeCsvCell(c.duplicatedFromId || ""),
      escapeCsvCell(standardExclusions),
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\r\n");
}

export async function deleteOfferCheck(shop: string, id: string) {
  return await prisma.offerCheck.deleteMany({
    where: {
      id,
      shop, // strictly enforced tenant isolation
    },
  });
}

/**
 * Re-audit an offer using current live Shopify data without overwriting historical records.
 * Creates a brand-new time-stamped snapshot linked via recheckOfId.
 */
export async function recheckExistingOfferCheck(
  admin: any,
  shop: string,
  checkId: string
) {
  const original = await getOfferCheckById(shop, checkId);
  if (!original) {
    throw new Error("Original offer check not found");
  }

  // Fetch current live catalog data
  const [catalogProducts, locations, settings] = await Promise.all([
    fetchProductsForOfferCheck(admin, undefined, 100),
    fetchStoreLocations(admin, 20),
    getShopSettings(shop),
  ]);

  const triggerProduct = catalogProducts.find((p) => p.id === original.triggerProductId);
  const triggerVariant = triggerProduct?.variants.find((v) => v.id === original.triggerVariantId);

  const offeredProduct = catalogProducts.find((p) => p.id === original.offeredProductId);
  const offeredVariant = offeredProduct?.variants.find((v) => v.id === original.offeredVariantId);

  if (!triggerProduct || !triggerVariant) {
    throw new Error("Trigger product or variant is no longer found in your active Shopify catalog.");
  }
  if (!offeredProduct || !offeredVariant) {
    throw new Error("Offered product or variant is no longer found in your active Shopify catalog.");
  }

  const selectedLocation = locations.find((l) => l.id === original.locationId);
  const locationName = selectedLocation ? selectedLocation.name : original.locationName;

  // Check live inventory at chosen location
  let inventoryQuantity: number | null = null;
  let hasInventoryRecord = true;
  const isInventoryTracked = offeredVariant.inventoryManagement === "SHOPIFY";

  if (isInventoryTracked && offeredVariant.inventoryItemId) {
    const invResult = await fetchInventoryAvailable(
      admin,
      offeredVariant.inventoryItemId,
      original.locationId
    );
    inventoryQuantity = invResult.available;
    hasInventoryRecord = invResult.hasInventoryRecord;
  }

  // Check live active store discounts
  const discountData = await fetchActiveDiscounts(admin, 25);

  const offerQuantity = original.offerQuantity || 1;

  // If original had a manual cost assumption and Shopify still lacks a unit cost, carry it forward
  const customCostAssumption =
    offeredVariant.unitCost === null && original.costSource?.includes("Merchant manual cost assumption")
      ? original.unitCost
      : null;

  const evaluation = evaluateOfferCheck({
    currentPrice: offeredVariant.price,
    unitCost: offeredVariant.unitCost,
    customCostAssumption,
    offerQuantity,
    discountType: original.discountType as DiscountType,
    discountValue: original.discountValue,
    currencyCode: offeredVariant.currencyCode,
    inventoryQuantity,
    inventoryTracked: isInventoryTracked,
    hasInventoryRecord,
    locationName,
    minStockThreshold: settings.minStockThreshold,
    minMarginThreshold: settings.minMarginThreshold,
    discountData,
  });

  // Create a brand-new time-stamped check (does NOT mutate or overwrite original!)
  return await createOfferCheck({
    shop,
    triggerProductId: triggerProduct.id,
    triggerProductTitle: triggerProduct.title,
    triggerVariantId: triggerVariant.id,
    triggerVariantTitle: triggerVariant.title,
    triggerVariantSku: triggerVariant.sku,
    offeredProductId: offeredProduct.id,
    offeredProductTitle: offeredProduct.title,
    offeredVariantId: offeredVariant.id,
    offeredVariantTitle: offeredVariant.title,
    offeredVariantSku: offeredVariant.sku,
    offeredProductImageUrl: offeredVariant.imageUrl || offeredProduct.imageUrl,
    offerQuantity,
    discountType: original.discountType as DiscountType,
    discountValue: original.discountValue,
    currencyCode: offeredVariant.currencyCode,
    currentPrice: offeredVariant.price,
    locationId: original.locationId,
    locationName,
    evaluation,
    recheckOfId: original.id,
  });
}
