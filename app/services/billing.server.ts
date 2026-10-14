import prisma from "../db.server";
import { PRO_MONTHLY_PLAN } from "../shopify.server";

export const PLAN_PRICE_USD = 19.99;
export const PLAN_TRIAL_DAYS = 3;
export const FREE_TIER_CHECK_LIMIT = 5;

export interface StoreBillingSummary {
  plan: "FREE" | "PRO_MONTHLY";
  hasActivePro: boolean;
  status: "FREE" | "ACTIVE" | "TRIAL" | "CANCELLED" | "DECLINED" | "EXPIRED";
  subscriptionId: string | null;
  trialEndsAt: string | null;
  firstChargeDate: string | null;
  currentPeriodEnd: string | null;
  isTest: boolean;
  freeChecksUsed: number;
  freeCheckLimit: number;
  canRunAudit: boolean;
  canExportCsv: boolean;
}

/**
 * Determines whether billing operations should run in test mode.
 * Test mode is active in development, staging, or when SHOPIFY_BILLING_TEST=true.
 * In live production with real merchants, charges are real unless explicitly flagged.
 */
export function isTestBilling(): boolean {
  if (process.env.SHOPIFY_BILLING_TEST === "true") return true;
  if (process.env.SHOPIFY_BILLING_TEST === "false") return false;
  return process.env.NODE_ENV !== "production";
}

/**
 * Calculate expected first charge date for a 3-day trial starting now.
 */
export function calculateFirstChargeDate(trialDays: number = PLAN_TRIAL_DAYS): Date {
  const chargeDate = new Date();
  chargeDate.setDate(chargeDate.getDate() + trialDays);
  return chargeDate;
}

/**
 * Formats a Date object to a readable string (e.g., "October 17, 2026").
 */
