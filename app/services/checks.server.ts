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
  offeredProductId: string;
  offeredProductTitle: string;
  offeredVariantId: string;
  offeredVariantTitle: string;
  offeredProductImageUrl?: string | null;
  discountType: DiscountType;
  discountValue: number;
  currencyCode?: string;
  currentPrice: number;
  locationId: string;
  locationName: string;
  evaluation: OfferEvaluationResult;
  recheckOfId?: string | null;
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
      offeredProductId: input.offeredProductId,
      offeredProductTitle: input.offeredProductTitle,
      offeredVariantId: input.offeredVariantId,
      offeredVariantTitle: input.offeredVariantTitle,
      offeredProductImageUrl: input.offeredProductImageUrl || null,
      discountType: input.discountType,
      discountValue: input.discountValue,
      currencyCode: input.currencyCode || "USD",
      currentPrice: input.currentPrice,
      unitCost: input.evaluation.unitCost,
      discountedPrice: input.evaluation.discountedPrice,
      estimatedGrossProfit: input.evaluation.estimatedGrossProfit,
      estimatedGrossMargin: input.evaluation.estimatedGrossMargin,
      locationId: input.locationId,
      locationName: input.locationName,
      inventoryQuantity: input.evaluation.inventoryQuantity,
      inventoryTracked: input.evaluation.inventoryTracked,
      inventoryState: input.evaluation.inventoryState,
      warnings: JSON.stringify(input.evaluation.warnings),
      assumptions: input.evaluation.assumptions,
      recheckOfId: input.recheckOfId || null,
    },
  });
}

export async function getRecentOfferChecks(shop: string, limit = 20) {
  return await prisma.offerCheck.findMany({
    where: { shop },
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

  const evaluation = evaluateOfferCheck({
    currentPrice: offeredVariant.price,
    unitCost: offeredVariant.unitCost,
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
    offeredProductId: offeredProduct.id,
    offeredProductTitle: offeredProduct.title,
    offeredVariantId: offeredVariant.id,
    offeredVariantTitle: offeredVariant.title,
    offeredProductImageUrl: offeredVariant.imageUrl || offeredProduct.imageUrl,
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
