import prisma from "../db.server";
import type { OfferEvaluationResult, DiscountType } from "./offer-analyzer";

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
      warnings: JSON.stringify(input.evaluation.warnings),
      assumptions: input.evaluation.assumptions,
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