export function formatBillingDate(date: Date | string | null | undefined): string {
  if (!date) return "N/A";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Count total historical offer checks run by a merchant shop.
 */
export async function getOfferCheckCountForShop(shop: string): Promise<number> {
  return await prisma.offerCheck.count({
    where: { shop },
  });
}

/**
 * Check and synchronize subscription status with Shopify Billing API.
 * Uses Shopify as the single source of truth and caches status in dev.sqlite.
 */
export async function checkSubscriptionStatus(
  billing: any,
  shop: string
): Promise<StoreBillingSummary> {
  const isTest = isTestBilling();
  const freeChecksUsed = await getOfferCheckCountForShop(shop);

  let shopifyBillingResult: any = null;
  try {
    shopifyBillingResult = await billing.check({
      plans: [PRO_MONTHLY_PLAN],
      isTest,
    });
  } catch (error) {
    console.error(`[PromoLint Billing] billing.check failed for ${shop}:`, error);
  }

  const hasActivePayment = Boolean(shopifyBillingResult?.hasActivePayment);
  const activeSubscription = shopifyBillingResult?.appSubscriptions?.[0] || null;

  let localRecord = await prisma.promoLintBilling.findUnique({
    where: { shop },
  });

  if (hasActivePayment && activeSubscription) {
    // Determine trial vs active
    const now = new Date();
    const currentPeriodEnd = activeSubscription.currentPeriodEnd
      ? new Date(activeSubscription.currentPeriodEnd)
      : null;
    
    // Shopify subscriptions in trial period typically have trialDays remaining
    const createdAt = activeSubscription.createdAt ? new Date(activeSubscription.createdAt) : now;
    const estimatedTrialEnd = new Date(createdAt);
    estimatedTrialEnd.setDate(estimatedTrialEnd.getDate() + PLAN_TRIAL_DAYS);
    const isCurrentlyInTrial = now < estimatedTrialEnd;

    const resolvedStatus = isCurrentlyInTrial ? "TRIAL" : "ACTIVE";

    localRecord = await prisma.promoLintBilling.upsert({
      where: { shop },
      create: {
        shop,
        plan: "PRO_MONTHLY",
        status: resolvedStatus,
        subscriptionId: activeSubscription.id,
        currentPeriodEnd,
        trialEndsAt: estimatedTrialEnd,
        isTest: Boolean(activeSubscription.test),
        lastConfirmedAt: now,
      },
      update: {
        plan: "PRO_MONTHLY",
        status: resolvedStatus,
        subscriptionId: activeSubscription.id,
        currentPeriodEnd,
        trialEndsAt: estimatedTrialEnd,
        isTest: Boolean(activeSubscription.test),
        lastConfirmedAt: now,
      },
    });

    return {
      plan: "PRO_MONTHLY",
      hasActivePro: true,
      status: resolvedStatus,
      subscriptionId: activeSubscription.id,
      trialEndsAt: localRecord.trialEndsAt ? localRecord.trialEndsAt.toISOString() : null,
      firstChargeDate: localRecord.trialEndsAt ? localRecord.trialEndsAt.toISOString() : null,
      currentPeriodEnd: localRecord.currentPeriodEnd ? localRecord.currentPeriodEnd.toISOString() : null,
      isTest: Boolean(activeSubscription.test),
      freeChecksUsed,
      freeCheckLimit: FREE_TIER_CHECK_LIMIT,
      canRunAudit: true,
      canExportCsv: true,
    };
  }

  // Not active on Shopify
  if (localRecord && (localRecord.status === "ACTIVE" || localRecord.status === "TRIAL")) {
    // Local record was active but Shopify returned false -> update local record
    localRecord = await prisma.promoLintBilling.update({
      where: { shop },
      data: {
        status: "CANCELLED",
        plan: "FREE",
      },
    });
  }

  const canRunAudit = freeChecksUsed < FREE_TIER_CHECK_LIMIT;

  return {
    plan: "FREE",
    hasActivePro: false,
    status: localRecord?.status === "CANCELLED" ? "CANCELLED" : "FREE",
    subscriptionId: localRecord?.subscriptionId || null,
    trialEndsAt: null,
    firstChargeDate: null,
    currentPeriodEnd: null,
    isTest,
    freeChecksUsed,
    freeCheckLimit: FREE_TIER_CHECK_LIMIT,
    canRunAudit,
    canExportCsv: false,
  };
}

/**
 * Cancels an active merchant subscription on Shopify and updates local state.
 */
export async function cancelSubscription(
  billing: any,
  shop: string,
  subscriptionId: string
) {
  const isTest = isTestBilling();

  try {
    await billing.cancel({
      subscriptionId,
      isTest,
      prorate: true,
    });
  } catch (error) {
    console.error(`[PromoLint Billing] billing.cancel failed for ${shop}:`, error);
    throw error;
  }

  return await prisma.promoLintBilling.upsert({
    where: { shop },
    create: {
      shop,
      plan: "FREE",
      status: "CANCELLED",
      subscriptionId,
      isTest,
    },
    update: {
      plan: "FREE",
      status: "CANCELLED",
    },
  });
}

/**
 * Handle APP_SUBSCRIPTIONS_UPDATE webhook idempotently.
 */
export async function handleSubscriptionWebhookUpdate(
  shop: string,
  appSubscription: {
    admin_graphql_api_id?: string;
    id?: string | number;
    status?: string;
    current_period_end?: string;
  }
) {
  if (!shop || !appSubscription) return;

  const rawStatus = (appSubscription.status || "").toUpperCase();
  const subscriptionId =
    appSubscription.admin_graphql_api_id ||
    (appSubscription.id ? `gid://shopify/AppSubscription/${appSubscription.id}` : null);

  let normalizedStatus: "ACTIVE" | "PENDING" | "CANCELLED" | "DECLINED" | "EXPIRED" = "PENDING";
  let plan = "FREE";

  if (rawStatus === "ACTIVE" || rawStatus === "ACCEPTED") {
    normalizedStatus = "ACTIVE";
    plan = "PRO_MONTHLY";
  } else if (rawStatus === "CANCELLED") {
    normalizedStatus = "CANCELLED";
    plan = "FREE";
  } else if (rawStatus === "DECLINED") {
    normalizedStatus = "DECLINED";
    plan = "FREE";
  } else if (rawStatus === "EXPIRED" || rawStatus === "FROZEN") {
    normalizedStatus = "EXPIRED";
    plan = "FREE";
  }

  const currentPeriodEnd = appSubscription.current_period_end
    ? new Date(appSubscription.current_period_end)
    : null;

  await prisma.promoLintBilling.upsert({
    where: { shop },
    create: {
      shop,
      plan,
      status: normalizedStatus,
      subscriptionId,
      currentPeriodEnd,
      lastConfirmedAt: new Date(),
    },
    update: {
      plan,
      status: normalizedStatus,
      subscriptionId: subscriptionId || undefined,
      currentPeriodEnd: currentPeriodEnd || undefined,
      lastConfirmedAt: new Date(),
    },
  });
}
