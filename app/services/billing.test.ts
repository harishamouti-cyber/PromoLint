import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  PLAN_PRICE_USD,
  PLAN_TRIAL_DAYS,
  FREE_TIER_CHECK_LIMIT,
  calculateFirstChargeDate,
  formatBillingDate,
  isTestBilling,
  checkSubscriptionStatus,
  handleSubscriptionWebhookUpdate,
} from "./billing.server";
import { PRO_MONTHLY_PLAN } from "../shopify.server";
import prisma from "../db.server";

describe("PromoLint Billing Configuration & Helpers", () => {
  it("enforces exact plan pricing and trial specifications", () => {
    expect(PRO_MONTHLY_PLAN).toBe("PromoLint Pro Monthly");
    expect(PLAN_PRICE_USD).toBe(19.99);
    expect(PLAN_TRIAL_DAYS).toBe(3);
    expect(FREE_TIER_CHECK_LIMIT).toBe(5);
  });

  it("calculates first charge date accurately for a 3-day trial", () => {
    const before = new Date();
    const chargeDate = calculateFirstChargeDate(3);
    const diffMs = chargeDate.getTime() - before.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(3);
  });

  it("formats dates into readable merchant-friendly strings", () => {
    const formatted = formatBillingDate("2026-10-17T12:00:00.000Z");
    expect(formatted).toContain("October");
    expect(formatted).toContain("2026");

    expect(formatBillingDate(null)).toBe("N/A");
    expect(formatBillingDate("invalid-date")).toBe("N/A");
  });

  describe("isTestBilling()", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("returns true when SHOPIFY_BILLING_TEST is explicitly true", () => {
      process.env.SHOPIFY_BILLING_TEST = "true";
      process.env.NODE_ENV = "production";
      expect(isTestBilling()).toBe(true);
    });

    it("returns false when SHOPIFY_BILLING_TEST is explicitly false in production", () => {
      process.env.SHOPIFY_BILLING_TEST = "false";
      process.env.NODE_ENV = "production";
      expect(isTestBilling()).toBe(false);
    });

    it("defaults to true in non-production environments", () => {
      delete process.env.SHOPIFY_BILLING_TEST;
      process.env.NODE_ENV = "development";
      expect(isTestBilling()).toBe(true);
    });
  });

  describe("checkSubscriptionStatus()", () => {
    const testShop = "test-billing-store.myshopify.com";

    it("returns Free tier status when merchant has no active subscription", async () => {
      const mockBilling = {
        check: vi.fn().mockResolvedValue({
          hasActivePayment: false,
          appSubscriptions: [],
        }),
      };

      const status = await checkSubscriptionStatus(mockBilling, testShop);
      expect(status.hasActivePro).toBe(false);
      expect(status.plan).toBe("FREE");
      expect(status.canExportCsv).toBe(false);
      expect(status.freeCheckLimit).toBe(5);
    });

    it("identifies active 3-day trial subscription when payment is confirmed", async () => {
      const recentDate = new Date().toISOString();
      const mockBilling = {
        check: vi.fn().mockResolvedValue({
          hasActivePayment: true,
          appSubscriptions: [
            {
              id: "gid://shopify/AppSubscription/99887766",
              name: "PromoLint Pro Monthly",
              test: true,
              status: "ACTIVE",
              createdAt: recentDate,
              currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
            },
          ],
        }),
      };

      const status = await checkSubscriptionStatus(mockBilling, testShop);
      expect(status.hasActivePro).toBe(true);
      expect(status.plan).toBe("PRO_MONTHLY");
      expect(status.status).toBe("TRIAL");
      expect(status.canExportCsv).toBe(true);
      expect(status.canRunAudit).toBe(true);
    });
  });

  describe("handleSubscriptionWebhookUpdate()", () => {
    const webhookShop = "webhook-test-store.myshopify.com";

    it("updates local state to CANCELLED on cancellation webhook", async () => {
      await handleSubscriptionWebhookUpdate(webhookShop, {
        admin_graphql_api_id: "gid://shopify/AppSubscription/112233",
        status: "CANCELLED",
      });

      const record = await prisma.promoLintBilling.findUnique({
        where: { shop: webhookShop },
      });

      expect(record).toBeDefined();
      expect(record?.status).toBe("CANCELLED");
      expect(record?.plan).toBe("FREE");
    });

    it("updates local state to ACTIVE on approval webhook", async () => {
      await handleSubscriptionWebhookUpdate(webhookShop, {
        admin_graphql_api_id: "gid://shopify/AppSubscription/112233",
        status: "ACTIVE",
        current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
      });

      const record = await prisma.promoLintBilling.findUnique({
        where: { shop: webhookShop },
      });

      expect(record).toBeDefined();
      expect(record?.status).toBe("ACTIVE");
      expect(record?.plan).toBe("PRO_MONTHLY");
    });
  });
});
