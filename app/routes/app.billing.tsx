import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useActionData, useLoaderData, useNavigation, Form } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Badge,
  Banner,
  Divider,
  List,
  Box,
} from "@shopify/polaris";
import { authenticate, PRO_MONTHLY_PLAN } from "../shopify.server";
import {
  checkSubscriptionStatus,
  cancelSubscription,
  isTestBilling,
  calculateFirstChargeDate,
  PLAN_PRICE_USD,
  PLAN_TRIAL_DAYS,
  FREE_TIER_CHECK_LIMIT,
} from "../services/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const url = new URL(request.url);
  const justConfirmed = url.searchParams.get("confirmed") === "1";

  const billingStatus = await checkSubscriptionStatus(billing, session.shop);
  const estimatedFirstChargeDate = calculateFirstChargeDate(PLAN_TRIAL_DAYS);

  return json({
    billingStatus,
    justConfirmed,
    estimatedFirstChargeDate: estimatedFirstChargeDate.toISOString(),
    planName: PRO_MONTHLY_PLAN,
    planPrice: PLAN_PRICE_USD,
    trialDays: PLAN_TRIAL_DAYS,
    freeLimit: FREE_TIER_CHECK_LIMIT,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "upgrade") {
    const shopSubdomain = session.shop.replace(".myshopify.com", "");
    const apiKey = process.env.SHOPIFY_API_KEY || "651686b64c50cd458dfa630df85781d5";
    // Direct the returnUrl to the Shopify Admin embedded app path so merchants remain in the admin
    const returnUrl = `https://admin.shopify.com/store/${shopSubdomain}/apps/${apiKey}/app/billing?confirmed=1`;

    try {
      // billing.request initiates Shopify's subscription confirmation screen and throws the redirect
      await billing.request({
        plan: PRO_MONTHLY_PLAN as any,
        isTest: isTestBilling(),
        returnUrl,
      });
    } catch (err: any) {
      if (err instanceof Response) {
        throw err;
      }
      const rawMsg =
        err?.errorData?.[0]?.message ||
        err?.message ||
        "Shopify Billing API rejected the subscription request.";
      let userMsg = rawMsg;
      if (rawMsg.includes("public distribution")) {
        userMsg =
          "Shopify Billing API requires Public Distribution. To enable test and live charges, open your Shopify Partner Dashboard > Apps > PromoLint > Distribution, and select 'Public distribution' (or create a draft App Store listing). Apps without public distribution are restricted by Shopify from using recurring billing.";
      }
      return json({ success: false, message: "", error: userMsg });
    }
  }

  if (intent === "cancel") {
    const subscriptionId = formData.get("subscriptionId") as string;
    if (subscriptionId) {
      try {
        await cancelSubscription(billing, session.shop, subscriptionId);
        return json({
          success: true,
          message: "Subscription cancelled successfully. You are now on the Free tier.",
          error: "",
        });
      } catch (err: any) {
        if (err instanceof Response) throw err;
        return json({
          success: false,
          message: "",
          error: err?.message || "Failed to cancel subscription with Shopify.",
        });
      }
    }
  }

  return json({ success: false, message: "", error: "" });
};

