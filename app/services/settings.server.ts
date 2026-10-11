import prisma from "../db.server";

export interface ShopSettingsData {
  defaultLocationId: string | null;
  defaultLocationName: string | null;
  minStockThreshold: number;
  minMarginThreshold: number;
}

export const DEFAULT_SETTINGS: ShopSettingsData = {
  defaultLocationId: null,
  defaultLocationName: null,
  minStockThreshold: 5,
  minMarginThreshold: 20.0,
};

export async function getShopSettings(shop: string): Promise<ShopSettingsData> {
  const record = await prisma.promoLintSettings.findUnique({
    where: { shop },
  });

  if (!record) {
    return DEFAULT_SETTINGS;
  }

  return {
    defaultLocationId: record.defaultLocationId,
    defaultLocationName: record.defaultLocationName,
    minStockThreshold: record.minStockThreshold,
    minMarginThreshold: record.minMarginThreshold,
  };
}

export async function updateShopSettings(
  shop: string,
  data: Partial<ShopSettingsData>
): Promise<ShopSettingsData> {
  const updated = await prisma.promoLintSettings.upsert({
    where: { shop },
    create: {
      shop,
      defaultLocationId: data.defaultLocationId || null,
      defaultLocationName: data.defaultLocationName || null,
      minStockThreshold: data.minStockThreshold ?? DEFAULT_SETTINGS.minStockThreshold,
      minMarginThreshold: data.minMarginThreshold ?? DEFAULT_SETTINGS.minMarginThreshold,
    },
    update: {
      ...(data.defaultLocationId !== undefined ? { defaultLocationId: data.defaultLocationId } : {}),
      ...(data.defaultLocationName !== undefined ? { defaultLocationName: data.defaultLocationName } : {}),
      ...(data.minStockThreshold !== undefined ? { minStockThreshold: data.minStockThreshold } : {}),
      ...(data.minMarginThreshold !== undefined ? { minMarginThreshold: data.minMarginThreshold } : {}),
    },
  });

  return {
    defaultLocationId: updated.defaultLocationId,
    defaultLocationName: updated.defaultLocationName,
    minStockThreshold: updated.minStockThreshold,
    minMarginThreshold: updated.minMarginThreshold,
  };
}