function formatBillingDate(date: Date | string | null | undefined): string {
  if (!date) return "N/A";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function BillingScreen() {
  const {
    billingStatus,
    justConfirmed,
    estimatedFirstChargeDate,
    planName,
    planPrice,
    trialDays,
    freeLimit,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const isPro = billingStatus.hasActivePro;
  const isTrial = billingStatus.status === "TRIAL";
  const checksLeft = Math.max(0, freeLimit - billingStatus.freeChecksUsed);

  const displayChargeDate = formatBillingDate(
    billingStatus.firstChargeDate || estimatedFirstChargeDate
  );

  return (
    <Page
      title="Plan & Billing"
      subtitle="Transparent, predictable pricing with a 3-day free trial"
      backAction={{ content: "Dashboard", url: "/app" }}
    >
      <BlockStack gap="500">
        {justConfirmed && isPro && (
          <Banner title="Subscription confirmed" tone="success">
            <p>
              Your 3-day free trial for <strong>{planName}</strong> is now active.
              Your first monthly charge of ${planPrice.toFixed(2)} USD will occur on {displayChargeDate}.
              You can cancel anytime before then with zero charges.
            </p>
          </Banner>
        )}

        {actionData?.message && (
          <Banner title="Subscription updated" tone="info">
            <p>{actionData.message}</p>
          </Banner>
        )}

        {actionData?.error && (
          <Banner title="Subscription Action Notice" tone="critical">
            <p>{actionData.error}</p>
          </Banner>
        )}

        {billingStatus.isTest && (
          <Banner title="Development / Test Billing Mode" tone="info">
            <p>
              This app is currently operating in test billing mode. Charges approved on this store are simulated
              using Shopify test billing and will not appear on a real credit card or invoice.
            </p>
          </Banner>
        )}

        {/* Current Subscription Status Card */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                Current Subscription
              </Text>
              <Badge tone={isPro ? "success" : "info"}>
                {isTrial
                  ? "Active (3-Day Free Trial)"
                  : isPro
                  ? "Active (Pro Monthly)"
                  : "Free Tier"}
              </Badge>
            </InlineStack>

            <Divider />

            {isPro ? (
              <BlockStack gap="300">
                <Text as="p" variant="bodyMd">
                  Your store is subscribed to <strong>{planName}</strong> at{" "}
                  <strong>${planPrice.toFixed(2)} USD / month</strong>.
                </Text>
                {isTrial && (
                  <Banner title="Free Trial Active" tone="success">
                    <p>
                      You are in your 3-day complimentary evaluation period. Your first recurring charge of $
                      {planPrice.toFixed(2)} USD will be billed on <strong>{displayChargeDate}</strong>.
                    </p>
                  </Banner>
                )}
                <InlineStack gap="400">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Subscription ID: {billingStatus.subscriptionId || "Active in Shopify"}
                  </Text>
                  {billingStatus.currentPeriodEnd && (
                    <Text as="p" variant="bodySm" tone="subdued">
                      Billing Cycle Renews: {formatBillingDate(billingStatus.currentPeriodEnd)}
                    </Text>
                  )}
                </InlineStack>

                <Box paddingBlockStart="300">
                  <Form method="post">
                    <input type="hidden" name="intent" value="cancel" />
                    <input
                      type="hidden"
                      name="subscriptionId"
                      value={billingStatus.subscriptionId || ""}
                    />
                    <Button
                      tone="critical"
                      variant="plain"
                      submit
                      loading={isSubmitting}
                    >
                      Cancel subscription and revert to Free tier
                    </Button>
                  </Form>
                </Box>
              </BlockStack>
            ) : (
              <BlockStack gap="300">
                <Text as="p" variant="bodyMd">
                  You are currently on the <strong>Free Tier</strong>.
                </Text>
                <Text as="p" variant="bodyMd" tone={checksLeft === 0 ? "critical" : "subdued"}>
                  Usage: <strong>{billingStatus.freeChecksUsed}</strong> of <strong>{freeLimit}</strong> free offer audits used.
                  {checksLeft === 0
                    ? " You have reached the free audit limit. Upgrade to Pro for unlimited pre-flight audits."
                    : ` You have ${checksLeft} free ${checksLeft === 1 ? "audit" : "audits"} remaining.`}
                </Text>
              </BlockStack>
            )}
          </BlockStack>
        </Card>

        {/* Plan Comparison Layout */}
        <Layout>
          {/* Free Tier Card */}
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h3" variant="headingMd">
                    Free Tier
                  </Text>
                  <Text as="p" variant="headingLg">
                    $0
                  </Text>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  Basic promotion QA for stores testing PromoLint
                </Text>

                <Divider />

                <List type="bullet">
                  <List.Item>Up to 5 total pre-flight offer audits</List.Item>
                  <List.Item>Live Shopify catalog price & variant lookup</List.Item>
                  <List.Item>Real-time location inventory availability check</List.Item>
                  <List.Item>Missing unit cost and untracked stock alerts</List.Item>
                  <List.Item>Basic margin & break-even calculation</List.Item>
                </List>

                <Box paddingBlockStart="400">
                  <Button disabled fullWidth>
                    Current Plan
                  </Button>
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Pro Monthly Card */}
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h3" variant="headingMd">
                    {planName}
                  </Text>
                  <Badge tone="success">Recommended</Badge>
                </InlineStack>

                <InlineStack gap="100" blockAlign="baseline">
                  <Text as="span" variant="headingXl">
                    ${planPrice.toFixed(2)}
                  </Text>
                  <Text as="span" variant="bodyMd" tone="subdued">
                    USD / month
                  </Text>
                </InlineStack>

                <Text as="p" variant="bodySm" tone="subdued">
                  Full pre-flight promotion assurance for growing brands
                </Text>

                <Banner tone="info">
                  <Text as="p" variant="bodySm">
                    <strong>3-day free trial included.</strong> You will not be charged today. First charge of ${planPrice.toFixed(2)} USD on <strong>{displayChargeDate}</strong>.
                  </Text>
                </Banner>

                <Divider />

                <List type="bullet">
                  <List.Item>
                    <strong>Unlimited</strong> offer pre-flight checks
                  </List.Item>
                  <List.Item>
                    <strong>CSV Export</strong> of all audit history records
                  </List.Item>
                  <List.Item>
                    <strong>Automated discount stacking audits</strong> against active store codes
                  </List.Item>
                  <List.Item>
                    <strong>Break-even solver</strong> for target gross-margin thresholds
                  </List.Item>
                  <List.Item>
                    <strong>Multi-location inventory validation</strong> across fulfillment hubs
                  </List.Item>
                  <List.Item>
                    <strong>Duplicate & re-check workflows</strong> for rapid promotion iterations
                  </List.Item>
                </List>

                <Box paddingBlockStart="400">
                  {isPro ? (
                    <Button fullWidth disabled>
                      {isTrial ? "Trial Active" : "Active Plan"}
                    </Button>
                  ) : (
                    <Form method="post">
                      <input type="hidden" name="intent" value="upgrade" />
                      <Button
                        variant="primary"
                        fullWidth
                        submit
                        loading={isSubmitting}
                      >
                        Start 3-Day Free Trial ($19.99/mo)
                      </Button>
                    </Form>
                  )}
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* FAQ & Billing Terms */}
        <Card>
          <BlockStack gap="300">
            <Text as="h3" variant="headingMd">
              Billing Terms & Shopify Subscription Guarantee
            </Text>
            <Divider />
            <Text as="p" variant="bodyMd">
              <strong>How does the 3-day free trial work?</strong>
              <br />
              When you click "Start 3-Day Free Trial", you are redirected to Shopify’s official subscription approval screen. You will have 3 full days to evaluate PromoLint Pro. No funds are deducted until the trial period expires.
            </Text>
            <Text as="p" variant="bodyMd">
              <strong>How do I cancel?</strong>
              <br />
              You can cancel your subscription at any time with a single click from this page or directly within your Shopify Admin under Settings &gt; Apps and sales channels.
            </Text>
            <Text as="p" variant="bodyMd">
              <strong>How are charges billed?</strong>
              <br />
              All subscription fees are billed directly through your existing Shopify invoice every 30 days. PromoLint never handles or stores your credit card details.
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
